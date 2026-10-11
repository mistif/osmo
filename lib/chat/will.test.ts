import { describe, expect, it, vi, type Mock } from "vitest";
import { characterLines } from "../agent/character";
import { bearerToken } from "../server/auth";
import type { Env } from "./allowance";
import type { ChatDeps } from "./handler";
import type { LedgerRow, LedgerStore } from "./ledger";
import { RESPONSES_URL } from "./openai";
import { checkWillBody, handleWill, lineOk, readWill } from "./will";
import { WILL_FORMAT, willData } from "./will-schema";

const next = vi.hoisted(() => ({ after: vi.fn<(task: () => Promise<unknown>) => void>() }));
vi.mock("next/server", async (importOriginal) => {
	const real = await importOriginal<typeof import("next/server")>();
	next.after.mockImplementation((task) => real.after(task));
	return { ...real, after: next.after };
});
vi.mock("../server/admin", () => ({ ownerDb: vi.fn(() => { throw new Error("admin_unconfigured"); }) }));

const GUR = "4f1c2b8e-9a37-4d21-b6f0-2c5e8d7a9b13";
const MAYA = "0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a";
const TOKENS: Record<string, string> = { "gur-token": GUR, "maya-token": MAYA };
const KEY = "sk-proj-osmo-chat-SECRET-4242";
const ENV: Env = { OSMO_CHAT: "on", OSMO_WILL: "on", OSMO_OWNER_ID: GUR, OSMO_CHAT_OPENAI_KEY: KEY, OSMO_MINI_TOKENS_PER_DAY: "700000" };
const NOW = Date.UTC(2026, 9, 11, 12);
const USAGE = { input_tokens: 610, input_tokens_details: { cached_tokens: 0 }, output_tokens: 31, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 641 };
const BODY = {
	candidates: [
		{ name: "well", place: "on the east island", size: "small", parts: ["well", "well roof"], fresh: false },
		{ name: "small lighthouse", place: "on the east island, by the cliff", size: "medium", parts: ["stone wall", "lamp room", "glass dome"], fresh: true },
		{ name: "garden", place: "on the home island, beside the cottage", size: "small", parts: ["garden beds", "bench"], fresh: false },
	],
	mood: "hopeful",
	recent: [{ name: "cottage", reason: "I wanted a small house here, somewhere warm to come back to." }],
};

function memoryLedger(fail: string[] = []) {
	const rows: LedgerRow[] = [];
	const state = { reads: 0, inserts: 0 };
	const store: LedgerStore = {
		async readDay(day) {
			const n = ++state.reads;
			if (fail.includes(`read${n}`)) return { ok: false, code: "08006" };
			return { ok: true, value: rows.filter((r) => r.day === day).map((r) => ({ ...r })) };
		},
		async insert(row) {
			const n = ++state.inserts;
			if (fail.includes(`insert${n}`)) return { ok: false, code: "42501" };
			rows.push({ id: rows.length + 1, ...row });
			return { ok: true, value: rows.length };
		},
	};
	return { rows, store, factory: vi.fn<(token: string) => LedgerStore>(() => store) };
}
type Served = { text?: string; model?: string; status?: string; refusal?: boolean };
function openai(served: Served = {}): Mock<typeof fetch> {
	return vi.fn<typeof fetch>(async (_url, init) => {
		const sent = JSON.parse(String(init?.body)) as { model: string };
		const content = served.refusal ? [{ type: "refusal", refusal: "No." }] : [{ type: "output_text", text: served.text ?? '{"pick":1,"line":"I wanted a light at the edge, so the island can be found at night."}', annotations: [] }];
		return Response.json(
			{ id: "resp_1", object: "response", status: served.status ?? "completed", incomplete_details: null, model: served.model ?? sent.model, output: [{ type: "message", id: "m", status: "completed", role: "assistant", content }], usage: USAGE },
			{ headers: { "x-request-id": "req_will1" } },
		);
	});
}
function rig(o: { env?: Env; ledger?: ReturnType<typeof memoryLedger>; fetcher?: Mock<typeof fetch> } = {}) {
	const ledger = o.ledger ?? memoryLedger();
	const fetcher = o.fetcher ?? openai();
	const logs: { event: string; fields: Record<string, string | number | null> }[] = [];
	const deps: ChatDeps = {
		env: () => o.env ?? ENV,
		user: async (request) => {
			const id = TOKENS[bearerToken(request) ?? ""];
			return id ? { id } : null;
		},
		token: (request) => bearerToken(request),
		ledger: ledger.factory,
		fetch: fetcher,
		now: () => NOW,
		log: (event, fields) => {
			logs.push({ event, fields });
		},
		actions: { list: vi.fn(async () => null), run: vi.fn(async () => ({ kind: "ignored" as const })), cancelWaiting: vi.fn(async () => {}) },
		later: async (work) => {
			await work();
		},
	};
	return { deps, ledger, fetcher, logs };
}
const post = (payload: unknown, token: string | null = "gur-token") =>
	new Request("https://osmo.test/api/will", { method: "POST", headers: token === null ? {} : { authorization: `Bearer ${token}` }, body: typeof payload === "string" ? payload : JSON.stringify(payload) });
