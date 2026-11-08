import { describe, expect, it, vi } from "vitest";
import { LIMITS } from "../artifacts/compile";
import type { BuildLine } from "../artifacts/protocol";
import { bearerToken } from "../server/auth";
import { estimateTokens, MODELS, type Env } from "./allowance";
import { buildDeps, handleBuild, type BuildDeps } from "./build-handler";
import { buildPrompt, repairPrompt } from "./build-prompt";
import type { LedgerRow, LedgerStore } from "./ledger";
import type { StreamOutcome } from "./openai-stream";

// The owner-pinned admin client is never opened here; the real after() throws outside a request, which buildDeps().defer must absorb.
vi.mock("../server/admin", () => ({ ownerDb: vi.fn(() => { throw new Error("admin_unconfigured"); }) }));

const GUR = "4f1c2b8e-9a37-4d21-b6f0-2c5e8d7a9b13";
const MAYA = "0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a";
const TOKENS: Record<string, string> = { "gur-token": GUR, "maya-token": MAYA };
const KEY = "sk-proj-osmo-build-SECRET-4242";
const MODEL = "gpt-5.4-mini-2026-03-17";
const ENV: Env = { OSMO_CHAT: "on", OSMO_BUILD: "on", OSMO_OWNER_ID: GUR, OSMO_CHAT_OPENAI_KEY: KEY, OSMO_MINI_TOKENS_PER_DAY: "700000" };
const USABLE = 630_000;
const NOW = Date.UTC(2026, 9, 11, 12);
const BRIEF = "a tip splitter for four people";
const USAGE = { input: 700, cached: 0, output: 900, reasoning: 0 };

// An in-memory ai_calls table, as the chat handler's tests use.
function memoryLedger() {
	const rows: LedgerRow[] = [];
	const store: LedgerStore = {
		async readDay(day) {
			return { ok: true, value: rows.filter((row) => row.day === day).map((row) => ({ ...row })) };
		},
		async insert(row) {
			if (row.settles !== null && rows.some((other) => other.settles === row.settles)) return { ok: false, code: "23505" };
			rows.push({ id: rows.length + 1, ...row });
			return { ok: true, value: rows.length };
		},
	};
	return { rows, store, factory: vi.fn<(token: string) => LedgerStore>(() => store) };
}
type Ledger = ReturnType<typeof memoryLedger>;

type OnDelta = (s: string) => boolean;
type Script = (onDelta: OnDelta, signal: AbortSignal) => Promise<StreamOutcome>;
const streamed = (over: Partial<Extract<StreamOutcome, { kind: "streamed" }>> = {}): StreamOutcome => ({
	kind: "streamed",
	text: "// title: Tip\nexport default function Tip() { return null; }",
	status: "completed",
	incomplete: null,
	model: MODEL,
	usage: USAGE,
	requestId: "req_1",
	...over,
});

// A fake streamModel: the script emits deltas through onDelta and returns the outcome.
function rig(options: { env?: Env; ledger?: Ledger; gate?: BuildDeps["gate"]; script?: Script } = {}) {
	const ledger = options.ledger ?? memoryLedger();
	const deferred: Promise<unknown>[] = [];
	const logs: { event: string; fields: Record<string, string | number | null> }[] = [];
	const script: Script =
		options.script ??
		(async (onDelta) => {
			onDelta("// title: Tip\n");
			onDelta("export default function Tip() { return null; }");
			return streamed();
		});
	const stream = vi.fn<BuildDeps["stream"]>(async (_fetch, _key, _req, onDelta, signal) => script(onDelta, signal));
	const deps: BuildDeps = {
		env: () => options.env ?? ENV,
		user: async (request) => {
			const id = TOKENS[bearerToken(request) ?? ""];
			return id ? { id } : null;
		},
		token: (request) => bearerToken(request),
		ledger: ledger.factory,
		fetch: vi.fn<typeof fetch>(async () => {
			throw new Error("the fake stream never fetches");
		}),
		now: () => NOW,
		log: (event, fields) => void logs.push({ event, fields }),
		actions: { list: vi.fn(async () => null), run: vi.fn(async () => ({ kind: "ignored" as const })), cancelWaiting: vi.fn(async () => {}) },
		later: async (work) => void (await work()),
		gate: options.gate ?? (async () => "ok"),
		defer: (p) => void deferred.push(p),
		stream,
	};
	return { deps, ledger, stream, deferred, logs };
}

