/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { actDeps, handleAct, type ActDeps } from "./act";
import { fakeDb } from "./fake-db";
import { requireOwner } from "./owner";
import type { Def } from "./types";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const TOKENS: Record<string, string> = { good: "owner-1", other: "someone-else" };
const del: Def = {
	name: "del",
	connector: "notes",
	tier: 3,
	needsResult: false,
	voiceOk: true,
	line: "del",
	unclear: "",
	check: (a) => ({ ok: true, args: a }),
	describe: () => "Delete a note",
	prepare: async (a) => ({ ok: true, args: a, summary: "Delete it?" }),
	run: async () => ({ ok: true, say: "Deleted the note.", result: null }),
};

function setup(env: Record<string, string | undefined> = {}) {
	const db = fakeDb({ profile: [{ levels: { notes: "act" } }] }, "owner-1", () => NOW);
	const dbCalls = vi.fn(() => db);
	const lookup = vi.fn(async (t: string) => (TOKENS[t] ? { id: TOKENS[t] } : null));
	const deps: ActDeps = {
		deps: { env: { OSMO_OWNER_ID: "owner-1", OSMO_ACTIONS: "on", ...env }, db: dbCalls, fetch: vi.fn() as any, registry: [del], count: vi.fn() },
		lookup,
		now: () => NOW,
	};
	return { db, dbCalls, deps, lookup };
}
const post = (body: unknown, token: string | null = "good", method = "POST") =>
	new Request("http://localhost/api/act", {
		method,
		headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
		body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
	});
const hold = (db: ReturnType<typeof fakeDb>) =>
	db.from("pending_actions").insert({ name: "del", args: { id: 1 }, summary: "Delete it?", surface: "room", status: "pending", expires_at: new Date(NOW + 60_000).toISOString() });

describe("requireOwner", () => {
	it("401 without a token, 403 for another user, the id for the owner", async () => {
		const lookup = async (t: string) => (TOKENS[t] ? { id: TOKENS[t] } : null);
		const env = { OSMO_OWNER_ID: "owner-1" };
		expect(((await requireOwner(post({}, null), env, lookup)) as Response).status).toBe(401);
		expect(((await requireOwner(post({}, "nobody"), env, lookup)) as Response).status).toBe(401);
		expect(((await requireOwner(post({}, "other"), env, lookup)) as Response).status).toBe(403);
		expect(await requireOwner(post({}, "good"), env, lookup)).toEqual({ id: "owner-1" });
		expect(((await requireOwner(post({}, "good"), {}, lookup)) as Response).status).toBe(403);
	});

	it("401 when the lookup throws", async () => {
		const lookup = async () => {
			throw new Error("down");
		};
		expect(((await requireOwner(post({}, "good"), { OSMO_OWNER_ID: "owner-1" }, lookup)) as Response).status).toBe(401);
	});
});

describe("handleAct", () => {
	it("401 with no token, 403 for a stranger, 405 for GET", async () => {
		const { deps, dbCalls } = setup();
		expect((await handleAct(post({ decision: "yes" }, null), deps)).status).toBe(401);
		expect((await handleAct(post({ decision: "yes" }, "other"), deps)).status).toBe(403);
		expect((await handleAct(post(null, "good", "GET"), deps)).status).toBe(405);
		expect(dbCalls).not.toHaveBeenCalled();
	});

	it("400 for a guest, a bad decision, a bad via, a non-object and unreadable text", async () => {
		const { deps, dbCalls } = setup();
		const bodies: unknown[] = [{ decision: "yes", speaker: "guest" }, { decision: "maybe" }, { decision: "yes", via: "telepathy" }, { decision: 1 }, {}, [], "not json", "null", { decision: "yes", speaker: 3 }];
		for (const body of bodies) {
			const res = await handleAct(post(body), deps);
			expect(res.status).toBe(400);
			expect(res.headers.get("cache-control")).toBe("no-store");
		}
		expect(dbCalls).not.toHaveBeenCalled();
	});

	it("answers handled false with no db call when actions are off", async () => {
		for (const value of [undefined, "ON", "true"]) {
			const { deps, dbCalls } = setup({ OSMO_ACTIONS: value });
			for (const decision of ["yes", "no"]) {
				const res = await handleAct(post({ decision }), deps);
				expect(res.status).toBe(200);
				expect((await res.json()).handled).toBe(false);
			}
			expect(dbCalls).not.toHaveBeenCalled();
			// A crisis still cancels whatever is waiting, off or not.
			const crisis = await handleAct(post({ decision: "crisis" }), deps);
			expect((await crisis.json()).handled).toBe(false);
			expect(dbCalls).toHaveBeenCalled();
		}
	});

	it("a crisis cancels the waiting one and handles nothing", async () => {
		const { deps, db } = setup();
		await hold(db);
		const res = await handleAct(post({ decision: "crisis" }), deps);
		expect(await res.json()).toEqual({ handled: false, reply: null });
		expect(db.tables.pending_actions[0].status).toBe("cancelled");
	});

	it("yes runs it and returns the reply, typed by default", async () => {
		const { deps, db } = setup();
		await hold(db);
		const res = await handleAct(post({ decision: "yes" }), deps);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(await res.json()).toEqual({ handled: true, reply: "Deleted the note." });
		expect(db.tables.pending_actions[0].status).toBe("done");
	});

	it("no cancels it", async () => {
		const { deps, db } = setup();
		await hold(db);
		expect(await (await handleAct(post({ decision: "no", via: "voice", speaker: "owner" }), deps)).json()).toEqual({ handled: true, reply: "Cancelled." });
		expect(db.tables.pending_actions[0].status).toBe("cancelled");
	});

	it("nothing waiting is handled false", async () => {
		const { deps } = setup();
		expect(await (await handleAct(post({ decision: "yes" }), deps)).json()).toEqual({ handled: false, reply: null });
	});

	it("a broken db is handled false, not a crash", async () => {
		const { deps } = setup();
		deps.deps.db = () => {
			throw new Error("admin_unconfigured");
		};
		const res = await handleAct(post({ decision: "yes" }), deps);
		expect(res.status).toBe(200);
		expect((await res.json()).handled).toBe(false);
	});

	it("refuses a declared oversized body before reading it", async () => {
		const { deps, dbCalls } = setup();
		const req = new Request("http://localhost/api/act", {
			method: "POST",
			headers: { authorization: "Bearer good", "content-type": "application/json", "content-length": "20000" },
			body: JSON.stringify({ decision: "yes" }),
		});
		const read = vi.spyOn(req, "text");
		expect((await handleAct(req, deps)).status).toBe(400);
		expect(read).not.toHaveBeenCalled();
		expect(dbCalls).not.toHaveBeenCalled();
	});

	it("refuses an oversized body", async () => {
		const { deps } = setup();
		expect((await handleAct(post(JSON.stringify({ decision: "yes", pad: "x".repeat(20_000) })), deps)).status).toBe(400);
	});
});

describe("actDeps", () => {
	it("is wired to the real registry and clock", () => {
		const d = actDeps();
		expect(typeof d.lookup).toBe("function");
		expect(typeof d.now()).toBe("number");
		expect(Array.isArray(d.deps.registry)).toBe(true);
	});
});
