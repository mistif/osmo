// The observatory (spec 4 and 5): Settings, and Search's glass. The castle's east end and its highest point: a tower
// 9 by 17 tiles at x 51, y 9, with a glass dome (a drum, then sloping shoulders, then a flat crown), the castle's string
// course carried across it at y 18, windows above and on the hall's window rows, a banner over the door at x 55 and a
// lantern each side. Its top row (y 9) is two rows above the hall's peak, inside the two tiles of sky the camera keeps
// over the hall.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(9);

export const OBSERVATORY: Blueprint = {
	room: "observatory",
	x: 51,
	y: 9,
	map: [
		"..(ggg)..",
		".(ggggg).",
		".ggggggg.",
		"ThhhhhhhT",
		"IBBBBBBBI",
		"IBBvBvBBI",
		"IBBwBwBBI",
		"IBBBBBBBI",
		"IBBBBBBBI",
		"hhhhhhhhh",
		"IBBBBBBBI",
		"IBvBBBvBI",
		"IBwBBBwBI",
		"IBBBBBBBI",
		"IBBBaBBBI",
		"IBBBdBBBI",
		"SSSSSSSSS",
	],
	decor: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, "....b....", "....e....", BLANK, BLANK, "...l.l...", BLANK, BLANK],
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