const post = (payload: unknown, token: string | null = "gur-token", signal?: AbortSignal) =>
	new Request("https://osmo.test/api/build", {
		method: "POST",
		headers: token === null ? {} : { authorization: `Bearer ${token}` },
		body: typeof payload === "string" ? payload : JSON.stringify(payload),
		signal,
	});

const linesOf = async (response: Response): Promise<BuildLine[]> =>
	(await response.text())
		.split("\n")
		.filter((line) => line !== "")
		.map((line) => JSON.parse(line) as BuildLine);

const reservations = (ledger: Ledger) => ledger.rows.filter((row) => row.settles === null);
const settlings = (ledger: Ledger) => ledger.rows.filter((row) => row.settles !== null);

describe("handleBuild: who may ask, and the body", () => {
	it("answers 405, 401, 403 and 404 before anything else, and never opens the ledger or the stream", async () => {
		const cases: [string, Request, number, Env?][] = [
			["GET", new Request("https://osmo.test/api/build", { headers: { authorization: "Bearer gur-token" } }), 405],
			["no token", post({ brief: BRIEF }, null), 401],
			["a stranger", post({ brief: BRIEF }, "stranger-token"), 401],
			["another account", post({ brief: BRIEF }, "maya-token"), 403],
			["OSMO_BUILD unset", post({ brief: BRIEF }), 404, { ...ENV, OSMO_BUILD: undefined }],
			["OSMO_BUILD off", post({ brief: BRIEF }), 404, { ...ENV, OSMO_BUILD: "off" }],
		];
		for (const [label, request, status, env] of cases) {
			const { deps, ledger, stream } = rig({ env });
			const response = await handleBuild(request, deps);
			expect(response.status, label).toBe(status);
			expect(response.headers.get("cache-control"), label).toBe("no-store");
			if (status === 404) expect(await response.json(), label).toEqual({ error: "off" });
			expect(ledger.factory, label).not.toHaveBeenCalled();
			expect(stream, label).not.toHaveBeenCalled();
		}
	});

	it("answers 400 to a body that is not a brief or a repair, with no ledger row and no stream call", async () => {
		const source = "export default function A() { return null; }";
		const bad: [string, unknown][] = [
			["not JSON", "{nope"],
			["an array", []],
			["empty", {}],
			["an empty brief", { brief: "" }],
			["a blank brief", { brief: "   " }],
			["a brief of 501 characters", { brief: "x".repeat(501) }],
			["a number", { brief: 3 }],
			["an extra key", { brief: BRIEF, from: "" }],
			["both shapes", { brief: BRIEF, repair: { source, error: "e" } }],
			["a guest", { brief: BRIEF, speaker: "guest" }],
			["a guest in capitals", { brief: BRIEF, speaker: " GUEST " }],
			["a speaker that is not text", { brief: BRIEF, speaker: 1 }],
			["a repair with an extra key", { repair: { source, error: "e", more: 1 } }],
			["a repair without an error", { repair: { source } }],
			["a repair with an empty source", { repair: { source: "", error: "e" } }],
			["a source of 12,289 bytes", { repair: { source: "a".repeat(LIMITS.sourceBytes + 1), error: "e" } }],
			["a source of 12,289 bytes in characters of three", { repair: { source: "\u20ac".repeat(4096) + "a", error: "e" } }],
			["an error of 301 characters", { repair: { source, error: "e".repeat(301) } }],
		];
		for (const [label, payload] of bad) {
			const { deps, ledger, stream } = rig();
			const response = await handleBuild(post(payload), deps);
			expect(response.status, label).toBe(400);
			expect(await response.json(), label).toEqual({ error: "bad_request" });
			expect(ledger.rows, label).toHaveLength(0);
			expect(stream, label).not.toHaveBeenCalled();
		}
	});

	it("takes a brief of 500 characters, a repair at its limits and a speaker that is not a guest", async () => {
		const cases: unknown[] = [
			{ brief: "x".repeat(500) },
			{ brief: BRIEF, speaker: "Gur" },
			{ repair: { source: "a".repeat(LIMITS.sourceBytes), error: "e".repeat(300) } },
			{ repair: { source: "\u20ac".repeat(4096), error: "e" } },
		];
		for (const payload of cases) {
			const { deps, stream } = rig();
			const response = await handleBuild(post(payload), deps);
			expect(response.status, JSON.stringify(payload).slice(0, 40)).toBe(200);
			await linesOf(response);
			expect(stream).toHaveBeenCalledTimes(1);
		}
	});
});

