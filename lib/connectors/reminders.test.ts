/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { fakeDb } from "../actions/fake-db";
import { REGISTRY } from "../actions/registry";
import type { Def, Profile, RunCtx } from "../actions/types";
import { reminderCancel, reminderDefs, reminderList, reminderSet } from "./reminders";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const TZ = "Europe/Stockholm";
const profile: Profile = { timezone: TZ, place: null, paused: false, hideReminderText: false, levels: {} };
const check = (d: Def, a: unknown, timezone: string | null = TZ) => d.check(a, { now: NOW, timezone });
const noNetwork = (() => {
	throw new Error("no network");
}) as any;
const rc = (db: ReturnType<typeof fakeDb>): RunCtx => ({ db, now: NOW, timezone: TZ, profile, fetch: noNetwork, env: {} });
const due = (iso: string) => Date.parse(iso);

describe("the reminder defs", () => {
	it("are three, on the reminders connector, speakable by a spoken yes", () => {
		expect(reminderDefs.map((d) => [d.name, d.tier, d.needsResult])).toEqual([
			["reminder_set", 2, false],
			["reminder_list", 1, true],
			["reminder_cancel", 2, false],
		]);
		for (const d of reminderDefs) {
			expect(d.connector).toBe("reminders");
			expect(d.voiceOk).toBe(true);
			expect(d.line).toContain(d.name);
			expect(d.line).toContain(`tier ${d.tier}`);
			expect(d.unclear).not.toContain("!");
			expect(d.line + d.unclear).toMatch(/^[\x20-\x7e]*$/);
		}
	});
});

describe("the registry", () => {
	it("holds the three reminder defs", () => {
		for (const d of reminderDefs) expect(REGISTRY).toContain(d);
	});
});

describe("reminder_set check", () => {
	it("turns the local time into a UTC instant and keeps the text", () => {
		expect(check(reminderSet, { text: "call Dad", at: "2026-10-08T09:00" })).toEqual({ ok: true, args: { text: "call Dad", due: due("2026-10-08T07:00:00Z") } });
	});
	it("cuts the text to 200 characters and turns control characters into spaces", () => {
		const r = check(reminderSet, { text: "x".repeat(300), at: "2026-10-08T09:00" }) as any;
		expect(r.args.text).toHaveLength(200);
		const c = check(reminderSet, { text: "call\u0000Dad\nnow", at: "2026-10-08T09:00" }) as any;
		expect(c.args.text).toBe("call Dad now");
	});
	it("rejects extra keys, missing keys, empty text and a time that is not text", () => {
		expect(check(reminderSet, { text: "a", at: "2026-10-08T09:00", more: 1 })).toEqual({ ok: false });
		expect(check(reminderSet, { text: "a" })).toEqual({ ok: false });
		expect(check(reminderSet, { text: "   ", at: "2026-10-08T09:00" })).toEqual({ ok: false });
		expect(check(reminderSet, { text: "a", at: 5 })).toEqual({ ok: false });
		expect(check(reminderSet, { text: 7, at: "2026-10-08T09:00" })).toEqual({ ok: false });
		for (const v of [null, "x", [], 3]) expect(check(reminderSet, v)).toEqual({ ok: false });
	});
	it("rejects a time in the past, now, over a year out, or not a real time", () => {
		expect(check(reminderSet, { text: "a", at: "2026-10-07T09:00" })).toEqual({ ok: false });
		expect(check(reminderSet, { text: "a", at: "2026-10-07T14:00" })).toEqual({ ok: false });
		expect(check(reminderSet, { text: "a", at: "2027-11-15T09:00" })).toEqual({ ok: false });
		expect(check(reminderSet, { text: "a", at: "2026-02-30T09:00" })).toEqual({ ok: false });
		expect(check(reminderSet, { text: "a", at: "tomorrow at nine" })).toEqual({ ok: false });
	});
	it("says it does not know the time zone when none is saved", () => {
		expect(check(reminderSet, { text: "a", at: "2026-10-08T09:00" }, null)).toEqual({
			ok: false,
			say: "I do not know your time zone yet. Open Osmo's room once on a device, then ask again.",
		});
	});
	it("describes itself without a long text", () => {
		expect(reminderSet.describe({ text: "call Dad", due: 1 })).toBe("Set a reminder"); // never the text
		expect(reminderCancel.describe({ match: "dad" })).not.toContain("dad");
	});
});