const read = async (r: Response) => (await r.json()) as Record<string, unknown>;
const answerWith = async (text: string) => {
	const { deps } = rig({ fetcher: openai({ text }) });
	return read(await handleWill(post(BODY), deps));
};

describe("POST /api/will: who may ask and whether it is on (spec 5.1)", () => {
	it("answers 401 with no token or an unknown one, 403 to another account, and never opens the ledger", async () => {
		for (const [token, status] of [[null, 401], ["stranger", 401], ["maya-token", 403]] as const) {
			const { deps, ledger, fetcher } = rig();
			const r = await handleWill(post(BODY, token), deps);
			expect(r.status, String(token)).toBe(status);
			expect(ledger.factory).not.toHaveBeenCalled();
			expect(fetcher).not.toHaveBeenCalled();
		}
	});
	it("answers off when OSMO_WILL is not exactly on, or the chat is off, and books nothing", async () => {
		for (const env of [{ ...ENV, OSMO_WILL: undefined }, { ...ENV, OSMO_WILL: "ON" }, { ...ENV, OSMO_WILL: "on " }, { ...ENV, OSMO_CHAT: "off" }, { ...ENV, OSMO_MINI_TOKENS_PER_DAY: undefined }]) {
			const { deps, ledger, fetcher } = rig({ env });
			const r = await handleWill(post(BODY), deps);
			expect(await read(r)).toEqual({ source: "fallback", reason: "off", usage: null });
			expect(r.headers.get("cache-control")).toBe("no-store");
			expect(ledger.rows).toEqual([]);
			expect(fetcher).not.toHaveBeenCalled();
		}
	});
	it("answers 405 to anything but POST", async () => {
		const { deps } = rig();
		expect((await handleWill(new Request("https://osmo.test/api/will", { headers: { authorization: "Bearer gur-token" } }), deps)).status).toBe(405);
	});
});

