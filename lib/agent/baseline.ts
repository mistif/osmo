import type { Activations } from "./state";

// The character's resting mood. Lives in its own leaf file so state.ts and character.ts can both read it
// without importing each other (character.ts needs DEFAULT_WEIGHTS from state.ts).
export const CHARACTER_BASELINE: Activations = {
	joy: 0.5,
	sadness: 0.1,
	anger: 0.05,
	fear: 0.08,
	trust: 0.65,
	disgust: 0.08,
	surprise: 0.12,
	love: 0.2,
	hope: 0.45,
	guilt: 0.08,
	loneliness: 0.12,
	boredom: 0.1,
};
