// The big world (spec docs/superpowers/specs/2026-10-11-osmo-free-will-design.md section 3): its size, where today's
// island sits in it, its islands, the saved row, and the shapes travel uses. Types and constants only (Task 0 of
// docs/superpowers/plans/2026-10-11-osmo-free-will.md). Tiles unless a name says px.
import type { Block } from "../blueprints/types";

export const BIG_W = 1024; // tiles across
export const BIG_H = 160; // tiles down
// Generator version 1 places today's island by this offset: its left end (tile 3 today) on tile 448 and its snow row
// (26 today) on row 86. Every blueprint coordinate of the island and the castle moves by it; nothing else changes.
export const HOME_DX = 445;
export const HOME_DY = 60;
export const GEN = 1; // the generator version a new world is made with, saved with it
export const START_ISLANDS = 4; // home and three new ones
export const MAX_ISLANDS = 8; // version 1 places at most this many
export const RISE_SHARE = 0.8; // another island rises when this share of the usable surface is built
export const CHUNK = 32; // tiles on a chunk's side

export type Island = {
	id: number; // 0 is home, then in the order they rise
	x0: number; // its first column
	x1: number; // one past its last column
	ground: number; // the row its top is built around (home: 86)
	top: readonly number[]; // for each column from x0: the row he stands on (that row's top edge is his feet)
	home: boolean;
};
export type WorldMap = {
	seed: number;
	gen: number;
	islands: readonly Island[]; // by id
	ground: readonly Block[]; // every island's rock, snow and scenery, layer "ground"
};
// The saved row (section 6.1). islands: how many are present, home included (4 to 8).
export type WorldRow = { seed: number; gen: number; islands: number; budget_at: string; created_at: string; seen_at: string };
export type Rect = { x: number; y: number; w: number; h: number };

// Travel (section 4.6), in world px.
export type WorldPt = { x: number; y: number };
// A balloon trip: from where he boards to where he lands, rising to the height `top` on the way, ms long.
export type BalloonPath = { from: WorldPt; to: WorldPt; top: number; ms: number };
// The trip he is on: how far into it he is (ms, advanced by ticks, never by the wall clock) and the island he lands on.
export type Ride = { path: BalloonPath; t: number; island: number };
// Something he walks on outside an island's top (a finished rope bridge, the balloon dock): columns x0 to x1 - 1, the
// row he stands on in each, and the two islands it joins (the dock joins home to home).
export type Deck = { x0: number; x1: number; rows: readonly number[]; from: number; to: number };
// What he does next on the way to a place on another island: walk to world px x on his island, or board the balloon.
export type Leg = { kind: "walk"; x: number } | { kind: "board"; path: BalloonPath; island: number };
