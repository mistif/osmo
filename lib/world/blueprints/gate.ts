// The gate (spec 4 and 5): where what arrives comes in, and the Feed's place. The castle's west end: a gatehouse 7 by 11
// tiles at x 4, y 15, with a turret at each corner and the gate door at x 7. Draft from the phase 2 plan; Task 4 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(7);

export const GATE: Blueprint = {
	room: "gate",
	x: 4,
	y: 15,
	map: [
		"T.....T",
		"I.....I",
		"I.TTT.I",
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