describe("handleBuild: before the call", () => {
	it("says off for the cap and for the gate, with no ledger row", async () => {
		for (const [verdict, code] of [["cap", "cap"], ["off", "off"]] as const) {
			const { deps, ledger, stream, deferred } = rig({ gate: async () => verdict });
			const response = await handleBuild(post({ brief: BRIEF }), deps);
			expect(response.status, verdict).toBe(200);
			expect(response.headers.get("content-type"), verdict).toBe("application/x-ndjson");
			expect(await linesOf(response), verdict).toEqual([{ t: "error", code }]);
			expect(ledger.rows, verdict).toHaveLength(0);
			expect(stream, verdict).not.toHaveBeenCalled();
			expect(deferred, verdict).toHaveLength(0);
		}
	});

	it("says off when the chat settings are not right, or the gate throws", async () => {
		const noKey = rig({ env: { ...ENV, OSMO_CHAT_OPENAI_KEY: undefined } });
		expect(await linesOf(await handleBuild(post({ brief: BRIEF }), noKey.deps))).toEqual([{ t: "error", code: "off" }]);
		const throws = rig({ gate: async () => { throw new Error("db"); } });
		expect(await linesOf(await handleBuild(post({ brief: BRIEF }), throws.deps))).toEqual([{ t: "error", code: "off" }]);
		expect(noKey.ledger.rows).toHaveLength(0);
		expect(throws.ledger.rows).toHaveLength(0);
	});

	it("says allowance, and never calls the model, when the estimate no longer fits the share", async () => {
		const ledger = memoryLedger();
		await ledger.store.insert({ day: "2026-10-11", pool: "mini", model: MODEL, input_tokens: USABLE - 1000, cached_tokens: 0, output_tokens: 0, reasoning_tokens: 0, settles: null, signature: null });
		const { deps, stream, deferred } = rig({ ledger });
		const response = await handleBuild(post({ brief: BRIEF }), deps);
		expect(await linesOf(response)).toEqual([{ t: "error", code: "allowance" }]);
		expect(stream).not.toHaveBeenCalled();
		expect(ledger.rows).toHaveLength(1);
		expect(deferred).toHaveLength(0);
	});
});

