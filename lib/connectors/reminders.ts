// Reminders (spec 3.2, 6.2): set, list and cancel. Times arrive as local YYYY-MM-DDTHH:MM and are stored as UTC.
import { clean, matchOne, only } from "../actions/match";
import { speak, validDue } from "../actions/time";
import type { Def } from "../actions/types";

const NO_ZONE = "I do not know your time zone yet. Open Osmo's room once on a device, then ask again.";
const NONE_FOUND = "I could not find one like that.";

type Reminder = { id: string; text: string; due_at: string };

export const reminderSet: Def = {
	name: "reminder_set",
	connector: "reminders",
	tier: 2,
	needsResult: false,
	voiceOk: true,
	line: 'reminder_set {"text":"what to remind, 200 characters","at":"YYYY-MM-DDTHH:MM"} tier 2: set a reminder, at a local time in the future.',
	unclear: "I did not catch the time for that reminder. Could you say it again?",
	check(a, c) {
		if (!only(a, ["text", "at"])) return { ok: false };
		if (c.timezone === null) return { ok: false, say: NO_ZONE };
		const text = clean(a.text, 200),
			due = typeof a.at === "string" ? validDue(a.at, c.timezone, c.now) : null;
		return text && due !== null ? { ok: true, args: { text, due } } : { ok: false };
	},
	describe: (a) => `Set a reminder: ${(a as { text: string }).text}`.slice(0, 120),
	async run(a, c) {
		const { text, due } = a as { text: string; due: number },
			tz = c.timezone ?? "UTC";
		const { error } = await c.db.from("reminders").insert({ text, due_at: new Date(due).toISOString(), status: "pending" });
		return error ? { ok: false, say: "I could not save that reminder just now." } : { ok: true, say: `Reminder set for ${speak(due, tz)}: ${text}.`, result: null };
	},
};

export const reminderList: Def = {
	name: "reminder_list",
	connector: "reminders",
	tier: 1,
	needsResult: true,
	voiceOk: true,
	line: "reminder_list {} tier 1: read out the reminders that are waiting.",
	unclear: "I could not read your reminders just now.",
	check: (a) => (only(a, []) ? { ok: true, args: {} } : { ok: false }),
	describe: () => "List your reminders",
	async run(_a, c) {
		const { data, error } = await c.db.from("reminders").select("id,text,due_at").eq("status", "pending").order("due_at", { ascending: true }).limit(10);
		if (error || !Array.isArray(data)) return { ok: false, say: "I could not read your reminders just now." };
		const rows = data as unknown as Reminder[];
		if (rows.length === 0) return { ok: true, say: "You have no reminders waiting.", result: null };
		const tz = c.timezone ?? "UTC",
			list = rows.map((r) => `${speak(Date.parse(r.due_at), tz)}: ${r.text}.`).join(" "),
			say = `You have ${rows.length} ${rows.length === 1 ? "reminder" : "reminders"} waiting. ${list}`;
		return { ok: true, say, result: say };
	},
};

export const reminderCancel: Def = {
	name: "reminder_cancel",
	connector: "reminders",
	tier: 2,
	needsResult: false,
	voiceOk: true,
	line: 'reminder_cancel {"match":"words from the reminder, 80 characters"} tier 2: cancel the one reminder that matches.',
	unclear: "I did not catch which reminder to cancel. Could you say it again?",
	check(a) {
		if (!only(a, ["match"])) return { ok: false };
		const match = clean(a.match, 80);
		return match ? { ok: true, args: { match } } : { ok: false };
	},
	describe: () => "Cancel a reminder",
	async run(a, c) {
		const { data, error } = await c.db.from("reminders").select("id,text").eq("status", "pending").order("due_at", { ascending: true }).limit(50);
		if (error || !Array.isArray(data)) return { ok: false, say: "I could not read your reminders just now." };
		const hit = matchOne(data as unknown as Reminder[], (a as { match: string }).match);
		if (!hit.ok) return { ok: false, say: hit.say };
		const done = await c.db.from("reminders").update({ status: "cancelled" }).eq("id", hit.row.id).eq("status", "pending").select("id");
		if (done.error) return { ok: false, say: "I could not cancel that reminder just now." };
		if (!Array.isArray(done.data) || done.data.length === 0) return { ok: false, say: NONE_FOUND }; // settled in between
		return { ok: true, say: `Cancelled the reminder: ${hit.row.text}.`, result: null };
	},
};

export const reminderDefs: Def[] = [reminderSet, reminderList, reminderCancel];
