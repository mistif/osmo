// The study (spec 4 and 5): ideas and goals. A slim tower 5 by 13 tiles at x 11, y 13, between the gate and the
// library, standing proud of the castle's string course: its own eave at y 16 under a hipped roof whose flat ridge
// carries the tower cap (on the ridge, not on a roof peak, so the spire has no finial under it), a bookshelf window level
// with the string course, a tall window on the hall's window rows and its door at x 13 between two lanterns. Its west
// corner is the gate's turret.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(5);

export const STUDY: Blueprint = {
	room: "study",
	x: 11,
	y: 13,
	map: [
		"..c..",
		".<=>.",
		"<===>",
		"hhhhh",
		"BBBBI",
		"BBkBI",
		"BBBBI",
		"BBvBI",
		"BBwBI",
		"BBBBI",
		"BBaBI",
		"BBdBI",
		"SSSSS",
	],
	decor: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, ".l.l.", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		"<": { tile: "roof-left", layer: "roof" },
		">": { tile: "roof-right", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		c: { tile: "tower-cap", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		k: { tile: "shelf-window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
	},
};
