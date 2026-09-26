import type { Emotion, Weights } from "../state";

export type HumorStyle = "dry" | "pun" | "teasing" | "absurd" | "none";

export const DONOR_FAMILIES = [
	"gentle",
	"grumpy",
	"bold",
	"curious",
	"playful",
	"cool",
	"formal",
	"tender",
	"fierce",
	"strange",
] as const;
export type DonorFamily = (typeof DONOR_FAMILIES)[number];

export type Donor = {
	id: string; // kebab-case, e.g. "the-gentle-poet"
	name: string; // "The Gentle Poet"
	family: DonorFamily;
	tagline: string;
	heart: {
		baseline: Partial<Record<Emotion, number>>; // deltas to the default baseline
		reactivity: number; // 0.6..1.5
	};
	brain: Weights; // honesty, kindness, fairness, loyalty, harm (normalized when used)
	voice: {
		formality: number; // 0..1
		verbosity: number; // 0..1
		warmth: number; // 0..1
		openers: string[]; // 2-4 short warm openers, e.g. "Oh, dear friend."
		elaboration: string; // one extra sentence for chatty moods
	};
	humor: {
		style: HumorStyle;
		level: number; // 0..1 (0 when style is "none")
		lines: string[]; // 3-6 short lines in that style ([] when "none")
	};
	slang: {
		lexicon: Record<string, string>; // 4-8 words this donor's world uses -> plain meaning
		says: string[]; // 2-4 short tags this donor actually says, e.g. "No cap."
	};
	quirks: {
		phrases: string[]; // 2-4 catchphrases
		rate: number; // 0..0.3
	};
};
