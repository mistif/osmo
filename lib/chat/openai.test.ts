import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL, MAX_OUTPUT_TOKENS, MODELS, modelEntry } from "./allowance";
import { callModel, MODEL_TIMEOUT_MS, parseResponse, requestBody, RESPONSES_URL, type ModelRequest } from "./openai";
import type { InputItem } from "./types";

// The SHA-256 of a made-up user id, as the handler sends it.
const SAFETY_ID = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

function request(model = DEFAULT_MODEL): ModelRequest {
	const entry = modelEntry(model);
	if (!entry) throw new Error(`not on the allowlist: ${model}`);
	return {
		entry,
		instructions: "You are Osmo, Gur's companion.",
		input: [
			{ role: "user", content: "Good evening." },
			{ role: "assistant", content: "Good evening. How was your day?" },
			{ role: "user", content: "Long. What is 12 times 37?" },
		],
		safetyId: SAFETY_ID,
		maxOutput: MAX_OUTPUT_TOKENS,
	};
}

// A Responses API body as OpenAI sends it, trimmed to the fields that matter here.
function reply(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "resp_1",
		object: "response",
		status: "completed",
		incomplete_details: null,
		model: DEFAULT_MODEL,
		output: [
			{ type: "reasoning", id: "rs_1", summary: [], content: [{ type: "output_text", text: "Planning the sum." }] },
			{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "That comes to 444.", annotations: [] }] },
		],
		usage: { input_tokens: 3120, input_tokens_details: { cached_tokens: 2048 }, output_tokens: 9, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 3129 },
		...over,
	};
}

describe("requestBody", () => {
	it("sends exactly the allowed fields for every model on the list", () => {
		const expected: Record<string, string[]> = {
			"gpt-5.4-mini-2026-03-17": ["input", "instructions", "max_output_tokens", "model", "reasoning", "safety_identifier", "store", "text"],
			"gpt-4.1-mini-2025-04-14": ["input", "instructions", "max_output_tokens", "model", "safety_identifier", "store"],
		};
		// A model added to the list needs its line here, once its request options are confirmed.
		expect(MODELS.map((entry) => entry.model).sort()).toEqual(Object.keys(expected).sort());
		for (const entry of MODELS) {
			expect(Object.keys(requestBody(request(entry.model))).sort(), entry.model).toEqual(expected[entry.model]);
		}
	});

	it("fills them from the request, with reasoning off and low verbosity only where the model takes them", () => {
		expect(requestBody(request())).toEqual({
			model: "gpt-5.4-mini-2026-03-17",
			instructions: "You are Osmo, Gur's companion.",
			input: request().input,
			max_output_tokens: 360,
			store: false,
			safety_identifier: SAFETY_ID,
			reasoning: { effort: "none" },
			text: { verbosity: "low" },
		});
		const older = requestBody(request("gpt-4.1-mini-2025-04-14"));
		expect(older.model).toBe("gpt-4.1-mini-2025-04-14");
		expect(older).not.toHaveProperty("reasoning");
		expect(older).not.toHaveProperty("text");
	});

	it("verbosity: true plus format gives body.text equal to { verbosity: \"low\", format }", () => {
		const format = { type: "json_schema", name: "test" };
		const req = request();
		expect(requestBody({ ...req, format }).text).toEqual({ verbosity: "low", format });
	});

	it("verbosity: false plus format gives { format }", () => {
		const format = { type: "json_schema", name: "test" };
		const req = request("gpt-4.1-mini-2025-04-14");
		expect(requestBody({ ...req, format }).text).toEqual({ format });
	});

	it("no format and verbosity: false leaves text undefined", () => {
		const req = request("gpt-4.1-mini-2025-04-14");
		expect(requestBody(req)).not.toHaveProperty("text");
	});

	it("format never changes instructions or input", () => {
		const format = { type: "json_schema", name: "test" };
		const req = request();
		const withFormat = requestBody({ ...req, format });
		const withoutFormat = requestBody(req);
		expect(withFormat.instructions).toBe(withoutFormat.instructions);
		expect(withFormat.input).toEqual(withoutFormat.input);
	});

	it("sends each conversation item as its role and content only", () => {
		const extra = { role: "user", content: "hi", phase: "final_answer", name: "gur" } as InputItem;
		expect(requestBody({ ...request(), input: [extra] }).input).toEqual([{ role: "user", content: "hi" }]);
	});
});

