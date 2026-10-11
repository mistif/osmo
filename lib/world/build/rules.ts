// The rules every build passes (spec section 4.3). Task 0 stub; T6 builds it.
import type { Deck, Rect, WorldMap } from "../map/types";
import type { Compiled, Problem, Recipe, RuleWorld, Site } from "./types";

// Everything wrong with a compiled build on its site: [] when it passes every rule.
export function checkBuild(c: Compiled, recipe: Recipe, site: Site, world: RuleWorld): Problem[] {
	void [c, recipe, site, world];
	throw new Error("not built: checkBuild");
}
// The rules' view of a world: land from the map's ground at or under each island's top row, and each deck's standing
// cells (the balloon dock, DOCK_DECK, in builds mode: a bridge east of home stands on its far board); taken from the rects.
export function ruleWorldOf(map: WorldMap, taken: readonly Rect[], decks: readonly Deck[] = []): RuleWorld {
	void [map, taken, decks];
	throw new Error("not built: ruleWorldOf");
}
