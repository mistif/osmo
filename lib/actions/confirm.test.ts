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

	it("links the pending row to its waiting log row", async () => {
		const { db } = setup();
		const id = await hold(db);
		const waiting = db.tables.actions.find((r) => r.status === "waiting");
		expect(waiting).toMatchObject({ name: "del", surface: "room", pending_id: id });
		expect(db.tables.pending_actions.find((r) => r.id === id)?.action_id).toBe(waiting?.id);
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
		expect(db.tables.actions.map((r) => r.status)).toEqual(["done", "done"]);
		expect(db.tables.actions[0]).toMatchObject({ summary: "Do it?", error: null });
		expect(db.tables.actions[1]).toMatchObject({ surface: "confirm", name: "del", status: "done", pending_id: id });
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
		expect(db.tables.actions.at(-1)).toMatchObject({ status: "refused", surface: "confirm" });
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

// The second call on pending_actions is the claim (the first is the peek); swap runs just before it.
function swapAtClaim(db: FakeDb, swap: () => void): OwnerDb {
	let n = 0;
	return {
		owner: db.owner,
		from: (t: string) => {
			if (t === "pending_actions" && ++n === 2) swap();
			return db.from(t);
		},
	} as unknown as OwnerDb;
}

describe("answerPending between the peek and the claim", () => {
	it("a swapped-in row is not claimed and nothing runs", async () => {
		const { db, deps } = setup();
		const first = await hold(db, del, { id: 1 });
		deps.db = () =>
			swapAtClaim(db, () => {
				db.tables.pending_actions.find((r) => r.id === first)!.status = "cancelled";
				db.tables.pending_actions.push({ id: 99, user_id: db.owner, name: "mail", args: { draft: 9 }, status: "pending", expires_at: new Date(NOW + 60_000).toISOString() });
			});
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: false });
		expect(runs).toEqual([]);
		expect(db.tables.pending_actions.find((r) => r.id === 99)?.status).toBe("pending");
	});

	it("a spoken yes meeting a row that needs typing never runs it", async () => {
		const { db, deps } = setup();
		const first = await hold(db, del, { id: 1 });
		deps.db = () =>
			swapAtClaim(db, () => {
				Object.assign(db.tables.pending_actions.find((r) => r.id === first)!, { name: "mail", args: { draft: 9 } });
			});
		expect(await answerPending(deps, "yes", "voice", NOW)).toEqual({ handled: true, reply: "For that one I need you to type yes." });
		expect(runs).toEqual([]);
		expect(statuses(db)).toEqual(["cancelled"]);
	});
});

describe("answerPending when the run path throws", () => {
	it("marks the row failed and does nothing", async () => {
		const { db, deps } = setup();
		await hold(db);
		deps.db = () =>
			({
				owner: db.owner,
				from: (t: string) => {
					if (t === "profile") throw new Error("down");
					return db.from(t);
				},
			}) as unknown as OwnerDb;
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: "I did nothing, because Osmo is paused or that setting changed." });
		expect(runs).toEqual([]);
		expect(statuses(db)).toEqual(["failed"]);
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

const logs = (db: FakeDb) => db.tables.actions.map((r) => r.status);

describe("the waiting log row is resolved", () => {
	it("to done when the yes runs", async () => {
		const { db, deps } = setup();
		await hold(db);
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.actions[0]).toMatchObject({ status: "done", summary: "Do it?" });
	});

	it("to failed when the run fails", async () => {
		const { db, deps } = setup();
		deps.registry = [{ ...del, run: async () => ({ ok: false, say: "No luck." }) }];
		await hold(db);
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", summary: "Do it?" });
	});

	it("to cancelled on no", async () => {
		const { db, deps } = setup();
		await hold(db);
		await answerPending(deps, "no", "typed", NOW);
		expect(logs(db)).toEqual(["cancelled"]);
	});

	it("to cancelled when Pause blocks the yes, the refusal stays its own row", async () => {
		const { db, deps } = setup();
		await hold(db);
		db.tables.profile[0].paused = true;
		await answerPending(deps, "yes", "typed", NOW);
		expect(logs(db)).toEqual(["cancelled", "refused"]);
	});

	it("to expired when the answer comes late", async () => {
		const { db, deps } = setup();
		await hold(db);
		await answerPending(deps, "yes", "typed", NOW + TTL_MS + 1000);
		expect(statuses(db)).toEqual(["expired"]);
		expect(logs(db)).toEqual(["expired"]);
	});

	it("to cancelled when a newer one replaces it", async () => {
		const { db } = setup();
		await hold(db);
		await hold(db);
		expect(logs(db)).toEqual(["cancelled", "waiting"]);
	});

	it("to cancelled by cancelAllPending", async () => {
		const { db } = setup();
		await hold(db);
		await cancelAllPending(db);
		expect(logs(db)).toEqual(["cancelled"]);
	});

	it("to failed with error exception when the run path throws", async () => {
		const { db, deps } = setup();
		await hold(db);
		deps.db = () => ({ owner: db.owner, from: (t: string) => (t === "profile" ? ((): never => { throw new Error("down"); })() : db.from(t)) }) as unknown as OwnerDb;
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", error: "exception", summary: "Do it?" });
	});

	it("with a new failed row when the pending row has no log row and the run path throws", async () => {
		const { db, deps } = setup();
		const id = await hold(db);
		db.tables.actions.length = 0;
		db.tables.pending_actions.find((r) => r.id === id)!.action_id = null;
		deps.db = () => ({ owner: db.owner, from: (t: string) => (t === "profile" ? ((): never => { throw new Error("down"); })() : db.from(t)) }) as unknown as OwnerDb;
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", error: "exception", name: "del", surface: "confirm", pending_id: id });
	});
});

describe("finish when the pending update fails", () => {
	it("retries once and then gives up quietly", async () => {
		const { db, deps } = setup();
		await hold(db);
		let doneUpdates = 0;
		deps.db = () =>
			({
				owner: db.owner,
				from: (t: string) => {
					const real = db.from(t);
					if (t !== "pending_actions") return real;
					return { ...real, update: (v: { status: string }) => (v.status === "done" ? (doneUpdates++, { eq: async () => ({ error: { message: "x" } }) }) : real.update(v)) };
				},
			}) as unknown as OwnerDb;
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: "Deleted." });
		expect(doneUpdates).toBe(2);
		expect(runs).toHaveLength(1);
	});

	it("succeeds on the retry", async () => {
		const { db, deps } = setup();
		await hold(db);
		let n = 0;
		deps.db = () =>
			({
				owner: db.owner,
				from: (t: string) => {
					const real = db.from(t);
					if (t !== "pending_actions") return real;
					return { ...real, update: (v: { status: string }) => (v.status === "done" && ++n === 1 ? { eq: async () => ({ error: { message: "x" } }) } : real.update(v)) };
				},
			}) as unknown as OwnerDb;
		await answerPending(deps, "yes", "typed", NOW);
		expect(n).toBe(2);
		expect(statuses(db)).toEqual(["done"]);
	});
});