describe("handleBuild: a build", () => {
	it("streams the deltas and a done line, books 4000 as output and settles with the real counts", async () => {
		const { deps, ledger, stream, deferred } = rig();
		const response = await handleBuild(post({ brief: BRIEF }), deps);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/x-ndjson");
		expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
		expect(response.headers.get("x-accel-buffering")).toBe("no");
		expect(await linesOf(response)).toEqual([
			{ t: "delta", s: "// title: Tip\n" },
			{ t: "delta", s: "export default function Tip() { return null; }" },
			{ t: "done", tokens: 1600 },
		]);
		const asked = buildPrompt(BRIEF);
		const estimate = estimateTokens(asked.instructions, asked.input, 4000);
		expect(reservations(ledger)).toHaveLength(1);
		expect(reservations(ledger)[0]).toMatchObject({ day: "2026-10-11", pool: "mini", model: MODEL, input_tokens: estimate - 4000, output_tokens: 4000 });
		expect(settlings(ledger)).toHaveLength(1);
		expect(settlings(ledger)[0]).toMatchObject({ model: MODEL, input_tokens: 700, output_tokens: 900, settles: reservations(ledger)[0].id });
		expect(settlings(ledger)[0].signature).toMatch(/^[0-9a-f]{64}$/);
		const [, key, req] = stream.mock.calls[0];
		expect(key).toBe(KEY);
		expect(req.maxOutput).toBe(4000);
		expect(req.entry.model).toBe(MODEL);
		expect(req.instructions).toBe(asked.instructions);
		expect(req.instructions).not.toContain(BRIEF);
		expect(req.input).toEqual(asked.input);
		expect(req.format).toBeUndefined();
		expect(req.safetyId).toMatch(/^[0-9a-f]{64}$/);
		expect(deferred).toHaveLength(1);
		await deferred[0];
	});

	it("builds a repair from the failing source and counts it as its own reservation", async () => {
		const { deps, ledger, stream } = rig();
		const repair = { source: "export default function A() { return <b/>; }", error: "Unexpected token" };
		await linesOf(await handleBuild(post({ repair }), deps));
		await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		const want = repairPrompt(repair.error, repair.source);
		expect(stream.mock.calls[0][2].instructions).toBe(want.instructions);
		expect(stream.mock.calls[0][2].input).toEqual(want.input);
		expect(stream.mock.calls[1][2].instructions).toBe(buildPrompt(BRIEF).instructions);
		expect(reservations(ledger)).toHaveLength(2);
		expect(settlings(ledger)).toHaveLength(2);
	});

	it("never logs the brief, the source or the key", async () => {
		const { deps, logs } = rig({ script: async () => ({ kind: "unknown", status: 500, requestId: "req_x" }) });
		await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		expect(logs).toEqual([{ event: "build.openai", fields: { status: 500, code: null, type: null, requestId: "req_x" } }]);
		expect(JSON.stringify(logs)).not.toContain(BRIEF);
		expect(JSON.stringify(logs)).not.toContain(KEY);
	});

	it("sends a terminal response's whole text as one delta when no delta arrived", async () => {
		const { deps } = rig({ script: async () => streamed({ text: "// title: Tip\nexport default function Tip() { return null; }" }) });
		expect(await linesOf(await handleBuild(post({ brief: BRIEF }), deps))).toEqual([
			{ t: "delta", s: "// title: Tip\nexport default function Tip() { return null; }" },
			{ t: "done", tokens: 1600 },
		]);
	});

	it("says done at the estimate when the stream reports no counts", async () => {
		const { deps, ledger } = rig({ script: async (onDelta) => (onDelta("x"), streamed({ usage: null })) });
		const lines = await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		const estimate = estimateTokens(buildPrompt(BRIEF).instructions, buildPrompt(BRIEF).input, 4000);
		expect(lines.at(-1)).toEqual({ t: "done", tokens: estimate });
		expect(settlings(ledger)).toHaveLength(0);
	});
});

describe("handleBuild: a source past the limit", () => {
	it("stops the model at 12,289 bytes, says too_big with no done, and settles with the reported usage", async () => {
		let sawFalse = false;
		const { deps, ledger } = rig({
			script: async (onDelta) => {
				onDelta("a".repeat(LIMITS.sourceBytes - 3));
				// A three-byte character crossing the cap.
				if (onDelta("a\u20ac") === false) sawFalse = true;
				return streamed({ usage: USAGE });
			},
		});
		const lines = await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		expect(sawFalse).toBe(true);
		expect(lines).toEqual([{ t: "delta", s: "a".repeat(LIMITS.sourceBytes - 3) }, { t: "error", code: "too_big" }]);
		expect(settlings(ledger)).toHaveLength(1);
		expect(settlings(ledger)[0]).toMatchObject({ input_tokens: 700, output_tokens: 900 });
	});

	it("leaves the estimate booked when the stopped stream reports no counts", async () => {
		const { deps, ledger } = rig({
			script: async (onDelta) => {
				onDelta("a".repeat(LIMITS.sourceBytes));
				onDelta("b");
				return streamed({ status: null, model: null, usage: null });
			},
		});
		const lines = await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		expect(lines.at(-1)).toEqual({ t: "error", code: "too_big" });
		expect(lines.some((l) => l.t === "done")).toBe(false);
		expect(reservations(ledger)).toHaveLength(1);
		expect(settlings(ledger)).toHaveLength(0);
	});

	it("takes a source of exactly 12,288 bytes", async () => {
		const { deps } = rig({ script: async (onDelta) => (onDelta("a".repeat(LIMITS.sourceBytes)), streamed()) });
		expect((await linesOf(await handleBuild(post({ brief: BRIEF }), deps))).at(-1)).toEqual({ t: "done", tokens: 1600 });
	});
});

