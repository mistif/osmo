/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import type { OwnerDb } from "../server/admin";
import { answerPending, cancelAllPending, holdPending, TTL_MS } from "./confirm";
import { decisionOf } from "./decision-words";
import { fakeDb, type FakeDb } from "./fake-db";
import type { Def, Deps, Surface } from "./types";

const NOW = Date.parse("2026-10-07T12:00:00Z");

const runs: unknown[] = [];
const base = {
	tier: 3 as const,
	needsResult: false,
	line: "",
	unclear: "",
	check: (a: unknown) => ({ ok: true as const, args: a }),
	describe: () => "Do the thing",
	prepare: async (a: unknown) => ({ ok: true as const, args: a, summary: "Do it?" }),
};
const del: Def = {
	...base,
	name: "del",
	connector: "notes",
	voiceOk: true,
	run: async (args) => {
		runs.push(args);
		return { ok: true, say: "Deleted.", result: null };
	},
};
const mail: Def = {
	...base,
	name: "mail",
	connector: "mail",
	voiceOk: false,
	run: async (args) => {
		runs.push(args);
		return { ok: true, say: "Sent.", result: null };
	},
};

function setup(profile: Record<string, unknown> = {}) {
	runs.length = 0;
	const db = fakeDb({ profile: [{ levels: { notes: "act", mail: "act" }, ...profile }] }, "owner-1", () => NOW);
	const deps: Deps = { env: { OSMO_ACTIONS: "on" }, db: () => db, fetch: vi.fn() as any, registry: [del, mail], count: vi.fn() };
	return { db, deps };
}
const hold = (db: OwnerDb, def: Def = del, args: unknown = { id: 7 }, surface: Surface = "room", now = NOW) =>
	holdPending(db, { def, args, summary: "Do it?", surface, now });
const statuses = (db: FakeDb) => db.tables.pending_actions.map((r) => r.status);

describe("decisionOf", () => {
	it("takes only a bare yes or no", () => {
		expect(decisionOf("Yes!")).toBe("yes");
		expect(decisionOf(" go ahead. ")).toBe("yes");
		expect(decisionOf("never mind")).toBe("no");
		expect(decisionOf("Don't")).toBe("no");
		expect(decisionOf("yes please send it to Sam")).toBeNull();
		expect(decisionOf("")).toBeNull();
		expect(decisionOf("yes yes")).toBeNull();
	});
});

describe("holdPending", () => {
	it("keeps at most one waiting", async () => {
		const { db } = setup();
		const a = await hold(db);
		const b = await hold(db);
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(db.tables.pending_actions).toHaveLength(2);
		expect(db.tables.pending_actions.filter((r) => r.status === "pending")).toHaveLength(1);
		expect(db.tables.pending_actions.find((r) => r.id === a)?.status).toBe("cancelled");
		expect(new Date(db.tables.pending_actions[1].expires_at).getTime()).toBe(NOW + TTL_MS);
	});

	it("returns null when the insert fails", async () => {
		const { db } = setup();
		const failing = {
			owner: db.owner,
			from: (t: string) => ({ ...db.from(t), insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "x" } }) }) }) }),
		} as unknown as OwnerDb;
		expect(await hold(failing)).toBeNull();
	});
});

describe("answerPending", () => {
	it("yes runs the stored args exactly and logs the confirm", async () => {
		const { db, deps } = setup();
		const id = await hold(db, del, { id: 7 });
		const r = await answerPending(deps, "yes", "typed", NOW);
		expect(r).toEqual({ handled: true, reply: "Deleted." });
		expect(runs).toEqual([{ id: 7 }]);
		expect(statuses(db)).toEqual(["done"]);
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ surface: "confirm", name: "del", status: "done", pending_id: id });
	});

	it("no cancels and never runs", async () => {
		const { db, deps } = setup();
		await hold(db);
		expect(await answerPending(deps, "no", "typed", NOW)).toEqual({ handled: true, reply: "Cancelled." });
		expect(runs).toEqual([]);
		expect(statuses(db)).toEqual(["cancelled"]);
	});

	it("two yes at once run it once", async () => {
		const { db, deps } = setup();
		await hold(db);
		const [a, b] = await Promise.all([answerPending(deps, "yes", "typed", NOW), answerPending(deps, "yes", "typed", NOW)]);
		expect(runs).toHaveLength(1);
		expect([a, b].filter((x) => x.handled)).toHaveLength(1);
		expect([a, b]).toContainEqual({ handled: false });
	});

	it("an expired one is said once", async () => {
		const { db, deps } = setup();
		await hold(db);
		const late = NOW + TTL_MS + 1000;
		expect(await answerPending(deps, "yes", "typed", late)).toEqual({ handled: true, reply: "That request has expired. Ask me again if you still want it." });
		expect(runs).toEqual([]);
		expect(statuses(db)).toEqual(["expired"]);
		expect(await answerPending(deps, "yes", "typed", late)).toEqual({ handled: false });
	});

	it("a spoken yes does not send mail, a typed one does", async () => {
		const { db, deps } = setup();
		await hold(db, mail, { draft: 1 });
		expect(await answerPending(deps, "yes", "voice", NOW)).toEqual({ handled: true, reply: "For that one I need you to type yes." });
		expect(statuses(db)).toEqual(["pending"]);
		expect(runs).toEqual([]);
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: "Sent." });
		expect(runs).toEqual([{ draft: 1 }]);
	});

	it("a spoken yes is fine for a def that allows it", async () => {
		const { db, deps } = setup();
		await hold(db);
		expect((await answerPending(deps, "yes", "voice", NOW)).handled).toBe(true);
		expect(runs).toHaveLength(1);
	});

	it("a yes after Pause does nothing", async () => {
		const { db, deps } = setup();
		await hold(db);
		db.tables.profile[0].paused = true;
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: "I did nothing, because Osmo is paused or that setting changed." });
		expect(runs).toEqual([]);
		expect(statuses(db)).toEqual(["cancelled"]);
		expect(db.tables.actions[0]).toMatchObject({ status: "refused", surface: "confirm" });
	});

	it("a yes after the level was lowered does nothing", async () => {
		const { db, deps } = setup();
		await hold(db);
		db.tables.profile[0].levels = { notes: "off" };
		expect((await answerPending(deps, "yes", "typed", NOW)).handled).toBe(true);
		expect(runs).toEqual([]);
		expect(statuses(db)).toEqual(["cancelled"]);
	});

	it("a failed run ends failed", async () => {
		const { db, deps } = setup();
		const bad: Def = { ...del, run: async () => ({ ok: false, say: "No luck." }) };
		deps.registry = [bad];
		await hold(db);
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: "No luck." });
		expect(statuses(db)).toEqual(["failed"]);
	});

	it("an unknown name is cancelled and nothing runs", async () => {
		const { db, deps } = setup();
		await hold(db);
		deps.registry = [];
		expect((await answerPending(deps, "yes", "typed", NOW)).handled).toBe(true);
		expect(statuses(db)).toEqual(["cancelled"]);
	});
});

describe("cancelAllPending", () => {
	it("cancels the waiting one, after which nothing is handled", async () => {
		const { db, deps } = setup();
		await hold(db);
		await cancelAllPending(db);
		expect(statuses(db)).toEqual(["cancelled"]);
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: false });
		expect(await answerPending(deps, "no", "typed", NOW)).toEqual({ handled: false });
	});
});
