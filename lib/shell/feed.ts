import { strongestPhrase } from "../agent/mood-days";
import type { ThingRow } from "../artifacts/things";
import { ts } from "./library";
import type { ActionRow } from "./what-i-did";

export type ReminderFeedRow = { id: string; text: string; due_at: string; sent_at: string | null; status: "pending" | "sent" | "missed" };
export type MoodFeedRow = { day: string; strongest: string };
export type ForgetTarget = { table: "actions" | "reminders" | "mood_days" | "artifacts"; key: string | number; warn?: string };
export type FeedRow = { key: string; day: string; at: string; text: string; source: "action" | "reminder" | "mood" | "build"; forget: ForgetTarget; thingId?: string };
export type FeedDay = { day: string; heading: string; rows: FeedRow[] };
export type Feed = { comingUp: { id: string; text: string; due: string; forget: ForgetTarget }[]; days: FeedDay[]; more: boolean };
export type FeedInput = { actions: ActionRow[]; reminders: ReminderFeedRow[]; moods: MoodFeedRow[]; things: ThingRow[] };

const valid = (z: string | null) => {
	if (!z) return false;
	try {
		new Intl.DateTimeFormat("en-GB", { timeZone: z });
		return true;
	} catch {
		return false;
	}
};
const isDate = (iso: string | null): iso is string => typeof iso === "string" && Number.isFinite(Date.parse(iso));
// The saved profile zone, else the browser's, else UTC; a bad name never throws.
export const resolveZone = (profile: string | null, browser: string): string => (valid(profile) ? profile! : valid(browser) ? browser : "UTC");
export const dayKey = (iso: string, zone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const clock = (iso: string, zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const full = (t: string) => (/[.?]$/.test(t) ? t : `${t}.`);

function heading(day: string, today: string): string {
	if (day === today) return "Today";
	const y = new Date(`${today}T12:00:00Z`);
	y.setUTCDate(y.getUTCDate() - 1);
	if (day === y.toISOString().slice(0, 10)) return "Yesterday";
	const p = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(`${day}T12:00:00Z`));
	const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
	return `${g("weekday")} ${g("day")} ${g("month")}${g("year") === today.slice(0, 4) ? "" : ` ${g("year")}`}`;
}

const HEAD: Record<string, string> = { done: "Done.", failed: "I could not do it.", refused: "Not allowed.", waiting: "Waiting for your yes.", cancelled: "Cancelled.", expired: "Expired." };
// describeAction's status words without its weekday and surface, since the day heading says when.
export function actionLine(r: ActionRow): string {
	const s = r.summary.trim();
	return [HEAD[r.status] ?? "", s && full(s)].filter(Boolean).join(" ");
}

export function buildFeed(input: FeedInput, opts: { zone: string; now: number; limit?: number }): Feed {
	const { zone, now, limit = 30 } = opts;
	const today = dayKey(new Date(now).toISOString(), zone);
	const rows: FeedRow[] = [];
	// A row whose date cannot be read is left out; one bad row never breaks the page.
	for (const a of input.actions) {
		if (isDate(a.at)) rows.push({ key: `a${a.id}`, day: dayKey(a.at, zone), at: a.at, text: actionLine(a), source: "action", forget: { table: "actions", key: a.id } });
	}
	for (const r of input.reminders) {
		if (r.status === "pending" || !isDate(r.due_at)) continue;
		const at = isDate(r.sent_at) ? r.sent_at : r.due_at;
		const text = r.status === "sent" ? `A reminder went off at ${clock(r.due_at, zone)}: ${full(r.text)}` : `I missed a reminder at ${clock(r.due_at, zone)}: ${full(r.text)}`;
		rows.push({ key: `r${r.id}`, day: dayKey(at, zone), at, text, source: "reminder", forget: { table: "reminders", key: r.id } });
	}
	for (const m of input.moods) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(m.day) || !isDate(`${m.day}T00:00:00Z`)) continue;
		rows.push({ key: `m${m.day}`, day: m.day, at: `${m.day}T23:59:59.999Z`, text: full(strongestPhrase(m.strongest).replace(/^./, (c) => c.toUpperCase())), source: "mood", forget: { table: "mood_days", key: m.day } });
	}
	for (const t of input.things) {
		if (!isDate(t.created_at)) continue;
		rows.push({ key: `t${t.id}`, day: dayKey(t.created_at, zone), at: t.created_at, text: t.version > 1 ? `I changed ${t.title} to version ${t.version}.` : `I built ${t.title}.`, source: "build", thingId: t.id, forget: { table: "artifacts", key: t.id, warn: "This also deletes the thing I built." } });
	}
	rows.sort((a, b) => ts(b.at) - ts(a.at));
	const days: FeedDay[] = [];
	for (const row of rows.slice(0, limit)) {
		let d = days.find((x) => x.day === row.day);
		if (!d) days.push((d = { day: row.day, heading: heading(row.day, today), rows: [] }));
		d.rows.push(row);
	}
	days.sort((a, b) => b.day.localeCompare(a.day));
	const comingUp = input.reminders
		.filter((r) => r.status === "pending" && isDate(r.due_at))
		.sort((a, b) => ts(a.due_at) - ts(b.due_at))
		.map((r) => ({ id: r.id, text: full(r.text), due: r.due_at, forget: { table: "reminders" as const, key: r.id } }));
	return { comingUp, days, more: rows.length > limit };
}