describe("handleBuild: outcomes that fail", () => {
	it("says too_big for a reply cut by the output cap, and settles with its counts", async () => {
		const { deps, ledger } = rig({ script: async (onDelta) => (onDelta("export default"), streamed({ status: "incomplete", incomplete: "max_output_tokens", usage: { input: 600, cached: 0, output: 4000, reasoning: 0 } })) });
		const lines = await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		expect(lines.at(-1)).toEqual({ t: "error", code: "too_big" });
		expect(lines.some((l) => l.t === "done")).toBe(false);
		expect(settlings(ledger)[0]).toMatchObject({ input_tokens: 600, output_tokens: 4000 });
	});

	it("says failed for any other incomplete reply, a status that is not an answer and a stream that only refuses", async () => {
		const cases: [string, StreamOutcome][] = [
			["content filter", streamed({ status: "incomplete", incomplete: "content_filter" })],
			["a failed status", streamed({ status: "failed" })],
			["no status", streamed({ status: null })],
			["a refusal with no text", streamed({ text: "" })],
			["blank text", streamed({ text: " \n " })],
		];
		for (const [label, outcome] of cases) {
			const { deps } = rig({ script: async () => outcome });
			const lines = await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
			expect(lines, label).toEqual([{ t: "error", code: "failed" }]);
		}
	});

	it("says failed and leaves the estimate booked when the outcome is unknown", async () => {
		const { deps, ledger } = rig({ script: async () => ({ kind: "unknown", status: 200, requestId: "req_2" }) });
		const lines = await linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		expect(lines).toEqual([{ t: "error", code: "failed" }]);
		expect(reservations(ledger)).toHaveLength(1);
		expect(settlings(ledger)).toHaveLength(0);
	});

	it("says failed and settles at zero when OpenAI refuses the request", async () => {
		const { deps, ledger, logs } = rig({ script: async () => ({ kind: "rejected", status: 400, code: "invalid_prompt", type: "invalid_request_error", param: null, requestId: "req_3" }) });
		expect(await linesOf(await handleBuild(post({ brief: BRIEF }), deps))).toEqual([{ t: "error", code: "failed" }]);
		expect(settlings(ledger)).toHaveLength(1);
		expect(settlings(ledger)[0]).toMatchObject({ model: MODEL, input_tokens: 0, output_tokens: 0 });
		expect(logs[0]).toEqual({ event: "build.openai", fields: { status: 400, code: "invalid_prompt", type: "invalid_request_error", requestId: "req_3" } });
	});

	it("says failed when the stream throws, and still resolves the deferred promise", async () => {
		const { deps, deferred } = rig({ script: async () => { throw new Error("boom"); } });
		expect(await linesOf(await handleBuild(post({ brief: BRIEF }), deps))).toEqual([{ t: "error", code: "failed" }]);
		await expect(deferred[0]).resolves.toBeUndefined();
	});

	it("says failed when another model answered, settling under its name so the day stops", async () => {
		const served = "gpt-5.4-mini-2026-09-01";
		const withUsage = rig({ script: async (onDelta) => (onDelta("x"), streamed({ model: served })) });
		expect((await linesOf(await handleBuild(post({ brief: BRIEF }), withUsage.deps))).at(-1)).toEqual({ t: "error", code: "failed" });
		expect(settlings(withUsage.ledger)).toHaveLength(1);
		expect(settlings(withUsage.ledger)[0]).toMatchObject({ model: served, input_tokens: 700, output_tokens: 900 });
		const noUsage = rig({ script: async () => streamed({ model: served, usage: null }) });
		expect(await linesOf(await handleBuild(post({ brief: BRIEF }), noUsage.deps))).toEqual([{ t: "error", code: "failed" }]);
		expect(settlings(noUsage.ledger)).toHaveLength(1);
		expect(settlings(noUsage.ledger)[0]).toMatchObject({ model: served, output_tokens: 4000 });
		// The day is stopped: the next build is refused.
		expect(await linesOf(await handleBuild(post({ brief: BRIEF }), { ...noUsage.deps }))).toEqual([{ t: "error", code: "failed" }]);
		expect(noUsage.stream).toHaveBeenCalledTimes(1);
	});

	it("says failed when no model is named", async () => {
		const { deps } = rig({ script: async () => streamed({ model: null }) });
		expect((await linesOf(await handleBuild(post({ brief: BRIEF }), deps))).at(-1)).toEqual({ t: "error", code: "failed" });
	});
});

