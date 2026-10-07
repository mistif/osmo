/* eslint-disable @typescript-eslint/no-explicit-any */
// The action loop end to end with the real registry: runAction, the waiting confirmation, answerPending,
// the daily caps and listEnabledActions, against fakeDb. Nothing here touches the network or Supabase.
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerPending, DID_NOTHING, EXPIRED, TTL_MS } from "./confirm";
import { fakeDb } from "./fake-db";
import { cancelWaiting, listEnabledActions, runAction } from "./index";
import { REGISTRY } from "./registry";
import type { ActionContext, Deps } from "./types";

const NOW = Date.parse("2026-10-07T12:00:00Z"); // a Wednesday
const ctx: ActionContext = { userId: "owner-1", surface: "room", now: NOW };
const iso = (t: number) => new Date(t).toISOString();
const CURRENT = { current: { temperature_2m: 14, apparent_temperature: 12, weather_code: 61, wind_speed_10m: 5 } };
afterEach(() => vi.useRealTimers());
const LIMIT_LINE = "I have reached today's limit for that.";

function setup(over: { levels?: Record<string, string>; paused?: boolean; notes?: string[]; actions?: Record<string, unknown>[] } = {}) {
	const notes = (over.notes ?? ["buy milk and eggs"]).map((text, i) => ({ id: i + 1, text, created_at: iso(NOW - (10 - i) * 60_000) }));
	const db = fakeDb(
		{
			profile: [{ timezone: "Europe/Stockholm", place: "Malmo", lat: 55.6, lon: 13, paused: over.paused ?? false, levels: over.levels ?? { reminders: "act", notes: "act", weather: "read" } }],
			notes,
			actions: over.actions ?? [],
		},
		"owner-1",
		() => NOW,
	);
	const fetch = vi.fn(async () => new Response(JSON.stringify(CURRENT), { status: 200 }));
	const deps: Deps = { env: { OSMO_ACTIONS: "on" }, db: () => db, fetch: fetch as any, registry: REGISTRY, count: vi.fn() };
	return { db, deps, fetch };
}
const propose = (name: string, args: unknown) => ({ name, args: JSON.stringify(args) });
const setReminder = propose("reminder_set", { text: "call Dad", at: "2026-10-08T09:00" });
const deleteMilk = propose("note_delete", { match: "milk" });
const history = (n: number, name: string, at: number) => Array.from({ length: n }, () => ({ name, status: "done", at: iso(at) }));

describe("the real registry", () => {
	it("holds exactly the eight actions of reminders, notes and weather, each once", () => {
		expect(REGISTRY.map((d) => d.name)).toEqual(["reminder_set", "reminder_list", "reminder_cancel", "note_add", "note_search", "note_delete", "weather_now", "weather_forecast"]);
	});
	it("makes note_delete the only tier 3, with a prepare, and every action speakable", () => {
		expect(REGISTRY.filter((d) => d.tier === 3).map((d) => d.name)).toEqual(["note_delete"]);
		for (const d of REGISTRY) {
			if (d.tier === 3) expect(d.prepare).toBeTypeOf("function");
			expect(d.voiceOk).toBe(true);
		}
	});
	it("is a no-op while OSMO_ACTIONS is not on", async () => {
		const { db, deps } = setup();
		deps.env = {};
		expect(await runAction(setReminder, ctx, deps)).toEqual({ kind: "ignored" });
		expect(db.tables.reminders ?? []).toEqual([]);
		expect(db.tables.actions).toEqual([]);
	});
});