describe("reminder_set prepare and logLine", () => {
	it("asks with the text, and logs only when", async () => {
		const p = await reminderSet.prepare!({ text: "call Dad", due: due("2026-10-08T07:00:00Z") }, rc(fakeDb()));
		expect(p).toEqual({
			ok: true,
			args: { text: "call Dad", due: due("2026-10-08T07:00:00Z") },
			summary: "Set a reminder: call Dad? Say yes to go ahead, or no.",
			logSummary: "Waiting for your yes to set a reminder for Thursday 8 October at 09:00",
		});
	});
	it("logs lines with no reminder text", () => {
		const ok = { ok: true as const, say: "x", result: null };
		expect(reminderSet.logLine!({ text: "call Dad", due: due("2026-10-08T07:00:00Z") }, ok, rc(fakeDb()))).toBe("Set a reminder for Thursday 8 October at 09:00");
		expect(reminderList.logLine!({}, ok)).toBe("Read your reminders");
		expect(reminderCancel.logLine!({ match: "dad" }, ok)).toBe("Cancelled a reminder");
	});
});

describe("reminder_set run", () => {
	it("saves a pending reminder and says when", async () => {
		const db = fakeDb();
		const out = await reminderSet.run({ text: "call Dad", due: due("2026-10-08T07:00:00Z") }, rc(db));
		expect(out).toEqual({ ok: true, say: "Reminder set for Thursday 8 October at 09:00: call Dad.", result: null });
		expect(db.tables.reminders).toHaveLength(1);
		expect(db.tables.reminders[0]).toMatchObject({ text: "call Dad", due_at: "2026-10-08T07:00:00.000Z", status: "pending" });
	});
	it("says it could not save when the database says no", async () => {
		const db = fakeDb();
		(db as any).from = () => ({ insert: () => Promise.resolve({ error: { message: "boom" } }) });
		const out = await reminderSet.run({ text: "a", due: due("2026-10-08T07:00:00Z") }, rc(db));
		expect(out).toEqual({ ok: false, say: "I could not save that reminder just now." });
	});
});

describe("reminder_list", () => {
	it("takes no args", () => {
		expect(check(reminderList, {})).toEqual({ ok: true, args: {} });
		expect(check(reminderList, { x: 1 })).toEqual({ ok: false });
		expect(check(reminderList, null)).toEqual({ ok: false });
	});
	it("says there are none, with no result for call 2", async () => {
		const out = await reminderList.run({}, rc(fakeDb({ reminders: [{ id: "1", text: "old", due_at: "2026-10-01T07:00:00.000Z", status: "sent" }] })));
		expect(out).toEqual({ ok: true, say: "You have no reminders waiting.", result: null });
	});
	it("lists pending ones in time order and returns the same text as the result", async () => {
		const db = fakeDb({
			reminders: [
				{ id: "1", text: "later one", due_at: "2026-10-09T07:00:00.000Z", status: "pending" },
				{ id: "2", text: "cancelled one", due_at: "2026-10-08T07:00:00.000Z", status: "cancelled" },
				{ id: "3", text: "first one", due_at: "2026-10-08T08:00:00.000Z", status: "pending" },
			],
		});
		const out = (await reminderList.run({}, rc(db))) as any;
		expect(out.ok).toBe(true);
		expect(out.say).toContain("first one");
		expect(out.say).toContain("later one");
		expect(out.say).not.toContain("cancelled one");
		expect(out.say.indexOf("first one")).toBeLessThan(out.say.indexOf("later one"));
		expect(out.say).toContain("Thursday 8 October at 10:00");
		expect(out.say).toContain("Friday 9 October at 09:00");
		expect(out.result).toBe(out.say);
	});
	it("shows at most ten", async () => {
		const rows = Array.from({ length: 12 }, (_, i) => ({ id: String(i), text: `r${String(i).padStart(2, "0")}`, due_at: new Date(Date.UTC(2026, 9, 8, i)).toISOString(), status: "pending" }));
		const out = (await reminderList.run({}, rc(fakeDb({ reminders: rows })))) as any;
		expect(out.say).toContain("r09");
		expect(out.say).not.toContain("r10");
	});
	it("says it could not read them when the database says no", async () => {
		const db = fakeDb();
		const chain: any = { eq: () => chain, order: () => chain, limit: () => chain, then: (ok: any) => Promise.resolve({ data: null, error: { message: "x" } }).then(ok) };
		(db as any).from = () => ({ select: () => chain });
		expect(await reminderList.run({}, rc(db))).toEqual({ ok: false, say: "I could not read your reminders just now." });
	});
});

