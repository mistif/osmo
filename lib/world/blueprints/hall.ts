// The hall (spec 4): the first room, started on day one. 19 by 15 tiles at x 23, y 11; its foundation sits on the
// island's snow and its door is at x 32. 180 blocks: 174 in the map and 6 in the decor.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(19);

export const HALL: Blueprint = {
	room: "hall",
	x: 23,
	y: 11,
	map: [
		".........^.........",
		"........<=>..T.....",
		".......<===>.C.....",
		"......<=====>C.....",
		".....<=======>.....",
		"....<=========>....",
		"...<===========>...",
		"..hhhhhhhhhhhhhhh..",
		"..IBBBBBBBBBBBBBI..",
		"..IBBvBBBBBBBvBBI..",
		"..IBBwBBBBBBBwBBI..",
		"..IBBBBBBBBBBBBBI..",
		"..IBBBBBBaBBBBBBI..",
		"..IBBBBBBdBBBBBBI..",
		".SSSSSSSSSSSSSSSSS.",
	],
	decor: [
		BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK,
		".......b...b.......",
		".......e...e.......",
		BLANK, BLANK,
		"........l.l........",
		BLANK, BLANK,
	],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		"<": { tile: "roof-left", layer: "roof" },
		">": { tile: "roof-right", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		"^": { tile: "roof-peak", layer: "roof" },
		C: { tile: "brick", layer: "roof" }, // the chimney, laid with the roof it stands on
		T: { tile: "battlement", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