describe("handleBuild: the browser leaves mid-stream", () => {
	// A model that writes one delta, then waits for the call to be aborted, then answers as the fake sees fit.
	const waiting = (after: StreamOutcome, seen: { aborted: boolean }): Script => async (onDelta, signal) => {
		onDelta("// title: Tip\n");
		await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
		seen.aborted = signal.aborted;
		return after;
	};

	it("aborts the call when the request aborts, closes quietly, keeps the estimate and settles after the stream ends", async () => {
		const seen = { aborted: false };
		const { deps, ledger, deferred } = rig({ script: waiting({ kind: "unknown", status: 200, requestId: "req_4" }, seen) });
		const controller = new AbortController();
		const response = await handleBuild(post({ brief: BRIEF }, "gur-token", controller.signal), deps);
		const reader = response.body!.getReader();
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toBe('{"t":"delta","s":"// title: Tip\\n"}\n');
		controller.abort();
		const rest = await reader.read();
		expect(rest.done).toBe(true);
		await deferred[0];
		expect(seen.aborted).toBe(true);
		expect(reservations(ledger)).toHaveLength(1);
		expect(settlings(ledger)).toHaveLength(0);
	});

	it("settles once, with the counts, when the call still reports them, and writes no done line", async () => {
		const seen = { aborted: false };
		const { deps, ledger, deferred } = rig({ script: waiting(streamed(), seen) });
		const controller = new AbortController();
		const response = await handleBuild(post({ brief: BRIEF }, "gur-token", controller.signal), deps);
		const reader = response.body!.getReader();
		await reader.read();
		controller.abort();
		const chunks: string[] = [];
		for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(new TextDecoder().decode(r.value));
		await deferred[0];
		expect(chunks).toEqual([]);
		expect(settlings(ledger)).toHaveLength(1);
		expect(settlings(ledger)[0]).toMatchObject({ input_tokens: 700, output_tokens: 900 });
	});

	it("aborts the call when the room cancels the response", async () => {
		const seen = { aborted: false };
		const { deps, ledger, deferred } = rig({ script: waiting({ kind: "unknown", status: 200, requestId: null }, seen) });
		const response = await handleBuild(post({ brief: BRIEF }), deps);
		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel();
		await deferred[0];
		expect(seen.aborted).toBe(true);
		expect(reservations(ledger)).toHaveLength(1);
		expect(settlings(ledger)).toHaveLength(0);
	});

	it("starts the call already aborted when the request was aborted before it began", async () => {
		const { deps, stream, deferred } = rig({ script: async (_onDelta, signal) => (signal.aborted ? { kind: "unknown", status: null, requestId: null } : streamed()) });
		const controller = new AbortController();
		controller.abort();
		const response = await handleBuild(post({ brief: BRIEF }, "gur-token", controller.signal), deps);
		expect(await response.text()).toBe("");
		await deferred[0];
		expect(stream.mock.calls[0][4].aborted).toBe(true);
	});

	it("resolves the deferred promise only after the settling row is written", async () => {
		const ledger = memoryLedger();
		let release = () => {};
		const hold = new Promise<void>((resolve) => (release = resolve));
		const insert = ledger.store.insert.bind(ledger.store);
		ledger.store.insert = async (row) => {
			if (row.settles !== null) await hold;
			return insert(row);
		};
		const { deps, deferred } = rig({ ledger });
		const read = linesOf(await handleBuild(post({ brief: BRIEF }), deps));
		let resolved = false;
		void deferred[0].then(() => (resolved = true));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(resolved).toBe(false);
		expect(settlings(ledger)).toHaveLength(0);
		release();
		await read;
		await deferred[0];
		expect(settlings(ledger)).toHaveLength(1);
	});
});

describe("buildDeps", () => {
	it("wires the real gate and stream, and a defer that never throws outside a request", () => {
		const deps = buildDeps();
		expect(typeof deps.gate).toBe("function");
		expect(typeof deps.stream).toBe("function");
		expect(() => deps.defer(Promise.resolve())).not.toThrow();
	});
});

// MODELS is read so a change to the default model cannot leave these tests asking for one that is not on the list.
describe("the test model", () => {
	it("is on the allowlist", () => {
		expect(MODELS.some((m) => m.model === MODEL)).toBe(true);
	});
});

