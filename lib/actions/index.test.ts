/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelWaiting, listEnabledActions, runAction } from "./index";
import { fakeDb, type FakeDb } from "./fake-db";
import type { ActionContext, Def, Deps } from "./types";

const NOW = Date.parse("2026-10-07T12:00:00Z"); // a Wednesday
const ctx: ActionContext = { userId: "owner-1", surface: "room", now: NOW };
const runs: string[] = [];

const text = (args: unknown): { ok: true; args: unknown } | { ok: false } => {
	const a = args as Record<string, unknown> | null | undefined;
	if (!a || typeof a !== "object" || Array.isArray(a)) return { ok: false };
	const keys = Object.keys(a);
	return keys.length === 1 && keys[0] === "text" && typeof a.text === "string" && a.text.length <= 50 ? { ok: true, args: a } : { ok: false };
};
const common = { needsResult: false, voiceOk: true, check: text, describe: (a: unknown) => `Do ${(a as { text: string }).text}` };
const peek: Def = {
	...common,
	name: "peek",
	connector: "weather",
	tier: 1,
	needsResult: true,
	line: "peek: look at the sky (tier 1)",
	unclear: "I did not catch where.",
	run: async () => {
		runs.push("peek");
		return { ok: true, say: "It is sunny.", result: "sunny, 21 degrees" };
	},
};
const make: Def = {
	...common,
	name: "make",
	connector: "reminders",
	tier: 2,
	line: "make: make a thing (tier 2)",
	unclear: "I did not catch that.",
	run: async () => {
		runs.push("make");
		return { ok: true, say: "Made it.", result: null };
	},
};
const capped: Def = { ...make, name: "reminder_set", line: "reminder_set: set a reminder (tier 2)" };
const wipe: Def = {
	...common,
	name: "wipe",
	connector: "notes",
	tier: 3,
	line: "wipe: delete a note (tier 3)",
	unclear: "I did not catch which note.",
	prepare: async (a) => ({ ok: true, args: a, summary: "Delete that note? Say yes to go ahead, or no." }),
	run: async () => {
		runs.push("wipe");
		return { ok: true, say: "Deleted.", result: null };
	},
};

function setup(over: { profile?: Record<string, unknown> | null; env?: Record<string, string | undefined>; seed?: Record<string, any[]> } = {}) {
	runs.length = 0;
	const profile = over.profile === null ? [] : [{ timezone: "Europe/Stockholm", place: "Malmo", lat: 55.6, lon: 13, levels: { weather: "act", reminders: "act", notes: "act" }, ...over.profile }];
	const db = fakeDb({ profile, ...over.seed }, "owner-1", () => NOW);
	const dbCalls = vi.fn(() => db);
	const count = vi.fn();
	const deps: Deps = { env: { OSMO_ACTIONS: "on", ...over.env }, db: dbCalls, fetch: vi.fn() as any, registry: [peek, make, capped, wipe], count };
	return { db, deps, dbCalls, count };
}
const levels = (db: FakeDb, l: Record<string, string>) => {
	db.tables.profile[0].levels = l;
};
const proposal = (name: string, args: unknown = { text: "hello" }) => ({ name, args: typeof args === "string" ? args : JSON.stringify(args) });

afterEach(() => vi.useRealTimers());

describe("when actions are off", () => {
	for (const value of [undefined, "ON", "on ", "true", "off", ""]) {
		it(`OSMO_ACTIONS ${JSON.stringify(value)} touches nothing`, async () => {
			const { deps, dbCalls } = setup({ env: { OSMO_ACTIONS: value } });
			expect(await runAction(proposal("make"), ctx, deps)).toEqual({ kind: "ignored" });
			expect(await listEnabledActions("owner-1", deps)).toBeNull();
			await cancelWaiting("owner-1", deps);
			expect(dbCalls).not.toHaveBeenCalled();
			expect(runs).toEqual([]);
		});
	}
});

