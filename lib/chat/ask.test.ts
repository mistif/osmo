import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_WEIGHTS } from "../agent/state";
import { ASK_TIMEOUT_MS, askForReply, askStatus, nextUsage, type AskResult } from "./ask";
import type { ChatBody, ChatStatus } from "./types";

const BODY: ChatBody = {
	text: "What do you make of jazz?",
	history: [
		{ role: "user", text: "Good evening." },
		{ role: "agent", text: "Good evening, Gur. How can I help?" },
	],
	memory: [{ key: "name", value: "Gur" }],
	facts: { feeling: "calm", tone: "calm", cause: null, stage: "friend", milestone: null, heavy: false, awayMs: 0, userName: "Gur", turn: 2 },
	persona: { weights: DEFAULT_WEIGHTS, outlook: 0.2 },
};
const USAGE = { usedToday: 41_200, usable: 630_000 };

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// A fake fetch that gives every request the same answer and remembers what it was asked.
function answering(answer: () => Response | Promise<Response>) {
	const fetcher = vi.fn(async () => answer());
	return { fetcher, fetchFn: fetcher as unknown as typeof fetch };
}

const firstCall = (fetcher: { mock: { calls: unknown[] } }) => fetcher.mock.calls[0] as [string, RequestInit];

// A request that never answers, like a stalled network.
const hanging = () => new Promise<Response>(() => {});

// Like the browser's fetch: it rejects with an AbortError when its signal fires, and never answers otherwise.
const honouring = ((_url: string, init: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
	})) as unknown as typeof fetch;

const fellBack = (why: string, stop = false) => ({ kind: "fallback", why, usage: null, stop });