describe("parseResponse", () => {
	it("joins the text of every message item, skipping reasoning and other items", () => {
		const parsed = parseResponse(
			reply({
				output: [
					{ type: "reasoning", id: "rs_1", summary: [], content: [{ type: "output_text", text: "Planning a reply." }] },
					{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Good evening." }] },
					{ type: "web_search_call", id: "ws_1", status: "completed" },
					{ type: "message", role: "assistant", content: [{ type: "output_text", text: " It comes to 444." }, { type: "output_text", text: " Shall I go on?" }] },
				],
			}),
		);
		expect(parsed).toEqual({
			status: "completed",
			incomplete: null,
			model: "gpt-5.4-mini-2026-03-17",
			text: "Good evening. It comes to 444. Shall I go on?",
			refused: false,
			usage: { input: 3120, cached: 2048, output: 9, reasoning: 0 },
		});
	});

	it("marks a refusal", () => {
		const parsed = parseResponse(reply({ output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "I can't help with that." }] }] }));
		expect(parsed?.refused).toBe(true);
		expect(parsed?.text).toBe("");
	});

	it("reads the status and why a reply is incomplete", () => {
		const cut = parseResponse(reply({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }));
		expect([cut?.status, cut?.incomplete]).toEqual(["incomplete", "max_output_tokens"]);
		expect(parseResponse(reply({ status: "incomplete", incomplete_details: { reason: "content_filter" } }))?.incomplete).toBe("content_filter");
		expect(parseResponse(reply({ status: "failed" }))?.status).toBe("failed");
		expect(parseResponse(reply({ model: "gpt-5.4-mini-2026-05-01" }))?.model).toBe("gpt-5.4-mini-2026-05-01");
	});

	it("keeps usage only when the input and output counts are whole numbers of zero or more", () => {
		const bad = [
			undefined,
			null,
			"lots",
			{},
			{ input_tokens: 10 },
			{ input_tokens: -1, output_tokens: 5 },
			{ input_tokens: 10, output_tokens: 2.5 },
			{ input_tokens: "10", output_tokens: 5 },
			{ input_tokens: Number.NaN, output_tokens: 5 },
		];
		for (const usage of bad) {
			expect(parseResponse(reply({ usage }))?.usage, String(JSON.stringify(usage))).toBeNull();
		}
		expect(parseResponse(reply({ usage: { input_tokens: 10, output_tokens: 5 } }))?.usage).toEqual({ input: 10, cached: 0, output: 5, reasoning: 0 });
		const oddDetails = { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: -3 }, output_tokens_details: { reasoning_tokens: 1.5 } };
		expect(parseResponse(reply({ usage: oddDetails }))?.usage).toEqual({ input: 10, cached: 0, output: 5, reasoning: 0 });
	});

	it("is null for a body that isn't an object, and reads an empty object as nothing", () => {
		const notObjects: [string, unknown][] = [
			["null", null],
			["a string", "That comes to 444."],
			["a number", 42],
			["an array", [reply()]],
		];
		for (const [label, json] of notObjects) {
			expect(parseResponse(json), label).toBeNull();
		}
		expect(parseResponse({})).toEqual({ status: null, incomplete: null, model: null, text: "", refused: false, usage: null });
	});
});

const KEY = "sk-test-chat-key-0123456789";

const answer = (body: unknown, status = 200, requestId: string | null = "req_123") =>
	new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status,
		headers: requestId === null ? { "content-type": "application/json" } : { "content-type": "application/json", "x-request-id": requestId },
	});

// A fake fetch that answers each call with a fresh response.
function serve(make: () => Response) {
	const fetcher = vi.fn(async () => make());
	return { fetcher, fetch: fetcher as unknown as typeof fetch };
}

