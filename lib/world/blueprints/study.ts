// The study (spec 4 and 5): ideas and goals. A slim tower 5 by 13 tiles at x 11, y 13, between the gate and the
// library, with a pointed roof, a tower cap and its door at x 13. Draft from the phase 2 plan; Task 4 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(5);

export const STUDY: Blueprint = {
	room: "study",
	x: 11,
	y: 13,
	map: [
		"..c..",
		"..^..",
		".<=>.",
		"<===>",
		"hhhhh",
		"IBBBI",
		"IBvBI",
		"IBwBI",
		"IkBBI",
		"IBBBI",
		"IBaBI",
		"IBdBI",
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
		"^": { tile: "roof-peak", layer: "roof" },
		c: { tile: "tower-cap", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		k: { tile: "shelf-window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
	},
};
