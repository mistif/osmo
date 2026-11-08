// The castle's move into builds (spec 6.3): the six rooms' footprints, places and block counts as the SQL values the
// migration docs/migrations/free-will-builds.sql carries; castle-move.test.ts holds the file to them.
import { cellsOf } from "../blueprints";
import { CASTLE_ROOMS } from "../blueprints/types";
import { castleAt, castleFootprint } from "./castle-sites";

export function castleMoveValues(): string {
	return CASTLE_ROOMS.map((room) => {
		const at = castleAt(room);
		const fp = castleFootprint(room);
		const total = cellsOf(fp, at.x, at.y, room).length;
		const json = JSON.stringify(fp).replace(/'/g, "''");
		return `  ('${room}', ${at.x}, ${at.y}, '${json}'::jsonb, ${total})`;
	}).join(",\n");
}
