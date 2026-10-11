import { describe, expect, it, vi, type Mock } from "vitest";
import { DEFAULT_MODEL, modelEntry } from "./allowance";
import { requestBody, RESPONSES_URL, type ModelRequest } from "./openai";
import { parseSse, streamModel } from "./openai-stream";

const KEY = "sk-proj-osmo-build-SECRET-4242";
const entry = modelEntry(DEFAULT_MODEL)!;
const REQ: ModelRequest = { entry, instructions: "Write one component.", input: [{ role: "user", content: "Brief: a tip splitter" }], safetyId: "abc123", maxOutput: 4000 };

const delta = (text: string) => `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n`;
const completed = (over: Record<string, unknown> = {}) =>
	`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", model: "m", usage: { input_tokens: 10, output_tokens: 20 }, ...over } })}\n\n`;

// An SSE response whose body ends after its chunks, or stays open when `open` is set (a stream that has more to say).
// Its body errors when the request's signal aborts, as a real fetch's does.
function stream(chunks: (string | Uint8Array)[], opts: { open?: boolean } = {}): { fetchFn: Mock<typeof fetch>; signal: () => AbortSignal | undefined } {
	let seen: AbortSignal | undefined;
	const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
		seen = init?.signal ?? undefined;
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
				if (!opts.open) controller.close();
				seen?.addEventListener("abort", () => {
					try {
						controller.error(new DOMException("Aborted", "AbortError"));
					} catch {
						// Already closed.
					}
				});
			},
		});
		return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "req_stream1" } });
	});
	return { fetchFn, signal: () => seen };
}

const json = (status: number, payload: unknown) => ({
	fetchFn: vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", "x-request-id": "req_err1" } })),
});

describe("parseSse", () => {
	it("returns whole events and keeps the half that has not finished arriving", () => {
		const first = parseSse('event: response.output_text.delta\ndata: {"delta":"ab"}\n\nevent: resp');
		expect(first.events).toEqual([{ event: "response.output_text.delta", data: { delta: "ab" } }]);
		expect(first.rest).toBe("event: resp");
		const second = parseSse(`${first.rest}onse.completed\ndata: {"response":{"status":"completed"}}\n\n`);
		expect(second.events).toEqual([{ event: "response.completed", data: { response: { status: "completed" } } }]);
		expect(second.rest).toBe("");
	});

	it("reads CRLF line ends, skips comments and events with no data, and keeps data that is not JSON as text", () => {
		const parsed = parseSse(": ping\r\n\r\nevent: x\r\n\r\nevent: note\r\ndata: [DONE]\r\n\r\n");
		expect(parsed.events).toEqual([{ event: "note", data: "[DONE]" }]);
		expect(parsed.rest).toBe("");
	});

	it("names an event with no event line by the type inside its data", () => {
		expect(parseSse('data: {"type":"error","code":"x"}\n\n').events).toEqual([{ event: "error", data: { type: "error", code: "x" } }]);
	});
});

