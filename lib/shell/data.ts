// Shared readers for Library and Feed: thin typed wrappers over queries the old panels already run,
// reusing their sanitizers. Nothing here is unit-tested (it talks to the network); the pure parts it
// feeds are. A table that does not exist yet (PGRST205) reads as empty, not as a failure.
import { supabase } from "@/lib/supabase";
import { sanitizeMoodDay, type MoodDay } from "@/lib/agent/mood-days";
import { sanitizeThing, type ThingRow } from "@/lib/artifacts/things";
import { sanitizeNote, sanitizeReminder, type NoteRow } from "./reminders-notes";
import { sanitizeActionRow, type ActionRow } from "./what-i-did";
import { extractLinks, type LinkItem } from "./library";
import type { MoodFeedRow, ReminderFeedRow } from "./feed";

export type Read<T> = { rows: T[]; failed: boolean };
const out = <T>(data: unknown[] | null, error: { code?: string } | null, map: (x: unknown) => T | null): Read<T> =>
	error && error.code !== "PGRST205" ? { rows: [], failed: true } : { rows: (data ?? []).map(map).filter((x): x is T => x !== null), failed: false };

export async function readNotes(): Promise<Read<NoteRow>> {
	const r = await supabase.from("notes").select("id,text,created_at").order("created_at", { ascending: false }).limit(100);
	return out(r.data, r.error, sanitizeNote);
}
export async function readThings(): Promise<Read<ThingRow>> {
	const r = await supabase.from("artifacts").select("id,title,version,parent_id,created_at").order("created_at", { ascending: false }).limit(200);
	return out(r.data, r.error, sanitizeThing);
}
export async function readLinks(): Promise<Read<LinkItem>> {
	const r = await supabase.from("messages").select("id,role,text,speaker,created_at").eq("role", "agent").is("speaker", null).ilike("text", "%http%").order("created_at", { ascending: false }).limit(100);
	return r.error ? { rows: [], failed: true } : { rows: extractLinks((r.data ?? []) as Parameters<typeof extractLinks>[0]), failed: false };
}
// When each memory fact last changed, by key (the old reader selects only key and value).
export async function readMemoryDates(): Promise<Record<string, string>> {
	const r = await supabase.from("memory_facts").select("key,updated_at");
	return Object.fromEntries((r.data ?? []).map((x: { key: string; updated_at: string }) => [x.key, x.updated_at]));
}
export async function readActions(sinceIso: string): Promise<Read<ActionRow>> {
	const r = await supabase.from("actions").select("id,at,surface,status,summary").gte("at", sinceIso).order("at", { ascending: false }).limit(100);
	return out(r.data, r.error, sanitizeActionRow);
}
export async function readReminders(): Promise<Read<ReminderFeedRow>> {
	const r = await supabase.from("reminders").select("id,text,due_at,sent_at,status").in("status", ["pending", "sent", "missed"]).order("due_at", { ascending: false }).limit(100);
	return out(r.data, r.error, (x): ReminderFeedRow | null => {
		const base = sanitizeReminder(x);
		const o = x as { sent_at?: unknown; status?: unknown };
		if (!base || (o.status !== "pending" && o.status !== "sent" && o.status !== "missed")) return null;
		return { id: base.id, text: base.text, due_at: base.due_at, sent_at: typeof o.sent_at === "string" ? o.sent_at : null, status: o.status };
	});
}
export async function readMoods(sinceDay: string): Promise<Read<MoodFeedRow>> {
	const r = await supabase.from("mood_days").select("day,valence,strongest,tally,samples").gte("day", sinceDay).order("day", { ascending: false }).limit(100);
	return out(r.data, r.error, (x): MoodFeedRow | null => {
		const m = sanitizeMoodDay(x);
		return m && { day: m.day, strongest: m.strongest };
	});
}
// The mood week for the Feed chart (full rows, with valence) and the first day Osmo kept a mood, as Insights reads them.
export async function readMoodWeek(sinceDay: string): Promise<{ rows: MoodDay[]; firstDay: string | null; failed: boolean }> {
	const [week, first] = await Promise.all([
		supabase.from("mood_days").select("day,valence,strongest,tally,samples").gte("day", sinceDay).order("day"),
		supabase.from("mood_days").select("day").order("day").limit(1).maybeSingle(),
	]);
	if (week.error || first.error) return { rows: [], firstDay: null, failed: true };
	return { rows: (week.data ?? []).map(sanitizeMoodDay).filter((r): r is MoodDay => r !== null), firstDay: typeof first.data?.day === "string" ? first.data.day : null, failed: false };
}

async function newestStamp(table: string, column: string): Promise<string | null> {
	const r = await supabase.from(table).select(column).order(column, { ascending: false }).limit(1);
	const v = (r.data?.[0] as unknown as Record<string, unknown> | undefined)?.[column];
	return !r.error && typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
}
// The newest stamp of what Library holds, for the rail dot: a note, a memory fact or a thing.
// One failing table is skipped; null when none can be read or all are empty.
export async function latestLibraryStamp(): Promise<string | null> {
	const stamps = await Promise.all([newestStamp("notes", "created_at"), newestStamp("memory_facts", "updated_at"), newestStamp("artifacts", "created_at")].map((p) => p.catch(() => null)));
	let best: string | null = null;
	for (const s of stamps) if (s && (best === null || Date.parse(s) > Date.parse(best))) best = s;
	return best;
}
export async function openThingSource(id: string): Promise<string | null> {
	const r = await supabase.from("artifacts").select("source").eq("id", id).maybeSingle();
	return r.error || typeof r.data?.source !== "string" ? null : r.data.source;
}

const KEY = { actions: "id", reminders: "id", notes: "id", artifacts: "id", messages: "id", mood_days: "day" } as const;
// Deletes one row as Gur. Zero rows deleted (a policy mismatch deletes nothing and reports no error) counts as failure.
export async function forgetRow(table: keyof typeof KEY, key: string | number): Promise<boolean> {
	const r = await supabase.from(table).delete().eq(KEY[table], key).select(KEY[table]);
	return !r.error && (r.data?.length ?? 0) > 0;
}