describe("askForReply", () => {
	it("posts the body to /api/chat with Gur's token", async () => {
		const { fetcher, fetchFn } = answering(() => json({ source: "model", reply: "Good evening.", usage: USAGE }));
		await askForReply(fetchFn, "token-abc", BODY);
		expect(fetcher).toHaveBeenCalledTimes(1);
		const [url, init] = firstCall(fetcher);
		expect(url).toBe("/api/chat");
		expect(init.method).toBe("POST");
		const headers = new Headers(init.headers);
		expect(headers.get("authorization")).toBe("Bearer token-abc");
		expect(headers.get("content-type")).toBe("application/json");
		expect(JSON.parse(String(init.body))).toEqual(BODY);
	});

	it("hands back a model reply with today's usage, and nothing else the route sent", async () => {
		const { fetchFn } = answering(() =>
			json({ source: "model", reply: "Jazz rewards patience. I rather like it.", usage: { ...USAGE, pool: "mini" }, debug: "x" }),
		);
		expect(await askForReply(fetchFn, "t", BODY)).toEqual({ kind: "model", reply: "Jazz rewards patience. I rather like it.", usage: USAGE, detection: null, waiting: false });
	});

	it("hands back the detection the route sent, unchecked: the room validates it", async () => {
		const { fetchFn } = answering(() => json({ source: "model", reply: "Hi.", usage: USAGE, detection: { tones: ["sad"] } }));
		expect(await askForReply(fetchFn, "t", BODY)).toEqual({ kind: "model", reply: "Hi.", usage: USAGE, detection: { tones: ["sad"] }, waiting: false });
	});

	it("reads waiting: true as a model answer that is waiting for Gur's yes or no", async () => {
		const { fetchFn } = answering(() => json({ source: "model", reply: "Delete the note buy milk? Say yes to go ahead, or no.", usage: USAGE, detection: null, waiting: true }));
		expect(await askForReply(fetchFn, "t", BODY)).toEqual({ kind: "model", reply: "Delete the note buy milk? Say yes to go ahead, or no.", usage: USAGE, detection: null, waiting: true });
	});

	it("reads a missing waiting, or anything but true, as false, so an older server still works", async () => {
		const sent: [string, Record<string, unknown>][] = [
			["missing", {}],
			["false", { waiting: false }],
			["null", { waiting: null }],
			["a string", { waiting: "yes" }],
			["a number", { waiting: 1 }],
		];
		for (const [label, extra] of sent) {
			const { fetchFn } = answering(() => json({ source: "model", reply: "Hi.", usage: USAGE, ...extra }));
			expect(await askForReply(fetchFn, "t", BODY), label).toEqual({ kind: "model", reply: "Hi.", usage: USAGE, detection: null, waiting: false });
		}
	});

	it("reads a missing, null or non-object detection as null, never a bad answer, so an older server still works", async () => {
		const sent: [string, Record<string, unknown>][] = [
			["missing", {}],
			["null", { detection: null }],
			["a string", { detection: "sad" }],
			["a number", { detection: 3 }],
			["true", { detection: true }],
		];
		for (const [label, extra] of sent) {
			const { fetchFn } = answering(() => json({ source: "model", reply: "Hi.", usage: USAGE, ...extra }));
			expect(await askForReply(fetchFn, "t", BODY), label).toEqual({ kind: "model", reply: "Hi.", usage: USAGE, detection: null, waiting: false });
		}
	});

	it("turns each fallback reason into a fallback, and stops asking only on off", async () => {
		const cases: [string, unknown, AskResult][] = [
			["off", null, { kind: "fallback", why: "off", usage: null, stop: true }],
			["allowance", USAGE, { kind: "fallback", why: "allowance", usage: USAGE, stop: false }],
			["error", USAGE, { kind: "fallback", why: "error", usage: USAGE, stop: false }],
			["error", null, { kind: "fallback", why: "error", usage: null, stop: false }],
			["empty", USAGE, { kind: "fallback", why: "empty", usage: USAGE, stop: false }],
		];
		for (const [reason, usage, expected] of cases) {
			const { fetchFn } = answering(() => json({ source: "fallback", reason, usage }));
			expect(await askForReply(fetchFn, "t", BODY), `${reason} ${JSON.stringify(usage)}`).toEqual(expected);
		}
	});

	it("reads the model's crisis flag as a crisis, with or without usage", async () => {
		for (const usage of [USAGE, null]) {
			const { fetchFn } = answering(() => json({ source: "fallback", reason: "crisis", usage }));
			expect(await askForReply(fetchFn, "t", BODY), JSON.stringify(usage)).toEqual({ kind: "crisis", usage });
		}
	});

	it("falls back on a 400, 401, 403 or 5xx, and stops asking only on a 403", async () => {
		const cases: [number, () => Response, boolean][] = [
			[400, () => json({ error: "bad_request" }, 400), false],
			[401, () => json({ error: "unauthorized" }, 401), false],
			[403, () => json({ error: "forbidden" }, 403), true],
			[405, () => json({ error: "method" }, 405), false],
			[500, () => new Response("Internal Server Error", { status: 500 }), false],
			[502, () => new Response("<html>Bad gateway</html>", { status: 502 }), false],
			[503, () => json({ source: "model", reply: "Hello.", usage: USAGE }, 503), false],
		];
		for (const [status, answer, stop] of cases) {
			const { fetchFn } = answering(answer);
			expect(await askForReply(fetchFn, "t", BODY), String(status)).toEqual(fellBack("http", stop));
		}
	});

	it("falls back when the network fails", async () => {
		const offline = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(await askForReply(offline, "t", BODY)).toEqual(fellBack("network"));
	});

	it("gives up when the time runs out, and aborts the request", async () => {
		expect(ASK_TIMEOUT_MS).toBe(25_000);
		const { fetcher, fetchFn } = answering(hanging);
		const started = Date.now();
		expect(await askForReply(fetchFn, "t", BODY, undefined, 50)).toEqual(fellBack("timeout"));
		expect(Date.now() - started).toBeLessThan(1000);
		expect(firstCall(fetcher)[1].signal?.aborted).toBe(true);
	});

	it("gives up on a body that never finishes arriving", async () => {
		const { fetchFn } = answering(() => new Response(new ReadableStream({ start() {} }), { status: 200 }));
		expect(await askForReply(fetchFn, "t", BODY, undefined, 50)).toEqual(fellBack("timeout"));
	});

	it("stops waiting when the room aborts, and aborts the request", async () => {
		const { fetcher, fetchFn } = answering(hanging);
		const room = new AbortController();
		setTimeout(() => room.abort(), 20);
		expect(await askForReply(fetchFn, "t", BODY, room.signal, 5_000)).toEqual(fellBack("aborted"));
		expect(firstCall(fetcher)[1].signal?.aborted).toBe(true);
	});

	it("asks nothing when the room has already aborted", async () => {
		const { fetcher, fetchFn } = answering(() => json({ source: "model", reply: "Hello.", usage: USAGE }));
		const room = new AbortController();
		room.abort();
		expect(await askForReply(fetchFn, "t", BODY, room.signal)).toEqual(fellBack("aborted"));
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("reports a timeout or an abort, not a network error, when fetch rejects on its signal", async () => {
		expect(await askForReply(honouring, "t", BODY, undefined, 50)).toEqual(fellBack("timeout"));
		const room = new AbortController();
		setTimeout(() => room.abort(), 20);
		expect(await askForReply(honouring, "t", BODY, room.signal, 5_000)).toEqual(fellBack("aborted"));
	});

	it("treats an answer of the wrong shape as a bad answer", async () => {
		const bad: [string, () => Response][] = [
			["not JSON", () => new Response("<html>oops</html>", { status: 200 })],
			["no body", () => new Response(null, { status: 204 })],
			["null", () => json(null)],
			["a list", () => json([])],
			["no source", () => json({ reply: "Hello.", usage: USAGE })],
			["an unknown source", () => json({ source: "oracle", reply: "Hello.", usage: USAGE })],
			["a blank reply", () => json({ source: "model", reply: "   ", usage: USAGE })],
			["a reply that isn't text", () => json({ source: "model", reply: 42, usage: USAGE })],
			["a model reply with null usage", () => json({ source: "model", reply: "Hello.", usage: null })],
			["a model reply without usage", () => json({ source: "model", reply: "Hello." })],
			["an unknown reason", () => json({ source: "fallback", reason: "no_key", usage: null })],
			["a fallback without usage", () => json({ source: "fallback", reason: "error" })],
			["a count that is text", () => json({ source: "fallback", reason: "error", usage: { usedToday: "41200", usable: 630_000 } })],
			["a negative count", () => json({ source: "fallback", reason: "allowance", usage: { usedToday: -1, usable: 630_000 } })],
			["a fractional count", () => json({ source: "fallback", reason: "allowance", usage: { usedToday: 1.5, usable: 630_000 } })],
			["a missing count", () => json({ source: "fallback", reason: "allowance", usage: { usedToday: 5 } })],
		];
		for (const [label, answer] of bad) {
			const { fetchFn } = answering(answer);
			expect(await askForReply(fetchFn, "t", BODY), label).toEqual(fellBack("bad_answer"));
		}
	});

	it("never throws, whatever fetch does", async () => {
		const wild: [string, unknown][] = [
			[
				"throws at once",
				() => {
					throw new Error("boom");
				},
			],
			["rejects with something that isn't an error", () => Promise.reject("nope")],
			["resolves to nothing", async () => undefined],
			["returns something that isn't a promise", () => 42],
			[
				"answers with a body that throws",
				async () => ({
					ok: true,
					status: 200,
					json: () => {
						throw new Error("locked");
					},
				}),
			],
		];
		for (const [label, fetchFn] of wild) {
			const result = await askForReply(fetchFn as typeof fetch, "t", BODY, undefined, 200);
			expect(result, label).toMatchObject({ kind: "fallback", usage: null, stop: false });
		}
	});

	it("never signs anyone out: every outcome is one request to /api/chat and nothing more", async () => {
		const outcomes: [string, () => Response | Promise<Response>][] = [
			["a model reply", () => json({ source: "model", reply: "Hello.", usage: USAGE })],
			["off", () => json({ source: "fallback", reason: "off", usage: null })],
			["a crisis flag", () => json({ source: "fallback", reason: "crisis", usage: USAGE })],
			["400", () => json({ error: "bad_request" }, 400)],
			["401", () => json({ error: "unauthorized" }, 401)],
			["403", () => json({ error: "forbidden" }, 403)],
			["500", () => new Response("Internal Server Error", { status: 500 })],
			["a timeout", hanging],
		];
		for (const [label, answer] of outcomes) {
			const { fetcher, fetchFn } = answering(answer);
			await askForReply(fetchFn, "t", BODY, undefined, 50);
			expect(fetcher, label).toHaveBeenCalledTimes(1);
			expect(firstCall(fetcher)[0], label).toBe("/api/chat");
		}
	});

	it("imports nothing at run time, so it can't reach Supabase or sign anyone out", () => {
		const source = readFileSync(new URL("./ask.ts", import.meta.url), "utf8");
		const imports = source.match(/^import\b.*$/gm) ?? [];
		expect(imports.length).toBeGreaterThan(0);
		for (const line of imports) expect(line, line).toMatch(/^import type \{[^}]*\} from "\.\/types";$/);
	});
});

describe("askStatus", () => {
	it("asks /api/chat with Gur's token and reads today's status", async () => {
		const { fetcher, fetchFn } = answering(() => json({ enabled: true, usedToday: 41_200, usable: 630_000 }));
		expect(await askStatus(fetchFn, "token-abc")).toEqual({ enabled: true, usedToday: 41_200, usable: 630_000 });
		expect(fetcher).toHaveBeenCalledTimes(1);
		const [url, init] = firstCall(fetcher);
		expect(url).toBe("/api/chat");
		expect(init.method).toBe("GET");
		expect(init.cache).toBe("no-store");
		expect(init.body).toBeUndefined();
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-abc");
	});

	it("reads off, and on without today's count", async () => {
		const statuses: ChatStatus[] = [
			{ enabled: false, usedToday: null, usable: null },
			{ enabled: true, usedToday: null, usable: null },
		];
		for (const status of statuses) {
			const { fetchFn } = answering(() => json(status));
			expect(await askStatus(fetchFn, "t"), JSON.stringify(status)).toEqual(status);
		}
	});

	it("keeps only the three fields", async () => {
		const { fetchFn } = answering(() => json({ enabled: true, usedToday: 1, usable: 2, model: "gpt-5.4-mini-2026-03-17" }));
		expect(await askStatus(fetchFn, "t")).toEqual({ enabled: true, usedToday: 1, usable: 2 });
	});

	it("is null on a 401, a 403 or a 5xx, whatever the body says", async () => {
		const refusals: [number, () => Response][] = [
			[401, () => json({ error: "unauthorized" }, 401)],
			[403, () => json({ enabled: true, usedToday: 0, usable: 630_000 }, 403)],
			[503, () => new Response("Service Unavailable", { status: 503 })],
		];
		for (const [status, answer] of refusals) {
			const { fetchFn } = answering(answer);
			expect(await askStatus(fetchFn, "t"), String(status)).toBeNull();
		}
	});

	it("is null when the network fails, the time runs out or the body can't be read", async () => {
		const offline = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(await askStatus(offline, "t")).toBeNull();
		const { fetcher, fetchFn } = answering(hanging);
		const started = Date.now();
		expect(await askStatus(fetchFn, "t", 50)).toBeNull();
		expect(Date.now() - started).toBeLessThan(1000);
		expect(firstCall(fetcher)[1].signal?.aborted).toBe(true);
		const garbled = answering(() => new Response("<html>oops</html>", { status: 200 }));
		expect(await askStatus(garbled.fetchFn, "t")).toBeNull();
	});

	it("is null for a status of the wrong shape", async () => {
		const bad: unknown[] = [
			null,
			[],
			{},
			{ enabled: "yes", usedToday: 1, usable: 2 },
			{ enabled: true, usedToday: 1 },
			{ enabled: true, usedToday: 1, usable: null },
			{ enabled: true, usedToday: -1, usable: 2 },
			{ enabled: true, usedToday: 1.5, usable: 2 },
			{ enabled: true, usedToday: "1", usable: 2 },
		];
		for (const status of bad) {
			const { fetchFn } = answering(() => json(status));
			expect(await askStatus(fetchFn, "t"), JSON.stringify(status)).toBeNull();
		}
	});
});

describe("nextUsage", () => {
	const OFF: ChatStatus = { enabled: false, usedToday: null, usable: null };
	const BEFORE: ChatStatus = { enabled: true, usedToday: 10_000, usable: 630_000 };

	it("turns the line off once the room stops asking (a 403 or off)", () => {
		const stops: AskResult[] = [
			{ kind: "fallback", why: "http", usage: null, stop: true },
			{ kind: "fallback", why: "off", usage: null, stop: true },
		];
		for (const result of stops) {
			expect(nextUsage(BEFORE, result), JSON.stringify(result)).toEqual(OFF);
			expect(nextUsage(null, result), JSON.stringify(result)).toEqual(OFF);
		}
	});

	it("shows today's numbers from any other answer that carries them", () => {
		const carrying: AskResult[] = [
			{ kind: "model", reply: "Hello.", usage: USAGE, detection: null, waiting: false },
			{ kind: "crisis", usage: USAGE },
			{ kind: "fallback", why: "allowance", usage: USAGE, stop: false },
			{ kind: "fallback", why: "error", usage: USAGE, stop: false },
			{ kind: "fallback", why: "empty", usage: USAGE, stop: false },
		];
		for (const result of carrying) {
			expect(nextUsage(BEFORE, result), JSON.stringify(result)).toEqual({ enabled: true, ...USAGE });
		}
	});

	it("leaves the line as it was when the answer has no numbers", () => {
		const bare: AskResult[] = [
			{ kind: "crisis", usage: null },
			{ kind: "fallback", why: "error", usage: null, stop: false },
			{ kind: "fallback", why: "http", usage: null, stop: false },
			{ kind: "fallback", why: "network", usage: null, stop: false },
			{ kind: "fallback", why: "timeout", usage: null, stop: false },
			{ kind: "fallback", why: "aborted", usage: null, stop: false },
			{ kind: "fallback", why: "bad_answer", usage: null, stop: false },
		];
		for (const result of bare) {
			expect(nextUsage(BEFORE, result), JSON.stringify(result)).toBe(BEFORE);
			expect(nextUsage(null, result), JSON.stringify(result)).toBeNull();
		}
	});

	it("follows what the route answered, end to end", async () => {
		const after = async (answer: () => Response) => nextUsage(BEFORE, await askForReply(answering(answer).fetchFn, "t", BODY));
		expect(await after(() => json({ error: "forbidden" }, 403))).toEqual(OFF);
		expect(await after(() => json({ source: "fallback", reason: "off", usage: null }))).toEqual(OFF);
		expect(await after(() => json({ error: "unauthorized" }, 401))).toBe(BEFORE);
		expect(await after(() => json({ source: "model", reply: "Hello.", usage: USAGE }))).toEqual({ enabled: true, ...USAGE });
	});
});
