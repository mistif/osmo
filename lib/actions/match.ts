// Small helpers every connector's arg checker uses (spec 3.3): exact keys, clean text, one match.

// A plain object with exactly these keys, no more and no fewer.
export function only(obj: unknown, keys: string[]): obj is Record<string, unknown> {
	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
	const have = Object.keys(obj);
	return have.length === keys.length && keys.every((k) => have.includes(k));
}

// Text only: control characters become spaces, runs of spaces join, then it is cut to max characters. Anything else is "".
export function clean(text: unknown, max: number): string {
	if (typeof text !== "string") return "";
	const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/ {2,}/g, " ").trim();
	return Array.from(flat).slice(0, max).join("").trim();
}

export type Match<T> = { ok: true; row: T } | { ok: false; say: string };

// The one row whose text holds every word. Zero or several is a plain line, never a guess.
export function matchOne<T extends { text: string }>(rows: readonly T[], words: string): Match<T> {
	const list = words.toLowerCase().split(" ").filter(Boolean);
	if (list.length === 0) return { ok: false, say: "Please say a little more." };
	const hits = rows.filter((r) => list.every((w) => r.text.toLowerCase().includes(w)));
	if (hits.length === 1) return { ok: true, row: hits[0] };
	return { ok: false, say: hits.length === 0 ? "I could not find one like that." : `I found ${hits.length} like that. Please say a little more.` };
}
