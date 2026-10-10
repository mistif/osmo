// The library (spec 4 and 5): memory and notes. The west wing, 9 by 9 tiles at x 16, y 17, against the hall: its last
// column (x 24) is the hall's step end, so that column has walls but no floor. A low hipped roof over the hall's string
// course (y 18, the hall's beam carried on), two tall bookshelf windows on the hall's window rows, one banner over the
// door at x 21 and a lantern each side of it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(9);

export const LIBRARY: Blueprint = {
	room: "library",
	x: 16,
	y: 17,
	map: [
		"<=======>",
		"hhhhhhhhh",
		"BBBBBBBBB",
		"BBkBBBBBk",
		"BBkBBBBBk",
		"BBBBBBBBB",
		"BBBBBaBBB",
		"BBBBBdBBB",
		"SSSSSSSS.",
	],
	decor: [BLANK, BLANK, ".....b...", ".....e...", BLANK, BLANK, "....l.l..", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		"<": { tile: "roof-left", layer: "roof" },
		">": { tile: "roof-right", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		k: { tile: "shelf-window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
