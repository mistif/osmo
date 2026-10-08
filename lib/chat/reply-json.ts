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
// A whole JSON turn's own words, where the bare word CRISIS may flag a crisis: every field but the action, whose args
// copy Gur's words. Null for text that is not one whole JSON object.
export function ownWords(text: string): string | null {
	const whole = asObject(tryParse(text.trim()));
	return whole === null ? null : JSON.stringify({ ...whole, action: null });
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