describe("a reminder at each level", () => {
	it("act: done at once, a pending row, a done log row", async () => {
		const { db, deps } = setup();
		const out = await runAction(setReminder, ctx, deps);
		expect(out).toEqual({ kind: "done", line: "Reminder set for Thursday 8 October at 09:00: call Dad.", result: null });
		expect(db.tables.reminders).toHaveLength(1);
		expect(db.tables.reminders[0]).toMatchObject({ text: "call Dad", status: "pending", due_at: "2026-10-08T07:00:00.000Z" });
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ name: "reminder_set", connector: "reminders", tier: 2, status: "done", surface: "room" });
	});
	it("read: refused, nothing saved, a refused log row", async () => {
		const { db, deps } = setup({ levels: { reminders: "read", notes: "act", weather: "read" } });
		expect(await runAction(setReminder, ctx, deps)).toEqual({ kind: "refused", line: "I can only read your reminders at the moment." });
		expect(db.tables.reminders ?? []).toEqual([]);
		expect(db.tables.actions[0]).toMatchObject({ name: "reminder_set", status: "refused", error: "level" });
	});
	it("off: refused with the setting line", async () => {
		const { deps } = setup({ levels: {} });
		expect(await runAction(setReminder, ctx, deps)).toEqual({ kind: "refused", line: "Your reminders setting is off." });
	});
	it("ask: waiting, and a yes runs it", async () => {
		const { db, deps } = setup({ levels: { reminders: "ask", notes: "act", weather: "read" } });
		const out = await runAction(setReminder, ctx, deps);
		expect(out).toEqual({ kind: "waiting", line: "Set a reminder: call Dad? Say yes to go ahead, or no." });
		expect(db.tables.reminders ?? []).toEqual([]);
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: "Reminder set for Thursday 8 October at 09:00: call Dad." });
		expect(db.tables.reminders).toHaveLength(1);
		expect(db.tables.actions.map((r) => r.status)).not.toContain("waiting");
		expect(db.tables.pending_actions.map((r) => r.status)).toEqual(["done"]);
	});
});

describe("weather", () => {
	it("is allowed at the read level, and asks Open-Meteo for the saved place only", async () => {
		const { db, deps, fetch } = setup();
		const out = await runAction(propose("weather_now", { place: "" }), ctx, deps);
		expect(out).toEqual({ kind: "done", line: "Now 14 degrees, feels like 12, light rain, wind 5 kilometres per hour.", result: "Now 14 degrees, feels like 12, light rain, wind 5 kilometres per hour." });
		expect(fetch).toHaveBeenCalledTimes(1);
		const u = new URL(String((fetch.mock.calls[0] as any[])[0]));
		expect(u.hostname).toBe("api.open-meteo.com");
		expect(u.searchParams.get("latitude")).toBe("55.6");
		expect(db.tables.actions[0]).toMatchObject({ name: "weather_now", status: "done", tier: 1 });
	});
	it("names another city: a plain line, no request", async () => {
		const { deps, fetch } = setup();
		const out = await runAction(propose("weather_now", { place: "Paris" }), ctx, deps);
		expect(out).toEqual({ kind: "failed", line: "I only know your saved place for now." });
		expect(fetch).not.toHaveBeenCalled();
	});
	it("stops at 100 a day, counting only the last 24 hours", async () => {
		const { deps, fetch } = setup({ actions: history(100, "weather_forecast", NOW - 3_600_000) });
		expect(await runAction(propose("weather_now", { place: "" }), ctx, deps)).toEqual({ kind: "refused", line: LIMIT_LINE });
		expect(fetch).not.toHaveBeenCalled();
		const old = setup({ actions: history(100, "weather_now", NOW - 25 * 3_600_000) });
		expect((await runAction(propose("weather_now", { place: "" }), ctx, old.deps)).kind).toBe("done");
	});
});

describe("the daily cap", () => {
	it("refuses the 51st reminder with the limit line", async () => {
		const { db, deps } = setup({ actions: history(50, "reminder_set", NOW - 3_600_000) });
		expect(await runAction(setReminder, ctx, deps)).toEqual({ kind: "refused", line: LIMIT_LINE });
		expect(db.tables.reminders ?? []).toEqual([]);
		expect(db.tables.actions.at(-1)).toMatchObject({ name: "reminder_set", status: "refused", error: "cap" });
	});
	it("does not count rows 25 hours old", async () => {
		const { deps } = setup({ actions: history(50, "reminder_set", NOW - 25 * 3_600_000) });
		expect((await runAction(setReminder, ctx, deps)).kind).toBe("done");
	});
	it("allows the 50th", async () => {
		const { deps } = setup({ actions: history(49, "reminder_set", NOW - 3_600_000) });
		expect((await runAction(setReminder, ctx, deps)).kind).toBe("done");
	});
});