describe("streamModel", () => {
	it("hands each delta to onDelta and settles on response.completed with OpenAI's counts", async () => {
		const { fetchFn } = stream([delta("ab"), delta("cd"), completed()]);
		const seen: string[] = [];
		const out = await streamModel(fetchFn, KEY, REQ, (s) => (seen.push(s), true), new AbortController().signal);
		expect(seen).toEqual(["ab", "cd"]);
		expect(out).toEqual({ kind: "streamed", text: "abcd", status: "completed", incomplete: null, model: "m", usage: { input: 10, output: 20, cached: 0, reasoning: 0 }, requestId: "req_stream1" });
	});

	it("reassembles events that arrive split across chunks, even inside a word", async () => {
		const whole = delta("ab") + delta("cd") + completed();
		const { fetchFn } = stream([whole.slice(0, 40), whole.slice(40, 41), whole.slice(41, 120), whole.slice(120)]);
		const seen: string[] = [];
		const out = await streamModel(fetchFn, KEY, REQ, (s) => (seen.push(s), true), new AbortController().signal);
		expect(seen).toEqual(["ab", "cd"]);
		expect(out).toMatchObject({ kind: "streamed", text: "abcd", usage: { input: 10, output: 20 } });
	});

	it("reads a multi-byte character cut between two chunks", async () => {
		const bytes = new TextEncoder().encode(delta("naïve") + completed());
		const at = bytes.indexOf(0xc3) + 1;
		const { fetchFn } = stream([bytes.slice(0, at), bytes.slice(at)]);
		const seen: string[] = [];
		await streamModel(fetchFn, KEY, REQ, (s) => (seen.push(s), true), new AbortController().signal);
		expect(seen).toEqual(["naïve"]);
	});

	it("reports a stream the output cap stopped as incomplete, with its counts", async () => {
		const response = { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, model: "m", usage: { input_tokens: 700, output_tokens: 4000, output_tokens_details: { reasoning_tokens: 12 }, input_tokens_details: { cached_tokens: 64 } } };
		const done = `event: response.incomplete\ndata: ${JSON.stringify({ type: "response.incomplete", response })}\n\n`;
		const { fetchFn } = stream([delta("half"), done]);
		const out = await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal);
		expect(out).toMatchObject({ kind: "streamed", text: "half", status: "incomplete", incomplete: "max_output_tokens", model: "m", usage: { input: 700, output: 4000, cached: 64, reasoning: 12 } });
	});

	it("aborts the request when onDelta returns false, and returns what was read with no counts", async () => {
		const { fetchFn, signal } = stream([delta("ab"), delta("cd")], { open: true });
		const seen: string[] = [];
		const out = await streamModel(fetchFn, KEY, REQ, (s) => (seen.push(s), false), new AbortController().signal);
		expect(seen).toEqual(["ab"]);
		expect(signal()?.aborted).toBe(true);
		expect(out).toEqual({ kind: "streamed", text: "ab", status: null, incomplete: null, model: null, usage: null, requestId: "req_stream1" });
	});

	it("returns rejected with the code and type only when OpenAI refuses the request", async () => {
		const { fetchFn } = json(400, { error: { message: `Bad key ${KEY}`, type: "invalid_request_error", param: "input", code: "invalid_prompt" } });
		const out = await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal);
		expect(out).toEqual({ kind: "rejected", status: 400, code: "invalid_prompt", type: "invalid_request_error", param: "input", requestId: "req_err1" });
		expect(JSON.stringify(out)).not.toContain(KEY);
	});

	it("returns unknown for a 500", async () => {
		const { fetchFn } = json(500, { error: { message: "boom" } });
		expect(await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal)).toEqual({ kind: "unknown", status: 500, requestId: "req_err1" });
	});

	it("returns unknown for a stream that ends with no terminal event", async () => {
		const { fetchFn } = stream([delta("ab"), delta("cd")]);
		const out = await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal);
		expect(out).toEqual({ kind: "unknown", status: 200, requestId: "req_stream1" });
	});

	it("returns unknown for response.failed and for an error event", async () => {
		for (const event of ["response.failed", "error"]) {
			const { fetchFn } = stream([delta("ab"), `event: ${event}\ndata: ${JSON.stringify({ type: event, response: { status: "failed" }, message: "no" })}\n\n`, completed()]);
			const out = await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal);
			expect(out, event).toEqual({ kind: "unknown", status: 200, requestId: "req_stream1" });
		}
	});

	it("returns unknown for a terminal event whose response cannot be read", async () => {
		const { fetchFn } = stream(['event: response.completed\ndata: {"response":"x"}\n\n']);
		expect((await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal)).kind).toBe("unknown");
	});

	it("returns unknown, with no request, when the signal is already aborted", async () => {
		const { fetchFn } = stream([completed()]);
		const controller = new AbortController();
		controller.abort();
		expect(await streamModel(fetchFn, KEY, REQ, () => true, controller.signal)).toEqual({ kind: "unknown", status: null, requestId: null });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("returns unknown when the signal aborts mid-stream, and aborts the request", async () => {
		const { fetchFn, signal } = stream([delta("ab")], { open: true });
		const controller = new AbortController();
		const out = await streamModel(fetchFn, KEY, REQ, () => (controller.abort(), true), controller.signal);
		expect(out.kind).toBe("unknown");
		expect(signal()?.aborted).toBe(true);
	});

	it("returns unknown and aborts the request when the one overall time runs out", async () => {
		const { fetchFn, signal } = stream([delta("ab")], { open: true });
		const out = await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal, 30);
		expect(out.kind).toBe("unknown");
		expect(signal()?.aborted).toBe(true);
	});

	it("returns unknown when fetch throws", async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => {
			throw new TypeError("network");
		});
		expect(await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal)).toEqual({ kind: "unknown", status: null, requestId: null });
	});

	it("sends requestBody plus stream: true, and the key only in the header", async () => {
		const { fetchFn } = stream([completed()]);
		await streamModel(fetchFn, KEY, REQ, () => true, new AbortController().signal);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe(RESPONSES_URL);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({ ...requestBody(REQ), stream: true });
		expect(String(init?.body)).not.toContain(KEY);
		expect(init?.headers).toEqual({ authorization: `Bearer ${KEY}`, "content-type": "application/json" });
	});
});