describe("runAction gates", () => {
	it("ignores an unknown name and counts it", async () => {
		const { deps, count, db } = setup();
		expect(await runAction(proposal("launch_missiles"), ctx, deps)).toEqual({ kind: "ignored" });
		expect(count).toHaveBeenCalledWith("action.unknown");
		expect(db.tables.actions ?? []).toEqual([]);
	});

	it("ignores a malformed proposal", async () => {
		const { deps } = setup();
		expect(await runAction({ name: 5, args: "{}" } as any, ctx, deps)).toEqual({ kind: "ignored" });
		expect(await runAction({ name: "make", args: null } as any, ctx, deps)).toEqual({ kind: "ignored" });
		expect(await runAction(null as any, ctx, deps)).toEqual({ kind: "ignored" });
	});

	it("ignores everything while paused", async () => {
		const { deps, db } = setup({ profile: { paused: true } });
		expect(await runAction(proposal("make"), ctx, deps)).toEqual({ kind: "ignored" });
		expect(runs).toEqual([]);
		expect(db.tables.actions ?? []).toEqual([]);
	});

	it("ignores a caller who is not the owner", async () => {
		const { deps } = setup();
		expect(await runAction(proposal("make"), { ...ctx, userId: "someone-else" }, deps)).toEqual({ kind: "ignored" });
		expect(runs).toEqual([]);
	});

	it("ignores a db that cannot be made", async () => {
		const { deps } = setup();
		deps.db = () => {
			throw new Error("admin_unconfigured");
		};
		expect(await runAction(proposal("make"), ctx, deps)).toEqual({ kind: "ignored" });
	});

	const bad: [string, string][] = [
		["text that is not JSON", "not json"],
		["an array", "[1]"],
		["100 KB of text", "x".repeat(100_000)],
		["100 KB of valid JSON", JSON.stringify({ text: "x".repeat(100_000) })],
		["extra keys", JSON.stringify({ text: "hi", more: 1 })],
		["a nested object", JSON.stringify({ text: { deep: true } })],
		["an empty string", ""],
	];
	for (const [label, args] of bad) {
		it(`fails plainly on ${label}`, async () => {
			const { deps, db } = setup();
			expect(await runAction({ name: "make", args }, ctx, deps)).toEqual({ kind: "failed", line: make.unclear });
			expect(runs).toEqual([]);
			expect(db.tables.actions).toHaveLength(1);
			expect(db.tables.actions[0]).toMatchObject({ name: "make", status: "failed", error: "args" });
			expect(JSON.stringify(db.tables.actions)).not.toContain("xxxx");
		});
	}

	it("refuses when the connector is off", async () => {
		const { deps, db } = setup({ profile: { levels: {} } });
		expect(await runAction(proposal("make"), ctx, deps)).toEqual({ kind: "refused", line: "Your reminders setting is off." });
		expect(runs).toEqual([]);
		expect(db.tables.actions[0]).toMatchObject({ status: "refused", error: "level" });
	});

	it("refuses a tier 2 action at read level", async () => {
		const { deps } = setup({ profile: { levels: { reminders: "read" } } });
		expect(await runAction(proposal("make"), ctx, deps)).toEqual({ kind: "refused", line: "I can only read your reminders at the moment." });
		expect(runs).toEqual([]);
	});

	it("runs a tier 2 action at act level and logs it", async () => {
		const { deps, db } = setup();
		expect(await runAction(proposal("make"), ctx, deps)).toEqual({ kind: "done", line: "Made it.", result: null });
		expect(runs).toEqual(["make"]);
		expect(db.tables.actions[0]).toMatchObject({ surface: "room", name: "make", status: "done", connector: "reminders", tier: 2 });
	});

	it("runs a tier 1 action at read level and hands back the result", async () => {
		const { deps } = setup({ profile: { levels: { weather: "read" } } });
		expect(await runAction(proposal("peek"), ctx, deps)).toEqual({ kind: "done", line: "It is sunny.", result: "sunny, 21 degrees" });
	});

	it("holds a tier 2 action at ask level", async () => {
		const { deps, db } = setup({ profile: { levels: { reminders: "ask" } } });
		const out = await runAction(proposal("make", { text: "later" }), ctx, deps);
		expect(out).toEqual({ kind: "waiting", line: "Do later? Say yes to go ahead, or no." });
		expect(runs).toEqual([]);
		expect(db.tables.pending_actions).toHaveLength(1);
		expect(db.tables.pending_actions[0]).toMatchObject({ name: "make", status: "pending", args: { text: "later" } });
	});

	it("holds a tier 3 action even at act level, with prepare's summary", async () => {
		const { deps, db } = setup();
		const out = await runAction(proposal("wipe"), ctx, deps);
		expect(out).toEqual({ kind: "waiting", line: "Delete that note? Say yes to go ahead, or no." });
		expect(runs).toEqual([]);
		const pending = db.tables.pending_actions[0];
		expect(pending.status).toBe("pending");
		expect(db.tables.actions[0]).toMatchObject({ status: "waiting", name: "wipe", pending_id: pending.id, tier: 3 });
	});

	it("fails with prepare's words when prepare fails", async () => {
		const { deps, db } = setup();
		deps.registry = [{ ...wipe, prepare: async () => ({ ok: false, say: "I found two notes like that." }) }];
		expect(await runAction(proposal("wipe"), ctx, deps)).toEqual({ kind: "failed", line: "I found two notes like that." });
		expect(db.tables.pending_actions ?? []).toEqual([]);
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", error: "prepare" });
	});

	it("a failed hold says so", async () => {
		const { deps, db } = setup();
		const real = db.from.bind(db);
		deps.db = () =>
			({
				owner: db.owner,
				from: (t: string) => (t === "pending_actions" ? { ...real(t), insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "x" } }) }) }) } : real(t)),
			}) as any;
		expect(await runAction(proposal("wipe"), ctx, deps)).toEqual({ kind: "failed", line: "I could not set that up just now." });
	});

	it("refuses at the daily cap and not before", async () => {
		const rows = (n: number) => Array.from({ length: n }, () => ({ name: "reminder_set", status: "done", at: new Date(NOW - 3_600_000).toISOString() }));
		const below = setup({ seed: { actions: rows(49) } });
		expect((await runAction(proposal("reminder_set"), ctx, below.deps)).kind).toBe("done");
		const at = setup({ seed: { actions: rows(50) } });
		expect(await runAction(proposal("reminder_set"), ctx, at.deps)).toEqual({ kind: "refused", line: "I have reached today's limit for that." });
		expect(runs).toEqual([]);
		expect(at.db.tables.actions.at(-1)).toMatchObject({ status: "refused", error: "cap" });
	});

	it("turns a throwing run into a plain failure", async () => {
		const { deps } = setup();
		deps.registry = [
			{
				...make,
				run: async () => {
					throw new Error("boom");
				},
			},
		];
		expect(await runAction(proposal("make"), ctx, deps)).toEqual({ kind: "failed", line: "That did not work just now." });
	});

	it("never crashes when the db throws mid-way", async () => {
		const { deps, db } = setup();
		let calls = 0;
		deps.db = () =>
			({
				owner: db.owner,
				from: (t: string) => {
					if (++calls > 1) throw new Error("boom");
					return db.from(t);
				},
			}) as any;
		const out = await runAction(proposal("reminder_set"), ctx, deps);
		expect(out).toEqual({ kind: "failed", line: "That did not work just now." });
		expect(runs).toEqual([]);
	});

	it("matches the owner with spaces and capitals in the id", async () => {
		const { deps } = setup();
		expect((await runAction(proposal("make"), { ...ctx, userId: " OWNER-1 " }, deps)).kind).toBe("done");
	});
});