describe("reminder_cancel", () => {
	const seed = () =>
		fakeDb({
			reminders: [
				{ id: "1", text: "call Dad about the boat", due_at: "2026-10-08T07:00:00.000Z", status: "pending" },
				{ id: "2", text: "call the dentist", due_at: "2026-10-09T07:00:00.000Z", status: "pending" },
				{ id: "3", text: "buy milk", due_at: "2026-10-09T08:00:00.000Z", status: "cancelled" },
			],
		});
	it("checks one match string, cut to 80 and cleaned", () => {
		expect(check(reminderCancel, { match: "dad boat" })).toEqual({ ok: true, args: { match: "dad boat" } });
		expect((check(reminderCancel, { match: "x".repeat(200) }) as any).args.match).toHaveLength(80);
		expect(check(reminderCancel, { match: "  " })).toEqual({ ok: false });
		expect(check(reminderCancel, { match: 4 })).toEqual({ ok: false });
		expect(check(reminderCancel, { match: "a", extra: 1 })).toEqual({ ok: false });
		expect(check(reminderCancel, {})).toEqual({ ok: false });
	});
	it("cancels exactly one match", async () => {
		const db = seed();
		const out = await reminderCancel.run({ match: "dad" }, rc(db));
		expect(out).toEqual({ ok: true, say: "Cancelled the reminder: call Dad about the boat.", result: null });
		expect(db.tables.reminders.map((r) => r.status)).toEqual(["cancelled", "pending", "cancelled"]);
	});
	it("changes nothing when two match", async () => {
		const db = seed();
		const out = await reminderCancel.run({ match: "call" }, rc(db));
		expect(out).toEqual({ ok: false, say: "I found 2 like that. Please say a little more." });
		expect(db.tables.reminders.map((r) => r.status)).toEqual(["pending", "pending", "cancelled"]);
	});
	it("changes nothing when none match, and ignores ones already cancelled", async () => {
		const db = seed();
		expect(await reminderCancel.run({ match: "zebra" }, rc(db))).toEqual({ ok: false, say: "I could not find one like that." });
		expect(await reminderCancel.run({ match: "milk" }, rc(db))).toEqual({ ok: false, say: "I could not find one like that." });
		expect(db.tables.reminders.map((r) => r.status)).toEqual(["pending", "pending", "cancelled"]);
	});
	it("says so when the row was settled in between", async () => {
		const db = seed();
		const real = db.from.bind(db);
		(db as any).from = (t: string) => {
			const table = real(t);
			return {
				...table,
				update: (v: any) => {
					db.tables.reminders[0].status = "sent";
					return table.update(v);
				},
			};
		};
		expect(await reminderCancel.run({ match: "dad" }, rc(db))).toEqual({ ok: false, say: "I could not find one like that." });
	});
});
