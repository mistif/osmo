import type { Personality } from "./assemble";

export function describeMadeOf(p: Personality): string {
	if (!p.names) return "I don't have a personality of my own yet.";
	const n = p.names;
	return (
		`I was assembled from several donors. My heart comes from ${n.heart}, my judgement from ${n.brain}, ` +
		`my voice from ${n.voice}, my humor from ${n.humor}, my slang from ${n.slang}, and my quirks from ${n.quirks}.`
	);
}

export function isAskMadeOf(text: string): boolean {
	return /^\s*(what are you made of|who are you really|what is your personality|tell me about your personality|what makes you you)\b/i.test(text);
}

export function parseReroll(text: string): { seed?: number } | null {
	const m = text.trim().match(/^(?:please\s+)?(?:re-?roll(?:\s+osmo)?|roll (?:a|me a) new osmo|make (?:a )?new osmo)(?:\s+with seed\s+(\d+))?\s*[.!]*$/i);
	if (!m) return null;
	return m[1] === undefined ? {} : { seed: Number(m[1]) };
}

export function isConfirmRoll(text: string): boolean {
	return /^\s*yes[,\s]+roll(?:\s+it)?\s*[.!]*$/i.test(text);
}

export const REROLL_PROMPT =
	'That would give me an entirely new personality. My memories of you would remain, but my moral judgement would start over. Say "yes, roll" to proceed.';

export function afterReroll(p: Personality): string {
	return `Done. ${describeMadeOf(p)}`;
}