describe("the body's limits (spec 5.1)", () => {
	const bad: [string, unknown][] = [
		["not JSON", "{nope"],
		["two candidates", { ...BODY, candidates: BODY.candidates.slice(0, 2) }],
		["a name of 61", { ...BODY, candidates: [{ ...BODY.candidates[0], name: "n".repeat(61) }, BODY.candidates[1], BODY.candidates[2]] }],
		["a place of 81", { ...BODY, candidates: [{ ...BODY.candidates[0], place: "p".repeat(81) }, BODY.candidates[1], BODY.candidates[2]] }],
		["a size not known", { ...BODY, candidates: [{ ...BODY.candidates[0], size: "huge" }, BODY.candidates[1], BODY.candidates[2]] }],
		["six parts", { ...BODY, candidates: [{ ...BODY.candidates[0], parts: ["a", "b", "c", "d", "e", "f"] }, BODY.candidates[1], BODY.candidates[2]] }],
		["a part of 31", { ...BODY, candidates: [{ ...BODY.candidates[0], parts: ["x".repeat(31)] }, BODY.candidates[1], BODY.candidates[2]] }],
		["fresh as a word", { ...BODY, candidates: [{ ...BODY.candidates[0], fresh: "yes" }, BODY.candidates[1], BODY.candidates[2]] }],
		["another key", { ...BODY, candidates: [{ ...BODY.candidates[0], memory: "Gur likes towers" }, BODY.candidates[1], BODY.candidates[2]] }],
		["a mood of 201", { ...BODY, mood: "m".repeat(201) }],
		["four recent", { ...BODY, recent: [BODY.recent[0], BODY.recent[0], BODY.recent[0], BODY.recent[0]] }],
		["a reason of 141", { ...BODY, recent: [{ name: "cottage", reason: "r".repeat(141) }] }],
		["a key at the top", { ...BODY, gur: "anything" }],
	];
	it.each(bad)("refuses %s with a 400 and books nothing", async (_, payload) => {
		const { deps, ledger, fetcher } = rig();
		const r = await handleWill(post(payload), deps);
		expect(r.status).toBe(400);
		expect(await read(r)).toEqual({ error: "bad_request" });
		expect(ledger.rows).toEqual([]);
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("takes a body at its limits", () => {
		expect(checkWillBody({ ...BODY, mood: "m".repeat(200), recent: [{ name: "n".repeat(60), reason: "" }] })).not.toBeNull();
	});
});

describe("the call (spec 5.2)", () => {
	it("asks the conversation's model for strict JSON, 80 tokens at most, with his character, the rules and the builds, nothing of Gur's", async () => {
		const { deps, fetcher } = rig();
		const r = await handleWill(post(BODY), deps);
		expect(await read(r)).toEqual({ source: "model", pick: 1, line: "I wanted a light at the edge, so the island can be found at night.", usage: { usedToday: 641, usable: 630_000 } });
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0][0]).toBe(RESPONSES_URL);
		const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
		expect(sent).toMatchObject({ model: "gpt-5.4-mini-2026-03-17", max_output_tokens: 80, reasoning: { effort: "none" }, text: { verbosity: "low", format: WILL_FORMAT } });
		expect(sent.instructions).toContain(characterLines()[0]);
		expect(sent.input).toEqual([{ role: "user", content: willData(BODY) }]);
	});
	it("books the call and settles it in ai_calls, as the chat does", async () => {
		const { deps, ledger } = rig();
		await handleWill(post(BODY), deps);
		expect(ledger.rows).toHaveLength(2);
		expect(ledger.rows[1]).toMatchObject({ settles: 1, input_tokens: 610, output_tokens: 31 });
	});
	it("a bad line keeps the pick and drops the line", async () => {
		for (const text of [
			'{"pick":2,"line":"I wanted a garden!"}',
			'{"pick":2,"line":"I\'m building a garden."}',
			'{"pick":2,"line":"I wanted a garden \u{1F642}"}',
			'{"pick":2,"line":"I built this garden for Gur."}',
			`{"pick":2,"line":"I wanted ${"a very ".repeat(20)}garden."}`,
			'{"pick":2,"line":"CRISIS"}',
			'{"pick":2,"line":"I will remember this garden."}',
		]) {
			const out = await answerWith(text);
			expect(out, text).toMatchObject({ source: "model", pick: 2, line: null });
		}
	});
	it("falls back on a broken answer, another model, a refusal or a spent allowance", async () => {
		expect(await answerWith("not json")).toMatchObject({ source: "fallback", reason: "error" });
		expect(await answerWith('{"pick":3,"line":"I wanted a well."}')).toMatchObject({ source: "fallback", reason: "error" });
		for (const served of [{ model: "gpt-4o-mini" }, { refusal: true }, { status: "failed" }]) {
			const { deps } = rig({ fetcher: openai(served) });
			expect(await read(await handleWill(post(BODY), deps)), JSON.stringify(served)).toMatchObject({ source: "fallback", reason: "error" });
		}
		const { deps, fetcher } = rig({ env: { ...ENV, OSMO_MINI_TOKENS_PER_DAY: "1000" } });
		expect(await read(await handleWill(post(BODY), deps))).toMatchObject({ source: "fallback", reason: "allowance" });
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("checks a line by itself, and reads the model's JSON strictly", () => {
		expect(lineOk("  I wanted still water   to look at. ")).toBe("I wanted still water to look at.");
		expect(lineOk("")).toBeNull();
		expect(readWill('{"pick":0,"line":"I wanted a well."}')).toEqual({ pick: 0, line: "I wanted a well." });
		for (const t of ['{"pick":"0","line":"x"}', '{"pick":1.5,"line":"x"}', '{"pick":1}', "[]"]) expect(readWill(t), t).toBeNull();
	});
});