describe("note_delete, the first confirmed action", () => {
	it("holds for a yes with the note quoted, and deletes nothing yet", async () => {
		const { db, deps } = setup();
		const out = await runAction(deleteMilk, ctx, deps);
		expect(out).toEqual({ kind: "waiting", line: 'Delete this note: "buy milk and eggs"? Say yes to delete it, or no.' });
		expect(db.tables.notes).toHaveLength(1);
		expect(db.tables.pending_actions).toHaveLength(1);
		expect(db.tables.pending_actions[0]).toMatchObject({ name: "note_delete", args: { id: 1 }, status: "pending" });
		expect(db.tables.actions[0]).toMatchObject({ name: "note_delete", tier: 3, status: "waiting", summary: "Waiting for your yes to delete a note" });
		expect(db.tables.pending_actions[0].summary).toContain("buy milk and eggs"); // server-only, swept
	});
	it("holds even at the act level, and also at ask", async () => {
		for (const level of ["act", "ask"]) {
			const { deps } = setup({ levels: { notes: level } });
			expect((await runAction(deleteMilk, ctx, deps)).kind).toBe("waiting");
		}
	});
	it("is refused at read, with nothing held", async () => {
		const { db, deps } = setup({ levels: { notes: "read" } });
		expect(await runAction(deleteMilk, ctx, deps)).toEqual({ kind: "refused", line: "I can only read your notes at the moment." });
		expect(db.tables.pending_actions ?? []).toEqual([]);
	});
	it("no leaves the note and settles the log row", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		expect(await answerPending(deps, "no", "typed", NOW)).toEqual({ handled: true, reply: "Cancelled." });
		expect(db.tables.notes).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "cancelled" });
		expect(db.tables.pending_actions[0]).toMatchObject({ status: "cancelled" });
	});
	it("yes deletes it and the one waiting log row becomes the one done row", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: "Deleted the note." });
		expect(db.tables.notes).toEqual([]);
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ name: "note_delete", status: "done", surface: "room", summary: "Deleted a note", pending_id: db.tables.pending_actions[0].id });
		expect(db.tables.pending_actions[0]).toMatchObject({ status: "done" });
	});
	it("a second proposal replaces the first, and the yes goes to the second", async () => {
		const { db, deps } = setup({ notes: ["buy milk and eggs", "call Dad about the car"] });
		await runAction(deleteMilk, ctx, deps);
		const second = await runAction(propose("note_delete", { match: "dad" }), ctx, deps);
		expect(second).toMatchObject({ kind: "waiting", line: expect.stringContaining("call Dad about the car") });
		expect(db.tables.pending_actions.map((r) => r.status)).toEqual(["cancelled", "pending"]);
		expect(db.tables.actions.map((r) => r.status)).toEqual(["cancelled", "waiting"]);
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.notes.map((n) => n.text)).toEqual(["buy milk and eggs"]);
	});
	it("a yes after eleven minutes gets the expired line and the note stays", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		expect(await answerPending(deps, "yes", "typed", NOW + TTL_MS + 60_000)).toEqual({ handled: true, reply: EXPIRED });
		expect(db.tables.notes).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "expired" });
	});
	it("a yes after Pause leaves the note", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		db.tables.profile[0].paused = true;
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: DID_NOTHING });
		expect(db.tables.notes).toHaveLength(1);
	});
	it("a yes after the level was lowered leaves the note", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		db.tables.profile[0].levels = { notes: "off" };
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: true, reply: DID_NOTHING });
		expect(db.tables.notes).toHaveLength(1);
	});
	it("two yes answers at once delete once", async () => {
		const { db, deps } = setup({ notes: ["buy milk and eggs", "call Dad"] });
		await runAction(deleteMilk, ctx, deps);
		const both = await Promise.all([answerPending(deps, "yes", "typed", NOW), answerPending(deps, "yes", "typed", NOW)]);
		expect(both.filter((a) => a.handled)).toEqual([{ handled: true, reply: "Deleted the note." }]);
		expect(db.tables.notes.map((n) => n.text)).toEqual(["call Dad"]);
		expect(db.tables.actions.map((r) => [r.name, r.status])).toEqual([["note_delete", "done"]]);
	});
	it("a spoken yes works, because a note is small", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		expect(await answerPending(deps, "yes", "voice", NOW)).toEqual({ handled: true, reply: "Deleted the note." });
		expect(db.tables.notes).toEqual([]);
	});
	it("deletes the stored note even if a newer one now matches the words", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		db.tables.notes.push({ id: 9, user_id: "owner-1", text: "milk again", created_at: iso(NOW) });
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.notes.map((n) => n.id)).toEqual([9]);
	});
	it("two notes that match, or none, hold nothing and say why", async () => {
		const { db, deps } = setup({ notes: ["buy milk", "milk the cow"] });
		expect(await runAction(deleteMilk, ctx, deps)).toEqual({ kind: "failed", line: "I found 2 like that. Please say a little more." });
		expect(await runAction(propose("note_delete", { match: "pizza" }), ctx, deps)).toEqual({ kind: "failed", line: "I could not find one like that." });
		expect(db.tables.pending_actions ?? []).toEqual([]);
		expect(db.tables.notes).toHaveLength(2);
	});
});

