// One row per day of Osmo's mood: a running average of how positive he felt, and which feeling led most often.
import { localDay } from "./bond/bond";

export type MoodDay = { day: string; valence: number; strongest: string; tally: Record<string, number>; samples: number };
export type SeriesDay = { day: string; valence: number | null; strongest: string | null };

export function foldMood(row: MoodDay | null, day: string, valence: number, tone: string): MoodDay {
	if (!row || row.day !== day) return { day, valence, strongest: tone, tally: { [tone]: 1 }, samples: 1 };
	const samples = row.samples + 1;
	const tally = { ...row.tally, [tone]: (row.tally[tone] ?? 0) + 1 };
	// A tie keeps the feeling that was already leading, so the day's word doesn't flicker.
	const strongest = tally[tone] > (tally[row.strongest] ?? 0) ? tone : row.strongest;
	return { day, valence: row.valence + (valence - row.valence) / samples, strongest, tally, samples };
}

// "YYYY-MM-DD" read as a local calendar day. new Date("2026-09-26") would be UTC midnight and can land on the day before.
function localDate(day: string): Date {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y, m - 1, d, 12);
}

export function weekSeries(rows: MoodDay[], today: string): SeriesDay[] {
	const byDay = new Map(rows.map((r) => [r.day, r]));
	const end = localDate(today);
	return Array.from({ length: 7 }, (_, i) => {
		const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (6 - i), 12);
		const day = localDay(date.getTime());
		const row = byDay.get(day);
		return { day, valence: row ? row.valence : null, strongest: row ? row.strongest : null };
	});
}

const ADJECTIVE: Record<string, string> = {
	calm: "calm",
	joy: "happy",
	sadness: "sad",
	anger: "angry",
	fear: "anxious",
	trust: "at ease",
	disgust: "put off",
	surprise: "surprised",
	love: "affectionate",
	hope: "hopeful",
	guilt: "guilty",
	loneliness: "lonely",
	boredom: "bored",
};

export function strongestPhrase(tone: string): string {
	return `mostly ${ADJECTIVE[tone] ?? "calm"}`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayName(day: string): string {
	return DAYS[localDate(day).getDay()];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function sanitizeMoodDay(raw: unknown): MoodDay | null {
	if (!isObject(raw) || typeof raw.day !== "string" || !finite(raw.valence)) return null;
	const tally: Record<string, number> = {};
	if (isObject(raw.tally)) for (const [k, v] of Object.entries(raw.tally)) if (finite(v) && v > 0) tally[k] = Math.floor(v);
	return {
		day: raw.day,
		valence: Math.max(-1, Math.min(1, raw.valence)),
		strongest: typeof raw.strongest === "string" ? raw.strongest : "calm",
		tally,
		samples: finite(raw.samples) ? Math.max(0, Math.floor(raw.samples)) : 0,
	};
}
