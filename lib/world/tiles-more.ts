// The free-will tiles (spec docs/superpowers/specs/2026-10-11-osmo-free-will-design.md section 4.5), appended after the
// polish pass's 71 in this order, which is their atlas order: append only. Task 0 draws each as a plain box so the parts,
// the dock and the balloon can name them; T4 replaces every grid with its drawn art.
import type { Grid } from "./raster";

export const MORE_TILE_IDS = [
	"plank-wall", "stone-wall", "back-wood", "back-stone", "post", "shutter", "thatch-l", "thatch-r", "thatch-flat", "thatch-peak",
	"rope", "bridge-board", "leaves", "fruit-leaves", "hedge", "water", "water-top", "flowers", "soil", "glass-wall",
	"glass-roof-l", "glass-roof-r", "balloon-tl", "balloon-tr", "balloon-bl", "balloon-br", "basket", "bell", "awning", "sail",
	"statue", "arch", "rail", "plank-wall-2", "stone-wall-2",
] as const;
export type MoreTileId = (typeof MORE_TILE_IDS)[number];

// A placeholder: the light letter on the top row and left column, the fill inside, the edge letter on the bottom row and
// right column.
const box = (light: string, fill: string, edge: string): Grid =>
	Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (y === 15 || x === 15 ? edge : y === 0 || x === 0 ? light : fill)).join(""));

export const MORE_TILES: Readonly<Record<MoreTileId, Grid>> = {
	"plank-wall": box("m", "l", "j"),
	"stone-wall": box("e", "d", "a"),
	"back-wood": box("l", "k", "j"),
	"back-stone": box("c", "b", "a"),
	post: box("W", "l", "j"),
	shutter: box("y", "x", "w"),
	"thatch-l": box("W", "B", "A"),
	"thatch-r": box("W", "B", "A"),
	"thatch-flat": box("W", "B", "A"),
	"thatch-peak": box("W", "B", "A"),
	rope: box("m", "B", "z"),
	"bridge-board": box("m", "k", "j"),
	leaves: box("E", "D", "C"),
	"fruit-leaves": box("E", "D", "i"),
	hedge: box("D", "C", "z"),
	water: box("s", "r", "q"),
	"water-top": box("p", "s", "r"),
	flowers: box("V", "i", "g"),
	soil: box("B", "A", "z"),
	"glass-wall": box("p", "s", "q"),
	"glass-roof-l": box("Y", "s", "q"),
	"glass-roof-r": box("Y", "s", "q"),
	"balloon-tl": box("V", "h", "f"),
	"balloon-tr": box("V", "h", "f"),
	"balloon-bl": box("V", "h", "f"),
	"balloon-br": box("V", "h", "f"),
	basket: box("W", "k", "j"),
	bell: box("t", "u", "A"),
	awning: box("V", "h", "g"),
	sail: box("o", "G", "F"),
	statue: box("e", "c", "b"),
	arch: box("d", "c", "a"),
	rail: box("m", "k", "z"),
	"plank-wall-2": box("m", "l", "k"),
	"stone-wall-2": box("e", "R", "a"),
};
