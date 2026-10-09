// The island (spec 2 and 4): pre-built, never laid. 48 tiles wide from x 8, rows 24 to 34: the lantern and the
// bench above the snow, the snow cap, the stone body tapering down, and roots hanging below.
import type { Blueprint } from "./types";

const W = 48;
const at = (marks: Readonly<Record<number, string>>) => Array.from({ length: W }, (_, i) => marks[i] ?? ".").join("");
const band = (inset: number, left: string, fill: string, right: string) =>
	".".repeat(inset) + left + fill.repeat(W - 2 * inset - 2) + right + ".".repeat(inset);

export const ISLAND: Blueprint = {
	room: "island",
	x: 8,
	y: 24,
	map: [
		at({ 41: "L" }),
		at({ 4: "g", 9: "g", 35: "g", 39: "b", 41: "p", 45: "g" }),
		band(0, "[", "n", "]"),
		band(0, "{", "s", "}"),
		band(1, "{", "s", "}"),
		band(3, "{", "k", "}"),
		band(6, "{", "k", "}"),
		".".repeat(10) + "u".repeat(28) + ".".repeat(10),
		at({ 12: "r", 15: "r", 19: "r", 24: "r", 28: "r", 33: "r", 36: "r" }),
		at({ 12: "t", 15: "r", 19: "t", 24: "r", 28: "t", 33: "r", 36: "t" }),
		at({ 15: "t", 24: "t", 33: "t" }),
	],
	decor: [],
	legend: {
		"[": { tile: "snow-edge-l", layer: "ground" },
		n: { tile: "snow", layer: "ground" },
		"]": { tile: "snow-edge-r", layer: "ground" },
		s: { tile: "stone", layer: "ground" },
		k: { tile: "stone-dark", layer: "ground" },
		"{": { tile: "stone-edge-l", layer: "ground" },
		"}": { tile: "stone-edge-r", layer: "ground" },
		u: { tile: "stone-bottom", layer: "ground" },
		r: { tile: "root", layer: "ground" },
		t: { tile: "root-end", layer: "ground" },
		g: { tile: "grass", layer: "ground" },
		b: { tile: "bench", layer: "ground" },
		p: { tile: "lantern-post", layer: "ground" },
		L: { tile: "lantern", layer: "ground" },
	},
};
