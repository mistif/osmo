// The observatory (spec 4 and 5): Settings, and Search's glass. The castle's east end and its highest point: a tower
// 9 by 17 tiles at x 51, y 9, with a glass dome, a string course halfway up and the door at x 55. Its top row (y 9) is
// two rows above the hall's peak, inside the two tiles of sky the camera keeps over the hall. Draft from the phase 2
// plan; Task 4 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(9);

export const OBSERVATORY: Blueprint = {
	room: "observatory",
	x: 51,
	y: 9,
	map: [
		"...(g)...",
		"..(ggg)..",
		".(ggggg).",
		"ThhhhhhhT",
		"IBBBBBBBI",
		"IBBvBvBBI",
		"IBBwBwBBI",
		"IBBBBBBBI",
		"hhhhhhhhh",
		"IBBBBBBBI",
		"IBvBBBvBI",
		"IBwBBBwBI",
		"IBBBBBBBI",
		"IBBBBBBBI",
		"IBBBaBBBI",
		"IBBBdBBBI",
		"SSSSSSSSS",
	],
	decor: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, ".b.....b.", ".e.....e.", BLANK, BLANK, BLANK, "...l.l...", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		T: { tile: "battlement", layer: "roof" },
		"(": { tile: "dome-l", layer: "roof" },
		")": { tile: "dome-r", layer: "roof" },
		g: { tile: "dome", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
