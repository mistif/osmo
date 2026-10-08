/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import type { OwnerDb } from "../server/admin";
import { CAP_GROUPS, capReached } from "./caps";
import { execute, logger } from "./execute";
import { fakeDb } from "./fake-db";
import { resolveLog, writeAction, type LogRow } from "./log";
import { levelOf, loadProfile } from "./profile";
import { REGISTRY } from "./registry";
import { decide } from "./tiers";
import { CONNECTORS, type Def, type Level, type RunCtx, type Tier } from "./types";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

// A db whose reads report an error, for the "a check that broke refuses" rules.
const broken = () =>
	({
		from: () => ({
			select: () => ({
				maybeSingle: async () => ({ data: null, error: { message: "x" } }),
				in: () => ({ in: () => ({ gte: async () => ({ count: null, error: { message: "x" } }) }) }),
			}),
		}),
	}) as unknown as OwnerDb;
const throwing = () =>
	({
		from: () => {
			throw new Error("boom");
		},
	}) as unknown as OwnerDb;

describe("decide", () => {
	const table: [Level, ...("run" | "hold" | "refuse")[]][] = [
		["off", "refuse", "refuse", "refuse"],
		["read", "run", "refuse", "refuse"],
		["ask", "run", "hold", "hold"],
		["act", "run", "run", "hold"],
	];
	for (const [level, ...want] of table) {
		it(`${level}: ${want.join(", ")}`, () => {
			expect(([1, 2, 3] as Tier[]).map((t) => decide(level, t))).toEqual(want);
		});
	}
});

describe("loadProfile", () => {
	it("reads the row", async () => {
		const db = fakeDb({
			profile: [{ timezone: "Europe/Stockholm", place: "Lund", lat: 55.7, lon: 13.19, paused: true, hide_reminder_text: true, levels: { reminders: "act", notes: "ask" } }],
		});
		expect(await loadProfile(db)).toEqual({
			timezone: "Europe/Stockholm",
			place: { label: "Lund", lat: 55.7, lon: 13.19 },
			paused: true,
			hideReminderText: true,
			levels: { reminders: "act", notes: "ask" },
		});
	});

	it("defaults when there is no row, and nothing is paused", async () => {
		expect(await loadProfile(fakeDb())).toEqual({ timezone: null, place: null, paused: false, hideReminderText: false, levels: {} });
	});

	it("ignores bad level strings and a half place", async () => {
		const db = fakeDb({ profile: [{ place: "Lund", lat: null, lon: 13, levels: { reminders: "act", notes: "root", weather: 5, mail: "read" } }] });
		const p = await loadProfile(db);
		expect(p.levels).toEqual({ reminders: "act", mail: "read" });
		expect(p.place).toBeNull();
	});

	it("is paused when the read errors", async () => {
		expect((await loadProfile(broken())).paused).toBe(true);
	});

	it("reads only the owner's row", async () => {
		const db = fakeDb({ profile: [{ user_id: "someone-else", paused: true, levels: { mail: "act" } }] });
		expect((await loadProfile(db)).levels).toEqual({});
	});

	it("levelOf is off for an unknown connector", () => {
		const p = { timezone: null, place: null, paused: false, hideReminderText: false, levels: { notes: "ask" as Level } };
		expect(levelOf(p, "notes")).toBe("ask");
		expect(levelOf(p, "mail")).toBe("off");
	});
});

