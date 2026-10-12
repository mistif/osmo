import { describe, expect, it } from "vitest";
import { cellsOf } from "../blueprints";
import { CASTLE_BLOCKS } from "../blueprints/castle";
import { CASTLE_ROOMS } from "../blueprints/types";
import { shiftBlocks } from "../map/home";
import { CASTLE_RECTS, castleAt, castleFootprint, castleRecipeId, castleRect, roomOfRecipe } from "./castle-sites";

describe("the castle's rooms as builds", () => {
	it("reserves every room's rect, together every column a build could use on the home island", () => {
		expect(castleRect("hall")).toEqual({ x: 468, y: 71, w: 19, h: 15 });
		expect(CASTLE_RECTS).toHaveLength(6);
		for (let x = 449; x <= 504; x++) expect(CASTLE_RECTS.some((r) => x >= r.x && x < r.x + r.w), `column ${x}`).toBe(true);
	});
	it.each(CASTLE_ROOMS)("%s keeps today's blueprint, moved by the home offset", (room) => {
		const at = castleAt(room);
		expect(cellsOf(castleFootprint(room), at.x, at.y, castleRecipeId(room))).toEqual(shiftBlocks(CASTLE_BLOCKS[room], 445, 60));
	});
	it("places the hall at 468, 71", () => {
		expect(castleAt("hall")).toEqual({ x: 468, y: 71 });
	});
	it("names a room by its recipe and back", () => {
		expect(castleRecipeId("observatory")).toBe("castle:observatory");
		expect(roomOfRecipe("castle:library")).toBe("library");
		expect(roomOfRecipe("cottage")).toBeNull();
		expect(roomOfRecipe("castle:moat")).toBeNull();
		expect(roomOfRecipe("castle:")).toBeNull();
	});
});
