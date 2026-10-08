/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { buildDef } from "./build";
import { capReached } from "./caps";
import { execute, logger } from "./execute";
import { fakeDb, type FakeDb } from "./fake-db";
import { buildGate, listEnabledActions, runAction } from "./index";
import { DEFAULT_PROFILE } from "./profile";
import { REGISTRY } from "./registry";
import type { ActionContext, Deps, RunCtx } from "./types";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const HOUR = 3_600_000;
const iso = (t: number) => new Date(t).toISOString();
const ctx: ActionContext = { userId: "owner-1", surface: "room", now: NOW };
const check = (a: unknown) => buildDef.check(a, { now: NOW, timezone: null });
const rows = (n: number, status: string, ageMs = HOUR, name = "build") => Array.from({ length: n }, () => ({ name, status, at: iso(NOW - ageMs) }));

function setup(over: { level?: string; paused?: boolean; actions?: any[]; env?: Record<string, string | undefined> } = {}) {
	const db = fakeDb({ profile: [{ paused: over.paused ?? false, levels: { artifacts: over.level ?? "act" } }], actions: over.actions ?? [] }, "owner-1", () => NOW);
	const deps: Deps = { env: { OSMO_ACTIONS: "on", OSMO_BUILD: "on", ...over.env }, db: () => db, fetch: vi.fn() as any, registry: REGISTRY, count: vi.fn() };
	return { db, deps };
}
const rc = (db: FakeDb): RunCtx => ({ now: NOW, timezone: null, db, profile: DEFAULT_PROFILE, fetch: vi.fn() as any, env: {} });

