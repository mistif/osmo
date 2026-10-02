import { isCrisisFlag } from "./speakable";
export type ModelOutput = { reply: string; crisis: boolean; detection: unknown };
const asObject = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tryParse = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };
const FEELING = "FEELING:";
// A JSON object's start, such as {"reply":. Plain speech has none, so text that holds one is never spoken.
const EMBEDDED_JSON = /\{\s*"\w+"\s*:/;
// The JSON shape first; then the FEELING fallback (split at its last occurrence, wherever it sits, so what follows it
// is the detection and never part of the reply); half a JSON, a fence or an embedded object is never spoken. Null means
// an error fallback.
export function parseModelOutput(text: string): ModelOutput | null {
	const trimmed = text.trim();
	const whole = asObject(tryParse(trimmed));
	if (whole) return typeof whole.reply === "string" ? { reply: whole.reply, crisis: whole.crisis === true || isCrisisFlag(whole.reply), detection: whole } : null;
	const at = trimmed.lastIndexOf(FEELING);
	if (at !== -1) {
		const reply = trimmed.slice(0, at).trim();
		return { reply, crisis: isCrisisFlag(reply), detection: asObject(tryParse(trimmed.slice(at + FEELING.length).trim())) };
	}
	if (trimmed.startsWith("{") || trimmed.startsWith("```") || EMBEDDED_JSON.test(trimmed)) return null;
	return { reply: trimmed, crisis: isCrisisFlag(trimmed), detection: null };
}