describe("listEnabledActions", () => {
	it("lists only the connectors that are not off", async () => {
		vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
		const { deps } = setup({ profile: { levels: { weather: "read", reminders: "off" } } });
		const got = await listEnabledActions("owner-1", deps);
		expect(got).not.toBeNull();
		expect(got!.names).toEqual(["peek"]);
		expect(got!.lines).toEqual([peek.line]);
		expect(got!.today).toMatch(/Wednesday/);
		expect(got!.today).toMatch(/7 October 2026/);
		expect(got!.timezone).toBe("Europe/Stockholm");
		expect(got!.place).toBe("Malmo");
	});

	it("offers only the actions the level allows to run or hold", async () => {
		const read = setup({ profile: { levels: { weather: "read", reminders: "read", notes: "read" } } });
		expect((await listEnabledActions("owner-1", read.deps))!.names).toEqual(["peek"]);
		const ask = setup({ profile: { levels: { weather: "read", reminders: "ask", notes: "ask" } } });
		expect((await listEnabledActions("owner-1", ask.deps))!.names).toEqual(["peek", "make", "reminder_set", "wipe"]);
		const none = setup({ profile: { levels: { reminders: "read", notes: "read" } } });
		expect(await listEnabledActions("owner-1", none.deps)).toBeNull();
	});

	it("says the time zone is not saved yet and the place is null", async () => {
		const { deps } = setup({ profile: { timezone: null, place: null, levels: { notes: "act" } } });
		const got = await listEnabledActions("owner-1", deps);
		expect(got).toMatchObject({ names: ["wipe"], timezone: "not saved yet", place: null });
	});

	it("is null with nothing enabled, when paused, for a stranger, and without a profile row", async () => {
		expect(await listEnabledActions("owner-1", setup({ profile: { levels: {} } }).deps)).toBeNull();
		expect(await listEnabledActions("owner-1", setup({ profile: { paused: true } }).deps)).toBeNull();
		expect(await listEnabledActions("someone-else", setup().deps)).toBeNull();
		expect(await listEnabledActions("owner-1", setup({ profile: null }).deps)).toBeNull();
	});

	it("is null when the db cannot be made", async () => {
		const { deps } = setup();
		deps.db = () => {
			throw new Error("admin_unconfigured");
		};
		expect(await listEnabledActions("owner-1", deps)).toBeNull();
	});
});

describe("cancelWaiting", () => {
	it("cancels the waiting row", async () => {
		const { deps, db } = setup();
		await runAction(proposal("wipe"), ctx, deps);
		expect(db.tables.pending_actions[0].status).toBe("pending");
		await cancelWaiting("owner-1", deps);
		expect(db.tables.pending_actions[0].status).toBe("cancelled");
	});

	it("swallows errors and ignores strangers", async () => {
		const { deps, db } = setup();
		await runAction(proposal("wipe"), ctx, deps);
		await cancelWaiting("someone-else", deps);
		expect(db.tables.pending_actions[0].status).toBe("pending");
		deps.db = () => {
			throw new Error("x");
		};
		await expect(cancelWaiting("owner-1", deps)).resolves.toBeUndefined();
	});
});

describe("levels checked at run time", () => {
	it("a lowered level refuses a later call", async () => {
		const { deps, db } = setup();
		expect((await runAction(proposal("make"), ctx, deps)).kind).toBe("done");
		levels(db, { reminders: "off" });
		expect((await runAction(proposal("make"), ctx, deps)).kind).toBe("refused");
	});
});