describe("buildDef.check", () => {
	it("trims a good brief", () => expect(check({ brief: " a tip splitter " })).toEqual({ ok: true, args: { brief: "a tip splitter" } }));
	it("accepts an empty from", () => expect(check({ brief: "x", from: "" })).toEqual({ ok: true, args: { brief: "x" } }));
	it("refuses an empty brief, 501 characters, an extra key, a number, a non-empty from", () => {
		for (const bad of [{ brief: "" }, { brief: "   " }, { brief: "x".repeat(501) }, { brief: "x", extra: 1 }, { brief: 5 }, 5, null, [], { brief: "x", from: "t1" }, {}]) {
			expect(check(bad).ok).toBe(false);
		}
		expect(check({ brief: "x".repeat(500) }).ok).toBe(true);
	});
});
describe("buildDef.run and execute", () => {
	it("run returns no spoken line and a ticket with the brief", async () => {
		expect(await buildDef.run({ brief: "a tip splitter" }, rc(fakeDb()))).toEqual({ ok: true, say: "", result: null, ticket: { brief: "a tip splitter" } });
	});
	it("logLine and describe carry no brief", () => {
		expect(buildDef.logLine?.({ brief: "secret plan" }, { ok: true, say: "", result: null })).toBe("Started building something.");
		expect(buildDef.describe({ brief: "secret plan" })).not.toContain("secret");
	});
	it("execute returns done with a ticket whose actionId is the logged row, and the table never holds the brief", async () => {
		const db = fakeDb({}, "owner-1", () => NOW);
		const out = await execute(buildDef, { brief: "a very private calculator" }, rc(db), logger(db, buildDef, "room"));
		expect(out.kind).toBe("done");
		const id = db.tables.actions[0].id;
		expect(out).toMatchObject({ kind: "done", ticket: { brief: "a very private calculator", actionId: id } });
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ name: "build", connector: "artifacts", tier: 2, status: "done", summary: "Started building something." });
		expect(JSON.stringify(db.tables)).not.toContain("private calculator");
	});
});
describe("the daily cap", () => {
	it("30 done builds in 24 hours is the cap, 29 is not", async () => {
		expect(await capReached(fakeDb({ actions: rows(30, "done") }, "owner-1", () => NOW), "build", NOW)).toBe(true);
		expect(await capReached(fakeDb({ actions: rows(29, "done") }, "owner-1", () => NOW), "build", NOW)).toBe(false);
	});
	it("failed builds count too: 30 done and 1 failed is 31", async () => {
		const db = fakeDb({ actions: [...rows(29, "done"), ...rows(1, "failed")] }, "owner-1", () => NOW);
		expect(await capReached(db, "build", NOW)).toBe(true);
		expect(await capReached(fakeDb({ actions: [...rows(28, "done"), ...rows(1, "failed")] }, "owner-1", () => NOW), "build", NOW)).toBe(false);
	});
	it("refused and waiting rows do not count", async () => {
		const db = fakeDb({ actions: [...rows(29, "done"), ...rows(5, "refused"), ...rows(5, "waiting")] }, "owner-1", () => NOW);
		expect(await capReached(db, "build", NOW)).toBe(false);
	});
	it("extra moves the line: 30 rows is under with extra 1, 31 is over", async () => {
		expect(await capReached(fakeDb({ actions: rows(30, "done") }, "owner-1", () => NOW), "build", NOW, 1)).toBe(false);
		expect(await capReached(fakeDb({ actions: rows(31, "done") }, "owner-1", () => NOW), "build", NOW, 1)).toBe(true);
	});
	it("a row 25 hours old does not count", async () => {
		const db = fakeDb({ actions: [...rows(29, "done"), ...rows(5, "done", 25 * HOUR)] }, "owner-1", () => NOW);
		expect(await capReached(db, "build", NOW)).toBe(false);
	});
	it("other actions keep counting done rows only", async () => {
		const db = fakeDb({ actions: [...rows(50, "failed", HOUR, "reminder_set")] }, "owner-1", () => NOW);
		expect(await capReached(db, "reminder_set", NOW)).toBe(false);
	});
});
describe("buildGate", () => {
	it("is off while OSMO_BUILD is unset or not exactly on", async () => {
		for (const v of [undefined, "ON", "true", ""]) {
			const { deps } = setup({ env: { OSMO_BUILD: v } });
			expect(await buildGate("owner-1", NOW, deps)).toBe("off");
		}
	});
	it("is off while OSMO_ACTIONS is unset", async () => {
		const { deps } = setup({ env: { OSMO_ACTIONS: undefined } });
		expect(await buildGate("owner-1", NOW, deps)).toBe("off");
	});
	it("is off at level off, level read, level ask, paused, and for another user", async () => {
		for (const level of ["off", "read", "ask"]) expect(await buildGate("owner-1", NOW, setup({ level }).deps)).toBe("off");
		expect(await buildGate("owner-1", NOW, setup({ paused: true }).deps)).toBe("off");
		expect(await buildGate("someone-else", NOW, setup().deps)).toBe("off");
	});
	it("is ok at level act, and cap at 31 rows (the ticket's own row is one of them)", async () => {
		expect(await buildGate("owner-1", NOW, setup().deps)).toBe("ok");
		expect(await buildGate("owner-1", NOW, setup({ actions: rows(30, "done") }).deps)).toBe("ok");
		expect(await buildGate("owner-1", NOW, setup({ actions: rows(31, "done") }).deps)).toBe("cap");
	});
	it("is off when the database cannot be reached", async () => {
		const { deps } = setup();
		deps.db = () => {
			throw new Error("admin_unconfigured");
		};
		expect(await buildGate("owner-1", NOW, deps)).toBe("off");
	});
});
describe("runAction with the real registry", () => {
	const propose = { name: "build", args: JSON.stringify({ brief: "a tip splitter" }) };
	it("at level act it is done with a ticket and one log row", async () => {
		const { db, deps } = setup();
		const out = await runAction(propose, ctx, deps);
		expect(out).toMatchObject({ kind: "done", line: "", result: null, ticket: { brief: "a tip splitter", actionId: db.tables.actions[0].id } });
		expect(db.tables.actions).toHaveLength(1);
		expect(JSON.stringify(db.tables.actions)).not.toContain("tip splitter");
	});
	it("at level off it is refused", async () => {
		const { db, deps } = setup({ level: "off" });
		expect(await runAction(propose, ctx, deps)).toMatchObject({ kind: "refused" });
		expect(db.tables.actions[0]).toMatchObject({ status: "refused", error: "level" });
	});
	it("at the cap it is refused and says so", async () => {
		const { deps } = setup({ actions: rows(30, "done") });
		expect(await runAction(propose, ctx, deps)).toMatchObject({ kind: "refused" });
	});
	it("a brief that fails the check is a failed action with no ticket", async () => {
		const { deps } = setup();
		const out = await runAction({ name: "build", args: JSON.stringify({ brief: "" }) }, ctx, deps);
		expect(out).toEqual({ kind: "failed", line: buildDef.unclear });
	});
	it("at level ask it is refused in his register, never held for a yes, and logs a refused row", async () => {
		for (const level of ["ask", "read"]) {
			const { db, deps } = setup({ level });
			expect(await runAction(propose, ctx, deps)).toEqual({ kind: "refused", line: "I can only build things when that is set to act." });
			expect(db.tables.actions).toHaveLength(1);
			expect(db.tables.actions[0]).toMatchObject({ status: "refused", error: "level" });
			expect(db.tables.pending_actions ?? []).toHaveLength(0);
		}
	});
	it("listEnabledActions offers build at level act only, never at ask, read or off", async () => {
		expect((await listEnabledActions("owner-1", setup({ level: "act" }).deps))?.names).toContain("build");
		expect((await listEnabledActions("owner-1", setup({ level: "ask" }).deps))?.names ?? []).not.toContain("build");
		expect((await listEnabledActions("owner-1", setup({ level: "read" }).deps))?.names ?? []).not.toContain("build");
		expect((await listEnabledActions("owner-1", setup({ level: "off" }).deps))?.names ?? []).not.toContain("build");
	});
});
