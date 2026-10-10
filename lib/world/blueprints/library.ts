// The library (spec 4 and 5): memory and notes. The west wing, 9 by 9 tiles at x 16, y 17, against the hall: its last
// column (x 24) is the hall's step end, so that column has walls but no floor. Bookshelf windows; door at x 21.
// Draft from the phase 2 plan; Task 3 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(9);

export const LIBRARY: Blueprint = {
	room: "library",
	x: 16,
	y: 17,
	map: [
		".<=======",
		"<========",
		"hhhhhhhhh",
		"IBBBBBBBB",
		"IBkkBBBkB",
		"IBkkBBBkB",
		"IBBBBaBBB",
		"IBBBBdBBB",
		"SSSSSSSS.",
	],
	decor: [BLANK, BLANK, BLANK, ".b....b..", ".e....e..", BLANK, "....l.l..", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		"<": { tile: "roof-left", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		k: { tile: "shelf-window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
