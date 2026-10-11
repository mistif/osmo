// The compiler (spec section 4.2): a recipe, its variation and a site to a footprint and its place. Task 0 stub; T6 builds it.
import type { Compiled, Part, Recipe, Site, Variation } from "./types";

// Throws when the variation names a part that is not in `parts` or not fit for its tier, or leaves a required tier out.
export function compile(recipe: Recipe, v: Variation, site: Site, parts: readonly Part[]): Compiled {
	void [recipe, v, site, parts];
	throw new Error("not built: compile");
}
