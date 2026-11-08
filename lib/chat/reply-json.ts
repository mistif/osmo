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
// The FEELING marker, in any case and wrapped in markdown ("**Feeling:**"). Upper case always marks it; any other
// case only when a JSON object follows, so "my feeling: tired" stays speech.
const FEELING = /[*_]*\bfeeling[*_]*\s*:[*_]*[ \t]*/gi;
// What may open the FEELING JSON: a fence, perhaps with its language.
const FENCE_OPEN = /^```[a-z]*\s*/i;
// A JSON object's start, such as {"reply":. Plain speech has none, so text that holds one is never spoken.
const EMBEDDED_JSON = /\{\s*"\w+"\s*:/;
// Something a voice can actually say.
const SAYABLE = /[\p{L}\p{N}]/u;

// Where the JSON object at the start of text ends (just past its closing brace), or -1 when it never closes.
function objectEnd(text: string): number {
	let depth = 0;
	let inString = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			if (c === "\\") i++;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return i + 1;
	}
	return -1;
}

// The last FEELING marker that counts, with the text before it and after it.
function lastMarker(text: string): { before: string; after: string } | null {
	let found: { before: string; after: string } | null = null;
	for (const m of text.matchAll(FEELING)) {
		const after = text.slice(m.index + m[0].length);
		if (m[0].includes("FEELING") || after.replace(FENCE_OPEN, "").startsWith("{")) found = { before: text.slice(0, m.index), after };
	}
	return found;
}

// The FEELING fallback: the JSON after the marker is the detection; speech after it (a closing fence or a lone "."
// is not speech) stays part of the reply. JSON that never closes is cut off, so nothing after the marker is spoken;
// a marker with no JSON takes the rest of its line as the feeling.
function splitFeeling(before: string, after: string): { reply: string; detection: unknown } {
	const json = after.replace(FENCE_OPEN, "");
	let detection: unknown = null;
	let rest: string;
	if (json.startsWith("{")) {
		const end = objectEnd(json);
		detection = end === -1 ? null : asObject(tryParse(json.slice(0, end)));
		rest = end === -1 ? "" : json.slice(end).replace(/^\s*```/, "");
	} else {
		const line = after.indexOf("\n");
		rest = line === -1 ? "" : after.slice(line + 1);
	}
	const reply = SAYABLE.test(rest) ? `${before.trim()} ${rest.trim()}`.trim() : before.trim();
	return { reply, detection };
}

const unspeakable = (text: string): boolean => text.startsWith("{") || text.startsWith("```") || EMBEDDED_JSON.test(text);

// The JSON shape first; then the FEELING fallback; half a JSON, a fence or an embedded object is never spoken, on
// either path. Null means an error fallback. A JSON turn's crisis is its field or a reply of the word alone; the bare
// word in its sentences is for the handler, which knows what the turn may copy.
export function parseModelOutput(text: string): ModelOutput | null {
	const trimmed = text.trim();
	const whole = asObject(tryParse(trimmed));
	if (whole) return typeof whole.reply === "string" ? { reply: whole.reply, crisis: whole.crisis === true || spellsCrisis(whole.reply), detection: whole, action: actionOf(whole.action) } : null;
	const marker = lastMarker(trimmed);
	const out = marker ? splitFeeling(marker.before, marker.after) : { reply: trimmed, detection: null };
	if (unspeakable(out.reply)) return null;
	return { reply: out.reply, crisis: isCrisisFlag(out.reply), detection: out.detection, action: null };
}
