// Scenery under builds (spec section 3.1: builds may cover the generator's trees and rocks).
import type { Block } from "../blueprints/types";
import { surfaceAt } from "./lookup";
import type { Rect, WorldMap } from "./types";

// The ground to draw: every block of the map except scenery (a block above its island's top row) inside any of the
// rects (the footprints of builds that have started). Land is never left out.
export function uncovered(map: WorldMap, rects: readonly Rect[]): Block[] {
	if (rects.length === 0) return [...map.ground];
	return map.ground.filter((b) => {
		const top = surfaceAt(map, b.x);
		if (top === null || b.y >= top) return true;
		return !rects.some((r) => b.x >= r.x && b.x < r.x + r.w && b.y >= r.y && b.y < r.y + r.h);
	});
}
