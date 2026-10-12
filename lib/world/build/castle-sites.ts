// The castle's six rooms as builds (spec 4.2 and 6.3): each room's footprint is today's blueprint unchanged, at its
// place moved by the home offset, under the recipe name "castle:<room>". Task 0, complete.
import { CASTLE } from "../blueprints/castle";
import { CASTLE_ROOMS, type CastleRoom } from "../blueprints/types";
import { HOME_DX, HOME_DY, type Rect } from "../map/types";
import type { Footprint } from "./types";

export const castleRecipeId = (room: CastleRoom): string => `castle:${room}`;
export function roomOfRecipe(id: string): CastleRoom | null {
	const room = id.startsWith("castle:") ? id.slice("castle:".length) : "";
	return (CASTLE_ROOMS as readonly string[]).includes(room) ? (room as CastleRoom) : null;
}
export const castleFootprint = (room: CastleRoom): Footprint => ({ map: CASTLE[room].map, decor: CASTLE[room].decor, legend: CASTLE[room].legend });
export const castleAt = (room: CastleRoom): { x: number; y: number } => ({ x: CASTLE[room].x + HOME_DX, y: CASTLE[room].y + HOME_DY });
// The rect a room's footprint covers at its place.
export function castleRect(room: CastleRoom): Rect {
	const at = castleAt(room);
	const fp = castleFootprint(room);
	return { x: at.x, y: at.y, w: fp.map[0].length, h: fp.map.length };
}
// The castle's six rooms, reserved whether they have a row or not (a room still locked, or open and not started, has
// none): the planner's PlanInput.blocked always holds them, so no free build is placed where a room will stand.
// Together they cover every usable column of the home island (449 to 504).
export const CASTLE_RECTS: readonly Rect[] = CASTLE_ROOMS.map(castleRect);
