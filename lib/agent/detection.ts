import { CRISIS_CAUSE } from "./crisis-cause";
import { INSULT, YOU_SUCK } from "./cues";
import type { Session } from "./mind";
import { isCrisis } from "./safety";
import { withBaseFeelings } from "./lexicon/feelings";

export const TONES = ["neutral", "happy", "excited", "grateful", "playful", "sad", "worried", "angry", "tired", "lonely"] as const;
export type Tone = (typeof TONES)[number];
type About = "gur" | "someone_close" | "osmo" | "other";
type Wants = "listen" | "advice" | "distraction" | "nothing";
export type Detection = { tones: Tone[]; intensity: 1 | 2 | 3; about: About; wants: Wants; note: string; source: "model" | "rules" };
export type GurRead = Omit<Detection, "note" | "source">;

export const NEGATIVE_TONES: readonly Tone[] = ["sad", "worried", "angry", "tired", "lonely"];

const ABOUTS: readonly About[] = ["gur", "someone_close", "osmo", "other"];
const WANTS: readonly Wants[] = ["listen", "advice", "distraction", "nothing"];
const LIGHT: readonly Tone[] = ["neutral", "playful", "happy"];

export const readOf = ({ tones, intensity, about, wants }: Detection): GurRead => ({ tones, intensity, about, wants });

// Plain text only: letters, digits, space, apostrophe, comma, full stop; at most 8 words and 60 characters.
export function cleanNote(raw: unknown): string {
	if (typeof raw !== "string") return "";
	const plain = raw.replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N} ',.]/gu, " ").replace(/\s+/g, " ").trim();
	return plain.split(" ").slice(0, 8).join(" ").slice(0, 60).trim();
}

export function validateDetection(raw: unknown, source: Detection["source"] = "model"): Detection | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const given = r.tones ?? r.tone;
	const list = Array.isArray(given) ? given : typeof given === "string" ? [given] : [];
	const seen = new Set<Tone>();
	for (const t of list) if ((TONES as readonly unknown[]).includes(t)) seen.add(t as Tone);
	if (seen.size > 1) seen.delete("neutral");
	const tones = [...seen].slice(0, 2);
	if (tones.length === 0) return null;
	const n = typeof r.intensity === "number" && Number.isFinite(r.intensity) ? Math.round(r.intensity) : 1;
	const intensity = Math.min(3, Math.max(1, n)) as 1 | 2 | 3;
	const about = ABOUTS.find((a) => a === r.about) ?? "gur";
	const wants = WANTS.find((w) => w === r.wants) ?? "nothing";
	const rawNote = typeof r.note === "string" ? r.note : "";
	const note = cleanNote(rawNote);
	// The crisis check runs on the raw and the cleaned note: "kill_myself" passes raw and cleans to "kill myself".
	const crisis = isCrisis(rawNote) || isCrisis(note) || rawNote.includes(CRISIS_CAUSE);
	if (intensity === 1 || tones.every((t) => LIGHT.includes(t)) || crisis) return { tones, intensity, about, wants, note: "", source };
	return { tones, intensity, about, wants, note, source };
}

// Keeps Gur's last reading and, when he was strongly upset, marks the turn so the next few stay heavy (emotions spec 8, rule 7).
export function rememberGur(session: Session, detection: Detection | null, now: number): Session {
	if (!detection) return session;
	const strong = detection.intensity === 3 && detection.tones.some((t) => NEGATIVE_TONES.includes(t));
	return { ...session, gur: { read: readOf(detection), at: now }, ...(strong ? { upset: { turn: session.turns, at: now } } : {}) };
}

const AM = String.raw`\b(?:i['’]?m|im|i am)\s+(?:feeling\s+)?(so\s+|really\s+|very\s+)?`;
type Row = { re: RegExp; tones: Tone[]; intensity: 1 | 2 | 3; about: About; boost?: boolean };
const am = (words: string, tones: Tone[], boost = false): Row => ({ re: new RegExp(`${AM}(?:${words})\\b`, "i"), tones, intensity: 2, about: "gur", boost });

// First match wins. The five old feeling cues of cues.ts live here now; its insult, sexual, delete, wrong and meh cues stay.
const ROWS: Row[] = [
	am("sad|down|depressed|upset|miserable", ["sad"], true),
	am("lonely", ["lonely"], true),
	am("worried|anxious|scared|afraid|nervous|stressed", ["worried"], true),
	am("tired|exhausted|drained|overwhelmed|burnt out", ["tired"]),
	am("excited|thrilled", ["excited"]),
	am("happy|great|glad", ["happy"]),
	{ re: /\b(?:my|his|her)\b.{0,30}\bin (?:the )?hospital\b/i, tones: ["worried"], intensity: 2, about: "someone_close" },
	{ re: /\bi\b.{0,30}\bin (?:the )?hospital\b/i, tones: ["worried"], intensity: 2, about: "gur" },
	{ re: /\b(?:thanks|thank you|appreciate (?:it|you)|good job|well done|you(?:'|’)?re (?:great|smart|awesome|amazing)|you are (?:great|smart|awesome|amazing))\b/i, tones: ["grateful"], intensity: 1, about: "osmo" },
	{ re: /\b(?:ily|love you)\b/i, tones: ["grateful"], intensity: 2, about: "osmo" },
	{ re: /\b(?:lol|lmao|lmfao|haha+|hehe+|rofl)\b/i, tones: ["playful"], intensity: 1, about: "gur" },
	{ re: INSULT, tones: ["angry"], intensity: 2, about: "osmo" },
	{ re: YOU_SUCK, tones: ["angry"], intensity: 2, about: "osmo" },
];

export function detectFromText(text: string): Detection | null {
	const input = withBaseFeelings(text.trim());
	for (const row of ROWS) {
		const m = row.re.exec(input);
		if (m) return { tones: row.tones, intensity: row.boost && m[1] ? 3 : row.intensity, about: row.about, wants: "nothing", note: "", source: "rules" };
	}
	return null;
}
