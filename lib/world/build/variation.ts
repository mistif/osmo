// Choosing a build's variation (spec section 4.2), seeded. Task 0 stub; T6 builds it.
import type { Part, Recipe, Variation } from "./types";

// Every choice for one build of a recipe, from a seed: the same seed always gives the same variation.
export function chooseVariation(recipe: Recipe, parts: readonly Part[], seed: number): Variation {
	void [recipe, parts, seed];
	throw new Error("not built: chooseVariation");
}
// A variation of one of his own builds: the same recipe with exactly one choice changed (spec 4.2, "his own recipes").
export function vary(v: Variation, recipe: Recipe, parts: readonly Part[], seed: number): Variation {
	void [v, recipe, parts, seed];
	throw new Error("not built: vary");
}
