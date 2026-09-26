import type { Donor } from "./types";

export const goodDonor = (over: Partial<Donor> = {}): Donor => ({
	id: "the-test-donor",
	name: "The Test Donor",
	family: "gentle",
	tagline: "A donor for the tests.",
	heart: { baseline: { love: 0.1, hope: 0.05 }, reactivity: 1.1 },
	brain: { honesty: 0.2, kindness: 0.4, fairness: 0.15, loyalty: 0.15, harm: 0.1 },
	voice: {
		formality: 0.4,
		verbosity: 0.6,
		warmth: 0.8,
		openers: ["Oh, friend.", "Well now."],
		elaboration: "I do like a good chat.",
	},
	humor: { style: "pun", level: 0.5, lines: ["That was tea-rrific.", "I'm on a roll.", "Bun intended."] },
	slang: {
		lexicon: { bussin: "really good", yeet: "throw", sus: "suspicious", rizz: "charm" },
		says: ["No cap.", "Fr fr."],
	},
	quirks: { phrases: ["Bless your heart.", "Well, I never."], rate: 0.15 },
	...over,
});
