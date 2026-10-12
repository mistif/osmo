// The castle's six rooms as fixed recipes (spec section 4.2). Task 0 stub (empty); T6 writes them.
import { CASTLE_ROOMS } from "../blueprints/types";
import { castleAt, castleFootprint, castleRecipeId } from "./castle-sites";
import type { Recipe } from "./types";

export const CASTLE_RECIPES: readonly Recipe[] = CASTLE_ROOMS.map((room) => ({
	id: castleRecipeId(room),
	name: `castle ${room}`,
	kind: "castle",
	size: "large",
	site: "level",
	width: [1, 1],
	materials: ["stone"],
	tiers: [],
	doors: [],
	decor: { parts: [], max: 0 },
	sides: { parts: [], max: 0 },
	fixed: { footprint: castleFootprint(room), ...castleAt(room) },
}));