describe("capReached", () => {
	const rows = (n: number, name: string, extra: Record<string, unknown> = {}) =>
		Array.from({ length: n }, () => ({ name, status: "done", at: iso(NOW - HOUR), ...extra }));

	it("is false at 49 and true at 50 reminders", async () => {
		expect(await capReached(fakeDb({ actions: rows(49, "reminder_set") }), "reminder_set", NOW)).toBe(false);
		expect(await capReached(fakeDb({ actions: rows(50, "reminder_set") }), "reminder_set", NOW)).toBe(true);
	});

	it("does not count rows older than 24 hours, failed rows or other names", async () => {
		const seed = [
			...rows(30, "reminder_set"),
			...rows(30, "reminder_set", { at: iso(NOW - 25 * HOUR) }),
			...rows(30, "reminder_set", { status: "failed" }),
			...rows(30, "note_add"),
		];
		expect(await capReached(fakeDb({ actions: seed }), "reminder_set", NOW)).toBe(false);
	});

	it("counts only the owner's rows", async () => {
		expect(await capReached(fakeDb({ actions: rows(60, "reminder_set", { user_id: "someone-else" }) }), "reminder_set", NOW)).toBe(false);
	});

	it("shares 100 between weather_now and weather_forecast", async () => {
		const seed = [...rows(60, "weather_now"), ...rows(39, "weather_forecast")];
		expect(await capReached(fakeDb({ actions: seed }), "weather_now", NOW)).toBe(false);
		expect(await capReached(fakeDb({ actions: [...seed, ...rows(1, "weather_forecast")] }), "weather_now", NOW)).toBe(true);
	});

	it("has no cap for an action outside the groups", async () => {
		expect(await capReached(fakeDb({ actions: rows(500, "note_list") }), "note_list", NOW)).toBe(false);
		expect(CAP_GROUPS.map((g) => g.limit)).toEqual([50, 100, 100, 30]);
	});

	it("refuses when the count cannot be read", async () => {
		expect(await capReached(broken(), "reminder_set", NOW)).toBe(true);
	});
});

describe("fakeDb select", () => {
	it("returns only the listed columns, and every column for *", async () => {
		const db = fakeDb({ t: [{ id: 1, a: "x", b: "y" }] });
		expect((await db.from("t").select("a,id")).data).toEqual([{ a: "x", id: 1 }]);
		expect((await db.from("t").select(" a , b ")).data).toEqual([{ a: "x", b: "y" }]);
		expect((await db.from("t").select("*")).data).toEqual([{ id: 1, a: "x", b: "y", user_id: "owner-1" }]);
		expect((await db.from("t").select("a").maybeSingle()).data).toEqual({ a: "x" });
	});
});

describe("writeAction", () => {
	const row: LogRow = { surface: "room", connector: "notes", name: "note_add", tier: 2, status: "done", summary: "x", error: null, pending_id: null };

	it("writes the row and returns its id", async () => {
		const db = fakeDb({}, "owner-1", () => NOW);
		expect(await writeAction(db, row)).toBe(1);
		expect(await writeAction(db, row)).toBe(2);
		expect(db.tables.actions[0]).toMatchObject({ user_id: "owner-1", name: "note_add", status: "done", at: iso(NOW) });
	});

	it("cuts the summary to 200 characters", async () => {
		const db = fakeDb();
		await writeAction(db, { ...row, summary: "a".repeat(500) });
		expect(db.tables.actions[0].summary).toHaveLength(200);
	});

	it("writes only the eight columns, and cuts the error to 200 characters", async () => {
		const db = fakeDb();
		await writeAction(db, { ...row, text: "secret words", error: "e".repeat(500) } as LogRow);
		const got = db.tables.actions[0];
		expect(got).not.toHaveProperty("text");
		expect(JSON.stringify(got)).not.toContain("secret words");
		expect(Object.keys(got).sort()).toEqual(["at", "connector", "created_at", "error", "id", "name", "pending_id", "status", "summary", "surface", "tier", "user_id"]);
		expect(got.error).toHaveLength(200);
	});

	it("returns null instead of throwing", async () => {
		expect(await writeAction(throwing(), row)).toBeNull();
		const failing = {
			from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "x" } }) }) }) }),
		} as unknown as OwnerDb;
		expect(await writeAction(failing, row)).toBeNull();
	});
});

