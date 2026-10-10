// The gate (spec 4 and 5): where what arrives comes in, and the Feed's place. The castle's west end: a gatehouse 7 by 11
// tiles at x 4, y 15, a turret at each corner with a crenellated parapet between them over the castle's string course
// (y 18), windows on the hall's window rows and the gate door at x 7 between two lanterns.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(7);

export const GATE: Blueprint = {
	room: "gate",
	x: 4,
	y: 15,
	map: [
		"T.....T",
		"I.....I",
		"ITTTTTI",
		"IhhhhhI",
		"IBBBBBI",
		"IvBBBvI",
		"IwBBBwI",
		"IBBBBBI",
		"IBBaBBI",
		"IBBdBBI",
		"SSSSSSS",
	],
	decor: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, "..l.l..", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		T: { tile: "battlement", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
	},
};
