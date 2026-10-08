import { isCrisisFlag, spellsCrisis } from "./speakable";
export type ModelOutput = { reply: string; crisis: boolean; detection: unknown; action: { name: string; args: string } | null };
const asObject = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
// The model's action, only when it is a name and a string of args; whether the name is real and the args are sane is for the action layer (3.3).
const actionOf = (v: unknown): ModelOutput["action"] => {
	const o = asObject(v);
	return o && typeof o.name === "string" && o.name !== "" && typeof o.args === "string" ? { name: o.name, args: o.args } : null;
};
const tryParse = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };
// Whether the text is one whole JSON object, as a strict model's turn is.
export const isJsonTurn = (text: string): boolean => asObject(tryParse(text.trim())) !== null;
// A whole JSON turn's own words, where the bare word CRISIS may flag a crisis: every key and string in it, read from the
// text itself so each copy of a doubled key counts, and each held as written and as read, so a newline or tab written
// before a word ("\n", "\u0009") never joins it. Left out: only the args of the action read, and only when actions were
// offered, since those copy Gur's words. Null for text that is not one whole JSON object.
export function ownWords(text: string, offered: boolean): string[] | null {
	const trimmed = text.trim();
	const whole = asObject(tryParse(trimmed));
	if (whole === null) return null;
	const args = offered ? actionOf(whole.action)?.args : undefined;
	const words: string[] = [];
	// The objects and arrays open at this point, each with the key last read in it; and whether a key comes next.
	const open: { object: boolean; key: string | null }[] = [];
	let keyNext = false;
	for (let i = 0; i < trimmed.length; i++) {
		const c = trimmed[i];
		if (c === "{" || c === "[") {
			open.push({ object: c === "{", key: null });
			keyNext = c === "{";
		} else if (c === "}" || c === "]") open.pop();
		else if (c === ",") keyNext = open.at(-1)?.object === true;
		else if (c === '"') {
			// The text parsed whole, so every string closes, and an escaped quote is skipped with its backslash.
			let end = i + 1;
			while (trimmed[end] !== '"') end += trimmed[end] === "\\" ? 2 : 1;
			const written = trimmed.slice(i + 1, end);
			const read = JSON.parse(trimmed.slice(i, end + 1)) as string;
			const top = open.at(-1);
			if (keyNext && top) top.key = read;
			const isArgs = !keyNext && read === args && open.length === 2 && open[0].key === "action" && open[1].object && open[1].key === "args";
			if (!isArgs) words.push(written, read);
			keyNext = false;
			i = end;
		}
	}
	return words;
}
const FEELING = "FEELING:";
// A JSON object's start, such as {"reply":. Plain speech has none, so text that holds one is never spoken.
const EMBEDDED_JSON = /\{\s*"\w+"\s*:/;
// The JSON shape first; then the FEELING fallback (split at its last occurrence, wherever it sits, so what follows it
// is the detection and never part of the reply); half a JSON, a fence or an embedded object is never spoken. Null means
// an error fallback. A JSON turn's crisis is its field or a reply of the word alone; the bare word in its sentences is
// for the handler, which knows what the turn may copy.
export function parseModelOutput(text: string): ModelOutput | null {
	const trimmed = text.trim();
	const whole = asObject(tryParse(trimmed));
	if (whole) return typeof whole.reply === "string" ? { reply: whole.reply, crisis: whole.crisis === true || spellsCrisis(whole.reply), detection: whole, action: actionOf(whole.action) } : null;
	const at = trimmed.lastIndexOf(FEELING);
	if (at !== -1) {
		const reply = trimmed.slice(0, at).trim();
		return { reply, crisis: isCrisisFlag(reply), detection: asObject(tryParse(trimmed.slice(at + FEELING.length).trim())), action: null };
	}
	if (trimmed.startsWith("{") || trimmed.startsWith("```") || EMBEDDED_JSON.test(trimmed)) return null;
	return { reply: trimmed, crisis: isCrisisFlag(trimmed), detection: null, action: null };
}
