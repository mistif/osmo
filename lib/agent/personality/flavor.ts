import type { Character } from "../character";
import { roll } from "./rng";
import { stageOf, type Bond, type MilestoneId, type Stage } from "../bond/bond";
import { milestoneLine, sharedMemory, welcomeBack } from "../bond/lines";

export type FlavorContext = {
	intent: string; // the conversation intent that produced the reply
	personality: Character;
	turn: number;
	tone: string; // Osmo's strongest emotion right now, or "calm"
	sensitive: boolean; // an insult, a sad user, a question about his own feelings
	bond?: Bond; // no bond means a stranger
	userName?: string | null;
	awayMs?: number; // time since the user's previous message
};

const LIGHT_INTENTS = new Set(["greeting", "howAreYou", "thanks", "laughter", "ack", "compliment"]);
const HEAVY_TONES = new Set(["sadness", "fear", "anger", "guilt", "loneliness"]);

// A turn that gets no extras: his mood is heavy, or the message is sensitive. Used here and by prepareTurn.
export const heavyTurn = (tone: string, sensitive: boolean): boolean => HEAVY_TONES.has(tone) || sensitive;

const FORMAL_SWAPS: [RegExp, string][] = [
	[/\bHey\b/g, "Hello"],
	[/\bHi\b/g, "Greetings"],
	[/\bThanks\b/g, "Thank you"],
	[/\bHappy to help\b/g, "Glad to be of service"],
	[/\bAnytime\b/g, "Whenever you like"],
];
const CONTRACTIONS: [RegExp, string][] = [
	[/\bI'm\b/g, "I am"],
	[/\bI'll\b/g, "I will"],
	[/\bI've\b/g, "I have"],
	[/\bI'd\b/g, "I would"],
	[/\b(you|You|we|We|they|They)'re\b/g, "$1 are"],
	[/\b(it|It|that|That|there|There|what|What|he|He|she|She)'s\b/g, "$1 is"],
	[/\bdon't\b/g, "do not"],
	[/\bdoesn't\b/g, "does not"],
	[/\bdidn't\b/g, "did not"],
	[/\bcan't\b/g, "cannot"],
	[/\bwon't\b/g, "will not"],
];

const swap = (text: string, table: [RegExp, string][]) => table.reduce((t, [re, to]) => t.replace(re, to), text);
const pickAt = <T>(list: T[], turn: number): T => list[turn % list.length];
const SENTENCE_BREAK = /(?<=[.!?])\s+/;

function dropTrailingQuestion(text: string): string {
	const sentences = text.split(SENTENCE_BREAK);
	return sentences.length > 1 && sentences[sentences.length - 1].endsWith("?") ? sentences.slice(0, -1).join(" ") : text;
}

// An extra goes before a closing question, so the question is still the last thing he says.
function addExtra(text: string, extra: string): string {
	const sentences = text.split(SENTENCE_BREAK);
	const last = sentences[sentences.length - 1];
	return last.endsWith("?") ? [...sentences.slice(0, -1), extra, last].join(" ") : `${text} ${extra}`;
}

const AWAY_MS = 20 * 3600_000;
// Includes talk.ts's calm openers ("Good to see you, Gur.", "Welcome back.") so a welcome never stacks on them.
const LEADING_GREETING = /^(?:hi|hey|hello|greetings|good (?:morning|afternoon|evening)|good to see you|welcome back)(?:,\s*[^!.?]+)?[!.]\s*/i;

// Past stranger the welcome replaces a leading greeting, which already carries the name.
// A stranger's plain "Welcome back." has no name, so it goes in front and the greeting stays.
function welcomed(text: string, hello: string, stage: Stage): string {
	if (stage !== "stranger") return `${hello} ${text.replace(LEADING_GREETING, "")}`.trim();
	return /^welcome back\b/i.test(text) ? text : `${hello} ${text}`.trim();
}

// The first-event line is said with the event itself (mind.ts step 2), and the first-feeling line only fits
// the turn the feeling is shared. Anywhere else they come out of nowhere. Sensitive turns never get this far.
const fitsNow = (id: MilestoneId, intent: string) =>
	milestoneLine(id) !== null && id !== "firstEvent" && (id !== "firstFeeling" || intent === "userFeeling");

export type MilestoneContext = Pick<FlavorContext, "intent" | "tone" | "sensitive" | "bond" | "awayMs">;

// Being away makes him lonely, which is exactly when a welcome back fits, so loneliness alone does not block it.
function welcomesBack(ctx: MilestoneContext): boolean {
	const firstVisit = !ctx.bond || ctx.bond.messages <= 1;
	const upset = ctx.sensitive || (HEAVY_TONES.has(ctx.tone) && ctx.tone !== "loneliness");
	return !upset && !firstVisit && ctx.intent !== "farewell" && (ctx.awayMs ?? 0) >= AWAY_MS;
}

// The milestone he brings up this turn, if any: never beside a welcome back, on a heavy turn, or to a frustrated user
// (it waits for a better moment), and only one that fits now. flavorTurn says it; prepareTurn in mind.ts hands it to a
// language model to say.
export function milestoneDue(ctx: MilestoneContext): MilestoneId | null {
	if (!ctx.bond || welcomesBack(ctx) || heavyTurn(ctx.tone, ctx.sensitive)) return null;
	if (ctx.intent === "misunderstood" || ctx.intent === "rudeFeedback") return null;
	return ctx.bond.toMention.find((id) => fitsNow(id, ctx.intent)) ?? null;
}

// How often each extra may appear, by stage.
const MEMORY_RATE: Record<Stage, number> = { stranger: 0, acquaintance: 0, friend: 0.08, oldFriend: 0.15 };

export function flavorTurn(reply: string, ctx: FlavorContext): { text: string; mentioned: MilestoneId | null } {
	const { personality: p, intent } = ctx;
	const seed = p.seed;
	const bond = ctx.bond;
	const stage: Stage = bond ? stageOf(bond) : "stranger";
	// The session's turn restarts at 0 on every page load, so rolls and picks follow the lifetime message count.
	const turn = bond ? bond.messages : ctx.turn;

	const heavy = heavyTurn(ctx.tone, ctx.sensitive);
	const calmEnough = intent !== "howAreYou" || ctx.tone === "calm";
	const light = LIGHT_INTENTS.has(intent) && calmEnough && !heavy;

	let text = reply;
	// Professional at all times: a formal character expands contractions; nobody is made more casual.
	if (p.voice.formality > 0.75) text = swap(swap(text, FORMAL_SWAPS), CONTRACTIONS);
	if (p.voice.verbosity < 0.3 && !heavy) text = dropTrailingQuestion(text);
	if (welcomesBack(ctx)) {
		return { text: welcomed(text, welcomeBack(stage, ctx.userName ?? null, turn), stage), mentioned: null };
	}
	if (heavy) return { text, mentioned: null };

	// At most one extra, in priority order.
	const due = milestoneDue(ctx);
	const line = due ? milestoneLine(due) : null;
	if (due && line) return { text: addExtra(text, line), mentioned: due };

	if (!light || !bond) return { text, mentioned: null };

	const memory = sharedMemory(bond, turn);
	if (memory && roll(seed, turn, "memory") < MEMORY_RATE[stage]) return { text: addExtra(text, memory), mentioned: null };

	// Dry wit shows from friend on.
	const close = stage === "friend" || stage === "oldFriend";
	if (close && p.humor.lines.length && roll(seed, turn, "humor") < p.humor.level * 0.5) {
		return { text: addExtra(text, pickAt(p.humor.lines, turn)), mentioned: null };
	}
	return { text, mentioned: null };
}

export function flavor(reply: string, ctx: FlavorContext): string {
	return flavorTurn(reply, ctx).text;
}