describe("resolveLog", () => {
	const row: LogRow = { surface: "room", connector: "notes", name: "note_add", tier: 2, status: "waiting", summary: "keep me", error: null, pending_id: null };

	it("updates the status by id and leaves the summary alone", async () => {
		const db = fakeDb();
		const id = (await writeAction(db, row))!;
		await writeAction(db, row);
		await resolveLog(db, id, "done");
		expect(db.tables.actions.map((r) => r.status)).toEqual(["done", "waiting"]);
		expect(db.tables.actions[0]).toMatchObject({ summary: "keep me", error: null });
	});

	it("sets the error, cut to 200 characters, only when one is given", async () => {
		const db = fakeDb();
		const id = (await writeAction(db, row))!;
		await resolveLog(db, id, "failed", "e".repeat(500));
		expect(db.tables.actions[0]).toMatchObject({ status: "failed" });
		expect(db.tables.actions[0].error).toHaveLength(200);
	});

	it("never touches another owner's row and never throws", async () => {
		const db = fakeDb({ actions: [{ id: 5, status: "waiting" }] }, "owner-1");
		db.tables.actions[0].user_id = "someone-else";
		await resolveLog(db, 5, "done");
		expect(db.tables.actions[0].status).toBe("waiting");
		await expect(resolveLog(throwing(), 1, "done")).resolves.toBeUndefined();
	});
});

const def = (run: Def["run"]): Def => ({
	name: "note_add",
	connector: "notes",
	tier: 2,
	needsResult: false,
	voiceOk: true,
	line: "note_add: add a note",
	unclear: "I did not catch that.",
	check: (args) => ({ ok: true, args }),
	describe: () => "Add a note.",
	run,
});

describe("execute", () => {
	const rc = (db: OwnerDb) => ({ db, now: NOW, timezone: null, profile: {}, fetch, env: {} }) as unknown as RunCtx;

	it("returns done with the run's say and logs done", async () => {
		const db = fakeDb();
		const d = def(async () => ({ ok: true, say: "Noted.", result: null }));
		const out = await execute(d, {}, rc(db), logger(db, d, "room"));
		expect(out).toEqual({ kind: "done", line: "Noted.", result: null });
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "done", summary: "Noted.", surface: "room", connector: "notes", tier: 2, error: null });
	});

	it("logs the def's logLine for a done run, and still returns the say", async () => {
		const db = fakeDb();
		const seen: unknown[] = [];
		const d = { ...def(async () => ({ ok: true, say: "Saved: my secret.", result: null })), logLine: (a: unknown, o: unknown) => (seen.push(a, o), "Added a note") } as Def;
		expect(await execute(d, { text: "my secret" }, rc(db), logger(db, d, "room"))).toEqual({ kind: "done", line: "Saved: my secret.", result: null });
		expect(db.tables.actions[0]).toMatchObject({ status: "done", summary: "Added a note" });
		expect(seen).toEqual([{ text: "my secret" }, { ok: true, say: "Saved: my secret.", result: null }]);
	});

	it("falls back to describe when logLine throws, and keeps the done result", async () => {
		const db = fakeDb();
		const d = { ...def(async () => ({ ok: true, say: "Noted.", result: null })), logLine: () => { throw new Error("x"); } } as Def;
		expect((await execute(d, {}, rc(db), logger(db, d, "room"))).kind).toBe("done");
		expect(db.tables.actions[0]).toMatchObject({ status: "done", summary: "Add a note." });
	});

	it("logs the def's describe, not the say or logLine, for a failed run", async () => {
		const db = fakeDb();
		const d = { ...def(async () => ({ ok: false as const, say: "No such thing: my secret." })), logLine: () => "Added a note" } as Def;
		expect(await execute(d, {}, rc(db), logger(db, d, "room"))).toEqual({ kind: "failed", line: "No such thing: my secret." });
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", summary: "Add a note.", error: "run" });
		expect(JSON.stringify(db.tables.actions[0])).not.toContain("secret");
	});

	it("passes a result on for call 2", async () => {
		const db = fakeDb();
		const d = def(async () => ({ ok: true, say: "Two.", result: "a; b" }));
		expect(await execute(d, {}, rc(db), logger(db, d, "room"))).toEqual({ kind: "done", line: "Two.", result: "a; b" });
	});

	it("turns a failed result into failed and logs it", async () => {
		const db = fakeDb();
		const d = def(async () => ({ ok: false, say: "No such thing." }));
		expect(await execute(d, {}, rc(db), logger(db, d, "room"))).toEqual({ kind: "failed", line: "No such thing." });
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", error: "run" });
	});

	it("turns a throwing run into a plain failure, logs it and does not retry", async () => {
		const db = fakeDb();
		const run = vi.fn(async (): Promise<never> => {
			throw new Error("secret detail");
		});
		const d = def(run);
		const out = await execute(d, {}, rc(db), logger(db, d, "cron", "p-1"));
		expect(out).toEqual({ kind: "failed", line: "That did not work just now." });
		expect(run).toHaveBeenCalledTimes(1);
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", summary: "Add a note.", error: "exception", surface: "cron", pending_id: "p-1" });
		expect(JSON.stringify(db.tables.actions)).not.toContain("secret detail");
	});
});

