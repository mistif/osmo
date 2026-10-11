// Scenery under builds (spec section 3.1: builds may cover the generator's trees and rocks). Task 0 stub; T1 builds it.
import type { Block } from "../blueprints/types";
import type { Rect, WorldMap } from "./types";

// The ground to draw: every block of the map except scenery (a block above its island's top row) inside any of the
// rects (the footprints of builds that have started). Land is never left out.
export function uncovered(map: WorldMap, rects: readonly Rect[]): Block[] {
	void [map, rects];
	throw new Error("not built: uncovered");
}