describe("callModel", () => {
	it("posts the body to the Responses API, with the key only in the Authorization header", async () => {
		const { fetcher, fetch } = serve(() => answer(reply()));
		await callModel(fetch, KEY, request());
		const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.openai.com/v1/responses");
		expect(url).toBe(RESPONSES_URL);
		expect(init.method).toBe("POST");
		const headers = new Headers(init.headers);
		expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
		expect(headers.get("content-type")).toBe("application/json");
		for (const [name, value] of headers) {
			if (name !== "authorization") expect(value, name).not.toContain(KEY);
		}
		expect(String(init.body)).not.toContain(KEY);
		expect(JSON.parse(String(init.body))).toEqual(requestBody(request()));
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("gives back the parsed reply and the request id for a 200", async () => {
		await expect(callModel(serve(() => answer(reply(), 200, "req_abc")).fetch, KEY, request())).resolves.toEqual({
			kind: "answered",
			parsed: parseResponse(reply()),
			requestId: "req_abc",
		});
		const noId = await callModel(serve(() => answer(reply(), 200, null)).fetch, KEY, request());
		expect(noId.requestId).toBeNull();
	});

	it("reports a 4xx as rejected, with only its status, code, type, param and request id, and never retries", async () => {
		const cases: [number, unknown, { code: string | null; type: string | null; param: string | null }][] = [
			[
				400,
				{ error: { message: "Unsupported parameter: 'text.verbosity' is not supported with this model.", type: "invalid_request_error", param: "text.verbosity", code: "unsupported_parameter" } },
				{ code: "unsupported_parameter", type: "invalid_request_error", param: "text.verbosity" },
			],
			[
				401,
				{ error: { message: `Incorrect API key provided: ${KEY.slice(0, 12)}****6789.`, type: "invalid_request_error", param: null, code: "invalid_api_key" } },
				{ code: "invalid_api_key", type: "invalid_request_error", param: null },
			],
			[
				429,
				{ error: { message: "You exceeded your current quota.", type: "insufficient_quota", param: null, code: "project_spend_limit_exceeded" } },
				{ code: "project_spend_limit_exceeded", type: "insufficient_quota", param: null },
			],
			[
				429,
				{ error: { message: "Rate limit reached for requests.", type: "requests", param: null, code: "rate_limit_exceeded" } },
				{ code: "rate_limit_exceeded", type: "requests", param: null },
			],
			[404, "<html>Not found</html>", { code: null, type: null, param: null }],
		];
		for (const [status, body, fields] of cases) {
			const label = `${status} ${fields.code}`;
			const { fetcher, fetch } = serve(() => answer(body, status, "req_4xx"));
			const outcome = await callModel(fetch, KEY, request());
			expect(outcome, label).toEqual({ kind: "rejected", status, ...fields, requestId: "req_4xx" });
			expect(JSON.stringify(outcome), label).not.toContain(KEY.slice(0, 12));
			expect(fetcher, label).toHaveBeenCalledTimes(1);
		}
	});

	it("reports a 5xx as unknown, with its status and request id, and never retries", async () => {
		for (const status of [500, 503]) {
			const { fetcher, fetch } = serve(() => answer({ error: { message: "The server had an error.", type: "server_error", param: null, code: null } }, status, "req_5xx"));
			await expect(callModel(fetch, KEY, request()), `${status}`).resolves.toEqual({ kind: "unknown", status, requestId: "req_5xx" });
			expect(fetcher, `${status}`).toHaveBeenCalledTimes(1);
		}
	});

	it("reports a 200 it can't read as unknown: not JSON, or JSON that isn't an object", async () => {
		for (const body of ["<html>oops</html>", "", "[1,2]", "null", '"That comes to 444."']) {
			const outcome = await callModel(serve(() => answer(body, 200, "req_bad")).fetch, KEY, request());
			expect(outcome, JSON.stringify(body)).toEqual({ kind: "unknown", status: 200, requestId: "req_bad" });
		}
	});

	it("reports a network error as unknown, and never retries", async () => {
		const fetcher = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		await expect(callModel(fetcher as unknown as typeof fetch, KEY, request())).resolves.toEqual({ kind: "unknown", status: null, requestId: null });
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("gives up at the time limit and aborts the request", async () => {
		expect(MODEL_TIMEOUT_MS).toBe(10_000);
		const fetcher = vi.fn(() => new Promise<Response>(() => {}));
		const started = Date.now();
		const outcome = await callModel(fetcher as unknown as typeof fetch, KEY, request(), 50);
		expect(outcome).toEqual({ kind: "unknown", status: null, requestId: null });
		expect(Date.now() - started).toBeLessThan(1000);
		const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.signal?.aborted).toBe(true);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("also gives up when the body never finishes arriving", async () => {
		const stalled = () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { "x-request-id": "req_slow" } });
		const started = Date.now();
		const outcome = await callModel(serve(stalled).fetch, KEY, request(), 50);
		expect(outcome).toEqual({ kind: "unknown", status: 200, requestId: "req_slow" });
		expect(Date.now() - started).toBeLessThan(1000);
	});
});
