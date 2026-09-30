// Osmo's words from OpenAI: one plain fetch to the Responses API, with no package and no retries.
// scripts/chat-probe.mjs loads this file straight into Node, so it imports nothing at runtime.

import type { ModelEntry } from "./allowance";
import type { InputItem } from "./types";

export const RESPONSES_URL = "https://api.openai.com/v1/responses";
export const MODEL_TIMEOUT_MS = 10_000;

export type ModelRequest = { entry: ModelEntry; instructions: string; input: InputItem[]; safetyId: string; maxOutput: number };
export type ModelUsage = { input: number; cached: number; output: number; reasoning: number };
export type Parsed = { status: string | null; incomplete: string | null; model: string | null; text: string; refused: boolean; usage: ModelUsage | null };
export type ModelOutcome =
	| { kind: "answered"; parsed: Parsed; requestId: string | null }
	| { kind: "rejected"; status: number; code: string | null; type: string | null; param: string | null; requestId: string | null }
	| { kind: "unknown"; status: number | null; requestId: string | null };

type Json = Record<string, unknown>;

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const fieldsOf = (value: unknown): Json => (isJson(value) ? value : {});
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
// A count the ledger's integer columns accept.
const tokens = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);

// Exactly these fields. No tools (tool use isn't covered by the free allowance), no sampling
// settings, no cache key. The two options go only to a model whose allowlist entry takes them.
export function requestBody(req: ModelRequest): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: req.entry.model,
		instructions: req.instructions,
		input: req.input.map(({ role, content }) => ({ role, content })),
		max_output_tokens: req.maxOutput,
		store: false,
		safety_identifier: req.safetyId,
	};
	if (req.entry.reasoning) body.reasoning = { effort: "none" };
	if (req.entry.verbosity) body.text = { verbosity: "low" };
	return body;
}

function usageOf(raw: unknown): ModelUsage | null {
	const usage = fieldsOf(raw);
	const input = tokens(usage.input_tokens);
	const output = tokens(usage.output_tokens);
	if (input === null || output === null) return null;
	return {
		input,
		cached: tokens(fieldsOf(usage.input_tokens_details).cached_tokens) ?? 0,
		output,
		reasoning: tokens(fieldsOf(usage.output_tokens_details).reasoning_tokens) ?? 0,
	};
}

// The text is every output_text part of every message item, joined as the SDK joins them. Reasoning
// and any other items are skipped, so the reply is never assumed to be output[0].
export function parseResponse(json: unknown): Parsed | null {
	if (!isJson(json)) return null;
	let text = "";
	let refused = false;
	for (const item of listOf(json.output)) {
		if (!isJson(item) || item.type !== "message") continue;
		for (const part of listOf(item.content)) {
			if (!isJson(part)) continue;
			if (part.type === "output_text" && typeof part.text === "string") text += part.text;
			if (part.type === "refusal") refused = true;
		}
	}
	return {
		status: textOrNull(json.status),
		incomplete: textOrNull(fieldsOf(json.incomplete_details).reason),
		model: textOrNull(json.model),
		text,
		refused,
		usage: usageOf(json.usage),
	};
}

const TIMED_OUT = Symbol("timed out");

// One call, never retried: the fallback is free and instant, and a retry could spend twice. The time
// limit covers the headers and the body, and aborts the request when it runs out.
export async function callModel(fetchFn: typeof fetch, key: string, req: ModelRequest, timeoutMs = MODEL_TIMEOUT_MS): Promise<ModelOutcome> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve(TIMED_OUT);
		}, timeoutMs);
	});
	try {
		const response = await Promise.race([
			fetchFn(RESPONSES_URL, {
				method: "POST",
				// The key goes in this header and nowhere else.
				headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
				body: JSON.stringify(requestBody(req)),
				signal: controller.signal,
			}),
			timeout,
		]);
		if (response === TIMED_OUT) return { kind: "unknown", status: null, requestId: null };
		const { status } = response;
		const requestId = response.headers.get("x-request-id");
		const rejected = status >= 400 && status < 500;
		if (!response.ok && !rejected) return { kind: "unknown", status, requestId };
		const json: unknown = await Promise.race([response.json().catch(() => null), timeout]);
		if (rejected) {
			// Only these three: the error's message can quote part of the key.
			const error = fieldsOf(fieldsOf(json).error);
			return { kind: "rejected", status, code: textOrNull(error.code), type: textOrNull(error.type), param: textOrNull(error.param), requestId };
		}
		const parsed = json === TIMED_OUT ? null : parseResponse(json);
		return parsed ? { kind: "answered", parsed, requestId } : { kind: "unknown", status, requestId };
	} catch {
		return { kind: "unknown", status: null, requestId: null };
	} finally {
		clearTimeout(timer);
	}
}
