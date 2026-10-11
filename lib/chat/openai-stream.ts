// One streaming call to the Responses API, for a build: the same request as callModel's with stream: true,
// read as server-sent events. No retries, one overall time limit, and the key only in the header. It imports
// ./openai for its types, requestBody and parseResponse, and nothing else.

import { parseResponse, requestBody, RESPONSES_URL, type ModelOutcome, type ModelRequest, type Parsed } from "./openai";

export const STREAM_TIMEOUT_MS = 60_000;
// A stream with no blank line in this much text is not the Responses API's; stop reading it.
const MAX_BUFFER_CHARS = 1_000_000;

type ModelUsage = NonNullable<Parsed["usage"]>;
export type StreamOutcome =
	| { kind: "streamed"; text: string; status: string | null; incomplete: string | null; model: string | null; usage: ModelUsage | null; requestId: string | null }
	| Extract<ModelOutcome, { kind: "rejected" | "unknown" }>;

type SseEvent = { event: string; data: unknown };
type Json = Record<string, unknown>;

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

// Whole events from the front of a growing buffer, and the rest that has not finished arriving. An event ends at a blank
// line. Its name is its event line, or else the type inside its data; its data is the data lines joined, read as JSON when
// they are JSON and kept as text when they are not. Comments, and events with no data, are dropped.
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
	const text = buffer.replace(/\r\n?/g, "\n");
	const blocks = text.split("\n\n");
	const rest = blocks.pop() ?? "";
	const events: SseEvent[] = [];
	for (const block of blocks) {
		let name: string | null = null;
		const data: string[] = [];
		for (const line of block.split("\n")) {
			if (line === "" || line.startsWith(":")) continue;
			const colon = line.indexOf(":");
			const field = colon === -1 ? line : line.slice(0, colon);
			const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
			if (field === "event") name = value;
			else if (field === "data") data.push(value);
		}
		if (data.length === 0) continue;
		const joined = data.join("\n");
		let parsed: unknown = joined;
		try {
			parsed = JSON.parse(joined);
		} catch {
			// Not JSON: the text stands.
		}
		const event = name ?? (isJson(parsed) ? textOrNull(parsed.type) : null);
		if (event !== null) events.push({ event, data: parsed });
	}
	return { events, rest };
}

const ABORTED = Symbol("aborted");

// onDelta gets each piece of text as it arrives; returning false stops the stream (the build has all it will take), which
// aborts the request and returns what was read, with no counts. A terminal event ends the read with OpenAI's own counts.
// A failure, a drop, a stream that ends with no terminal event, an abort and the time limit are all unknown, so the caller
// keeps the estimate booked.
export async function streamModel(
	fetchFn: typeof fetch,
	key: string,
	req: ModelRequest,
	onDelta: (s: string) => boolean,
	signal: AbortSignal,
	timeoutMs = STREAM_TIMEOUT_MS,
): Promise<StreamOutcome> {
	if (signal.aborted) return { kind: "unknown", status: null, requestId: null };
	const controller = new AbortController();
	const stop = () => controller.abort();
	signal.addEventListener("abort", stop, { once: true });
	const timer = setTimeout(stop, timeoutMs);
	const aborted = new Promise<typeof ABORTED>((resolve) => controller.signal.addEventListener("abort", () => resolve(ABORTED), { once: true }));
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	let status: number | null = null;
	let requestId: string | null = null;
	try {
		const response = await Promise.race([
			fetchFn(RESPONSES_URL, {
				method: "POST",
				// The key goes in this header and nowhere else.
				headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
				body: JSON.stringify({ ...requestBody(req), stream: true }),
				signal: controller.signal,
			}),
			aborted,
		]);
		if (response === ABORTED) return { kind: "unknown", status: null, requestId: null };
		status = response.status;
		requestId = response.headers.get("x-request-id");
		const rejected = status >= 400 && status < 500;
		if (!response.ok && !rejected) return { kind: "unknown", status, requestId };
		if (rejected) {
			const json: unknown = await Promise.race([response.json().catch(() => null), aborted]);
			// Only these three: the error's message can quote part of the key.
			const error = isJson(json) && isJson(json.error) ? json.error : {};
			return { kind: "rejected", status, code: textOrNull(error.code), type: textOrNull(error.type), param: textOrNull(error.param), requestId };
		}
		if (response.body === null) return { kind: "unknown", status, requestId };

		reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let text = "";
		for (;;) {
			const chunk = await Promise.race([reader.read(), aborted]);
			if (chunk === ABORTED || chunk.done) return { kind: "unknown", status, requestId };
			buffer += decoder.decode(chunk.value, { stream: true });
			const { events, rest } = parseSse(buffer);
			buffer = rest;
			if (buffer.length > MAX_BUFFER_CHARS) return { kind: "unknown", status, requestId };
			for (const { event, data } of events) {
				if (event === "response.output_text.delta") {
					const piece = isJson(data) ? data.delta : null;
					if (typeof piece !== "string") continue;
					text += piece;
					if (onDelta(piece) === false) {
						controller.abort();
						return { kind: "streamed", text, status: null, incomplete: null, model: null, usage: null, requestId };
					}
				} else if (event === "response.completed" || event === "response.incomplete") {
					const parsed = parseResponse(isJson(data) ? data.response : null);
					if (parsed === null) return { kind: "unknown", status, requestId };
					return { kind: "streamed", text: text !== "" ? text : parsed.text, status: parsed.status, incomplete: parsed.incomplete, model: parsed.model, usage: parsed.usage, requestId };
				} else if (event === "response.failed" || event === "error") {
					return { kind: "unknown", status, requestId };
				}
			}
		}
	} catch {
		return { kind: "unknown", status, requestId };
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", stop);
		// Release the connection; a body that already errored or closed has nothing left to cancel.
		void reader?.cancel().catch(() => {});
	}
}
