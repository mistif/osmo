// The "Reminders and notes" lists in Settings: rows from the database, made safe to show.
export type ReminderRow = { id: string; text: string; due_at: string };
export type NoteRow = { id: string; text: string; created_at: string };

const validDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(new Date(v).getTime());

export function sanitizeReminder(raw: unknown): ReminderRow | null {
	if (typeof raw !== "object" || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.id !== "string" || typeof r.text !== "string" || !validDate(r.due_at)) return null;
	return { id: r.id, text: r.text, due_at: r.due_at };
}

export function sanitizeNote(raw: unknown): NoteRow | null {
	if (typeof raw !== "object" || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.id !== "string" || typeof r.text !== "string" || !validDate(r.created_at)) return null;
	return { id: r.id, text: r.text, created_at: r.created_at };
}

// "Thursday 8 October, 09:00", built from parts so the wording does not depend on the ICU version.
export function dueLine(iso: string, now: number): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
	return `${get("weekday")} ${get("day")} ${get("month")}${year}, ${get("hour")}:${get("minute")}`;
}