describe("registry", () => {
	it("keeps its invariants", () => {
		const names = REGISTRY.map((d) => d.name);
		expect(new Set(names).size).toBe(names.length);
		for (const d of REGISTRY) {
			expect(CONNECTORS as readonly string[]).toContain(d.connector);
			expect(d.line).toContain(d.name);
			if (d.tier === 3) expect(d.prepare).toBeTypeOf("function");
		}
	});
});

describe("fakeDb", () => {
	it("filters by owner, stamps inserts and supports the query chain", async () => {
		const db = fakeDb({ notes: [{ id: 5, text: "mine" }, { id: 6, user_id: "x", text: "theirs" }] }, "owner-1", () => NOW);
		await db.from("notes").insert([{ text: "a" }, { text: "b" }]);
		const all = await db.from("notes").select("*").order("id", { ascending: false }).limit(2);
		expect(all.data!.map((r: any) => r.text)).toEqual(["b", "a"]);
		expect(db.tables.notes.find((r) => r.text === "a")).toMatchObject({ id: 6 + 1, user_id: "owner-1", at: iso(NOW), created_at: iso(NOW) });
		const counted = await db.from("notes").select("id", { count: "exact", head: true }).limit(1);
		expect(counted).toMatchObject({ count: 3, data: null });
		const one = await db.from("notes").select("*").eq("text", "mine").single();
		expect(one.data).toMatchObject({ id: 5 });
		expect((await db.from("notes").select("*").eq("text", "zzz").single()).error).toMatchObject({ code: "PGRST116" });
		expect((await db.from("notes").select("*").eq("text", "zzz").maybeSingle()).data).toBeNull();
	});

	it("updates, upserts and deletes only the owner's rows", async () => {
		const db = fakeDb({ t: [{ id: 1, k: "a", v: 1 }, { id: 2, user_id: "x", k: "a", v: 1 }] });
		const upd = await db.from("t").update({ v: 9 }).eq("k", "a").select("id");
		expect(upd.data).toHaveLength(1);
		expect(db.tables.t.map((r) => r.v)).toEqual([9, 1]);
		await db.from("t").upsert({ k: "a", v: 3 }, "user_id,k");
		await db.from("t").upsert({ k: "b", v: 4 }, "user_id,k");
		expect(db.tables.t.filter((r) => r.user_id === "owner-1").map((r) => [r.k, r.v])).toEqual([["a", 3], ["b", 4]]);
		await db.from("t").delete().eq("k", "a");
		expect(db.tables.t.map((r) => r.user_id)).toEqual(["x", "owner-1"]);
	});

	it("compares ISO strings with gt, gte, lt and lte", async () => {
		const db = fakeDb({ t: [{ at: "2026-10-01" }, { at: "2026-10-02" }, { at: "2026-10-03" }] });
		const n = async (q: any) => (await q).data.length;
		expect(await n(db.from("t").select("*").gt("at", "2026-10-02"))).toBe(1);
		expect(await n(db.from("t").select("*").gte("at", "2026-10-02"))).toBe(2);
		expect(await n(db.from("t").select("*").lt("at", "2026-10-02"))).toBe(1);
		expect(await n(db.from("t").select("*").lte("at", "2026-10-02"))).toBe(2);
	});
});