describe("the log never carries note, reminder or weather text", () => {
	const rows = (db: { tables: Record<string, any[]> }) => db.tables.actions.map((r) => r.summary as string);
	it("writes only code-written lines for a search, a delete-hold, a yes, a reminder list and a cancel", async () => {
		const { db, deps, fetch } = setup({ notes: ["secret pickle plan for Friday", "another note"] });
		const DAILY = { daily: { time: ["2026-10-07", "2026-10-08"], weather_code: [61, 3], temperature_2m_max: [14, 12], temperature_2m_min: [8, 7], precipitation_probability_max: [60, 10] } };
		await runAction(propose("reminder_set", { text: "call Dad about the secret pickle plan", at: "2026-10-08T09:00" }), ctx, deps);
		await runAction(propose("note_add", { text: "secret pickle plan, again" }), ctx, deps);
		await runAction(propose("note_search", { query: "pickle" }), ctx, deps);
		await runAction(propose("note_search", { query: "zzz" }), ctx, deps);
		await runAction(propose("reminder_list", {}), ctx, deps);
		await runAction(propose("weather_now", { place: "" }), ctx, deps);
		fetch.mockImplementationOnce(async () => new Response(JSON.stringify(DAILY), { status: 200 }));
		await runAction(propose("weather_forecast", { place: "", days: 2 }), ctx, deps);
		await runAction(propose("note_delete", { match: "another" }), ctx, deps);
		await answerPending(deps, "yes", "typed", NOW);
		await runAction(propose("reminder_cancel", { match: "dad" }), ctx, deps);
		expect(rows(db)).toEqual([
			"Set a reminder for Thursday 8 October at 09:00",
			"Added a note",
			"Read 2 notes",
			"Read no notes",
			"Read your reminders",
			"Checked the weather",
			"Checked the weather",
			"Deleted a note",
			"Cancelled a reminder",
		]);
		const all = JSON.stringify(db.tables.actions);
		for (const secret of ["pickle", "another", "call Dad", "Malmo"]) expect(all).not.toContain(secret);
	});
	it("keeps text out of the refused rows too", async () => {
		const read = setup({ levels: { reminders: "read", notes: "act", weather: "read" } });
		await runAction(propose("reminder_set", { text: "call Dad about the secret pickle plan", at: "2026-10-08T09:00" }), ctx, read.deps);
		const capped = setup({ actions: history(50, "reminder_set", NOW - 3_600_000) });
		await runAction(propose("reminder_set", { text: "call Dad about the secret pickle plan", at: "2026-10-08T09:00" }), ctx, capped.deps);
		expect(read.db.tables.actions).toHaveLength(1);
		expect(JSON.stringify(read.db.tables.actions)).not.toContain("secret");
		expect(JSON.stringify(capped.db.tables.actions)).not.toContain("secret");
	});
	it("a reminder held at ask is quoted to the user, but the log says only when", async () => {
		const { db, deps } = setup({ levels: { reminders: "ask", notes: "act", weather: "read" } });
		const out = await runAction(propose("reminder_set", { text: "call Dad", at: "2026-10-08T09:00" }), ctx, deps);
		expect(out).toEqual({ kind: "waiting", line: "Set a reminder: call Dad? Say yes to go ahead, or no." });
		expect(db.tables.actions[0]).toMatchObject({ status: "waiting", summary: "Waiting for your yes to set a reminder for Thursday 8 October at 09:00" });
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "done", summary: "Set a reminder for Thursday 8 October at 09:00" });
	});
	it("a delete that fails on the yes still leaves one row, with no text", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		db.tables.notes.length = 0;
		await answerPending(deps, "yes", "typed", NOW);
		expect(db.tables.actions).toHaveLength(1);
		expect(db.tables.actions[0]).toMatchObject({ status: "failed", error: "run" });
		expect(JSON.stringify(db.tables.actions)).not.toContain("milk");
	});
});

