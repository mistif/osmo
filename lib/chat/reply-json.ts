import { isCrisisFlag } from "./speakable";
export type ModelOutput = { reply: string; crisis: boolean; detection: unknown };
const asObject = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tryParse = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };
// The JSON shape first; then the FEELING fallback line; half a JSON is never spoken. Null means an error fallback.
export function parseModelOutput(text: string): ModelOutput | null {
	const trimmed = text.trim();
	const whole = asObject(tryParse(trimmed));
	if (whole) return typeof whole.reply === "string" ? { reply: whole.reply, crisis: whole.crisis === true || isCrisisFlag(whole.reply), detection: whole } : null;
	const lines = trimmed.split(/\r?\n/);
	const last = lines.at(-1)?.trim() ?? "";
	if (last.startsWith("FEELING:")) {
		const reply = lines.slice(0, -1).join("\n").trim();
		return { reply, crisis: isCrisisFlag(reply), detection: asObject(tryParse(last.slice("FEELING:".length).trim())) };
	}
	if (trimmed.startsWith("{") || trimmed.startsWith("```")) return null;
	return { reply: trimmed, crisis: isCrisisFlag(trimmed), detection: null };
}
