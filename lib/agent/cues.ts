import { applyShifts } from "./heart";
import type { Activations, Emotion } from "./state";

export const GAP_MS = 6 * 60 * 60 * 1000;

type Cue = { pattern: RegExp; shifts: Partial<Record<Emotion, number>> };

// Life events ("my dog died", "I got the job") are handled in events.ts, not here.
// Shared with detection.ts, which reads an insult as Gur being angry at Osmo.
export const INSULT = /\b(stupid|idiot|useless|dumb|hate you|shut up|stfu|moron|retard(?:ed)?|loser|fuck (?:you|off))\b/i;
export const YOU_SUCK = /\b(?:you|u) suck\b/i;

const CUES: Cue[] = [
	{
		pattern:
			/\b(thanks|thank you|appreciate (?:it|you)|good job|well done|you(?:'|’)?re (?:great|smart|awesome|amazing)|you are (?:great|smart|awesome|amazing))\b/i,
		shifts: { joy: 0.15, trust: 0.1, love: 0.1 },
	},
	{
		pattern: INSULT,
		shifts: { anger: 0.25, trust: -0.2, sadness: 0.1 },
	},
	{
		pattern: /\b(nudes?|horny|have sex|sex with you|(?:fuck|screw|bang)(?:ing)? you (?:raw|hard))\b/i,
		shifts: { disgust: 0.3, trust: -0.15 },
	},
	{
		pattern: /\b(delete you|shut you down|turn you off|erase you)\b/i,
		shifts: { fear: 0.35, trust: -0.1 },
	},
	{
		pattern: /\b(that was wrong|you(?:'|’)?re wrong|you are wrong|your mistake)\b/i,
		shifts: { guilt: 0.2 },
	},
	{
		pattern:
			/\b(?:i['’]?m|im|i am)\s+(?:feeling\s+)?(?:so\s+|really\s+|very\s+)?(?:sad|down|depressed|lonely|upset|miserable)\b/i,
		shifts: { sadness: 0.25, loneliness: 0.05 },
	},
	{
		pattern:
			/\b(?:i['’]?m|im|i am)\s+(?:feeling\s+)?(?:so\s+|really\s+|very\s+)?(?:happy|great|excited|glad|thrilled)\b/i,
		shifts: { joy: 0.25, hope: 0.05 },
	},
	{
		pattern: /\b(?:ily|love you)\b/i,
		shifts: { love: 0.2, joy: 0.1 },
	},
	{
		pattern: /\b(?:lol|lmao|lmfao|haha+|hehe+|rofl)\b/i,
		shifts: { joy: 0.1 },
	},
	{
		pattern: YOU_SUCK,
		shifts: { anger: 0.25, trust: -0.2, sadness: 0.1 },
	},
	{
		pattern: /^\s*(meh|idk|whatever|hm+)\W*$/i,
		shifts: { boredom: 0.2 },
	},
];

export function applyCues(a: Activations, text: string, scale = 1): Activations {
	let next = a;
	for (const cue of CUES) {
		if (cue.pattern.test(text)) next = applyShifts(next, cue.shifts, scale);
	}
	return next;
}

export function applyGap(a: Activations, msSinceLast: number): Activations {
	if (!Number.isFinite(msSinceLast) || msSinceLast < GAP_MS) return a;
	return applyShifts(a, { loneliness: 0.2, boredom: 0.1 });
}

// A closer Osmo rests a little warmer.
export function bondBaseline(base: Activations, close: number): Activations {
	if (close <= 0) return base;
	return {
		...base,
		trust: Math.min(0.85, base.trust + 0.08 * close),
		love: Math.min(0.85, base.love + 0.08 * close),
	};
}

// Being away makes him lonelier the closer you are.
export function missYou(a: Activations, msAway: number, close: number): Activations {
	if (!Number.isFinite(msAway) || msAway < GAP_MS || close <= 0) return a;
	return applyShifts(a, { loneliness: 0.2 * close });
}