describe("the crisis path", () => {
	it("cancelWaiting leaves nothing waiting, and a later yes is not handled", async () => {
		const { db, deps } = setup();
		await runAction(deleteMilk, ctx, deps);
		await cancelWaiting("owner-1", deps);
		expect(db.tables.pending_actions.map((r) => r.status)).toEqual(["cancelled"]);
		expect(db.tables.actions.map((r) => r.status)).toEqual(["cancelled"]);
		expect(await answerPending(deps, "yes", "typed", NOW)).toEqual({ handled: false });
		expect(db.tables.notes).toHaveLength(1);
	});
});

describe("note_add and note_search through runAction", () => {
	it("adds at act, and a search reads it back for call 2", async () => {
		const { db, deps } = setup({ notes: [] });
		expect(await runAction(propose("note_add", { text: "buy milk" }), ctx, deps)).toEqual({ kind: "done", line: "Saved the note.", result: null });
		expect(db.tables.notes).toHaveLength(1);
		const found = await runAction(propose("note_search", { query: "milk" }), ctx, deps);
		expect(found).toEqual({ kind: "done", line: "I found 1 note. buy milk.", result: "I found 1 note. buy milk." });
	});
	it("a search needs only the read level, an add does not run at it", async () => {
		const { db, deps } = setup({ levels: { notes: "read" } });
		expect((await runAction(propose("note_search", { query: "" }), ctx, deps)).kind).toBe("done");
		expect((await runAction(propose("note_add", { text: "x" }), ctx, deps)).kind).toBe("refused");
		expect(db.tables.notes).toHaveLength(1);
	});
});

describe("listEnabledActions with the real registry", () => {
	it("offers exactly the eight names these levels allow, in under 1,400 bytes", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		const { deps } = setup();
		const list = await listEnabledActions("owner-1", deps);
		expect(list?.names).toEqual(REGISTRY.map((d) => d.name));
		expect(list?.names).toHaveLength(8);
		expect(Buffer.byteLength(list!.lines.join(" "))).toBeLessThan(1400);
		expect(list).toMatchObject({ today: "Wednesday 7 October 2026, 14:00", timezone: "Europe/Stockholm", place: "Malmo" });
	});
	it("follows the levels: read keeps only the tier 1 reads", async () => {
		const { deps } = setup({ levels: { reminders: "read", notes: "read", weather: "read" } });
		expect((await listEnabledActions("owner-1", deps))?.names).toEqual(["reminder_list", "note_search", "weather_now", "weather_forecast"]);
	});
	it("offers nothing when paused, or when every level is off", async () => {
		expect(await listEnabledActions("owner-1", setup({ paused: true }).deps)).toBeNull();
		expect(await listEnabledActions("owner-1", setup({ levels: {} }).deps)).toBeNull();
	});
});
