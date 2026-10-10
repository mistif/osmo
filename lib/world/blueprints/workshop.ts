// The workshop (spec 4 and 5): the things he made. The east wing, 11 by 9 tiles at x 40, y 17, against the hall: its
// first column (x 40) is the hall's step end, so that column has walls but no floor. A chimney with a battlement cap,
// a forge at its hearth and the door at x 44. Draft from the phase 2 plan; Task 3 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(11);

export const WORKSHOP: Blueprint = {
	room: "workshop",
	x: 40,
	y: 17,
	map: [
		"=======>.T.",
		"========>C.",
		"hhhhhhhhhhh",
		"BBBBBBBBBBI",
		"BBvBBBBBvBI",
		"BBwBBBBBwBI",
		"BBBBaBBBBBI",
		"BBBBdBffBBI",
		".SSSSSSSSSS",
	],
	decor: [BLANK, BLANK, BLANK, ".b.......b.", ".e.......e.", BLANK, "...l.l.....", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		">": { tile: "roof-right", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		C: { tile: "brick", layer: "roof" }, // the chimney, laid with the roof it stands on
		T: { tile: "battlement", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		f: { tile: "forge", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
