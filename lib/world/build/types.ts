// The build grammar (spec docs/superpowers/specs/2026-10-11-osmo-free-will-design.md section 4): parts, recipes, the
// variation one build takes, the footprint it compiles to, its site, the rules it passes, the saved row, the state the
// world builds from, and what the planner offers. Types and constants only (Task 0 of
// docs/superpowers/plans/2026-10-11-osmo-free-will.md; "The grammar, in one place" there says the same in prose).
// Tiles unless a name says px.
import type { Block, CastleRoom, Legend } from "../blueprints/types";

export type Material = "wood" | "stone" | "brick";
export const MATERIALS: readonly Material[] = ["wood", "stone", "brick"];
export type Size = "small" | "medium" | "large";
export const SIZE_FROM = { medium: 80, large: 200 } as const; // blocks
export type PartGroup = "structure" | "tops" | "additions" | "around" | "travel";

// How a part takes a width:
// - fixed: drawn as its grid, centred on the span below.
// - row: every row is a left cap letter, a fill pattern and a right cap letter, all patterns the same length; at width W
//   (2 or more) a row is its left cap, W - 2 letters of its pattern (util.ts rowsAt) and its right cap.
// - gable, spire: a roof over the span. The grid is one row of four letters: left slope, fill, right slope, peak. Row k
//   from the bottom is inset k (gable) or floor(k / 2) (spire) on each side (util.ts roofRows). A spire may name six,
//   the last two the upper row's slopes of each pair; a peak "." ends the roof flat (a dome).
export type Fit = "fixed" | "row" | "gable" | "spire";
// Where a part may go. Its joints follow from the role: it sits on its bottom edge centred on what is below it (its base
// joint), the next tier sits on its top edge (top), decor hangs on its wall cells (hang), the door goes in the middle of
// the lowest storey (door), sides stand on the ground beside the body (left, right).
// - floor: a row under the body (overhang 1: one wider each side). storey: a beam row on top of three wall rows; repeats.
// - beam: a row laid once above the storeys (a railed balcony, overhang 1). roof: gable, spire, or a one-row row part.
// - top: fixed, centred on the span below; the span above it is its own width.
// - chimney: fixed, one wide, standing on the latest roof's right slope.
// - door: fixed, one wide and two tall, door-top over door. decor: fixed, one wide, one or two tall, in the decor grid.
// - side: fixed, on the ground beside the body. span, anchor: a rope bridge's deck (rope row over board row), its posts.
export type Role = "floor" | "storey" | "beam" | "roof" | "top" | "chimney" | "door" | "decor" | "side" | "span" | "anchor";
export type Part = {
	id: string; // unique: lower-case words joined by "-", such as "storey-brick"
	name: string; // plain words for the model, 1 to 30 characters: "brick wall"
	group: PartGroup;
	role: Role;
	material: Material | null; // null: fits any material
	fit: Fit;
	map: readonly string[];
	legend: Legend;
	overhang?: number; // row parts: this many cells wider than the span on each side
};

export const SEED_KINDS = [
	"cottage", "tower", "lantern-walk", "garden", "well", "rope-bridge", "windmill", "bell-tower", "greenhouse", "market-stall",
	"shrine", "pond", "watchtower", "stone-stair", "arch-gate", "statue", "lighthouse", "workshop-shed", "belvedere", "orchard",
] as const;
export type SeedKind = (typeof SEED_KINDS)[number];
export type SiteNeed = "level" | "cliff" | "beside" | "bridge";
export type Tier = { slot: string; role: Role; parts: readonly string[]; count?: readonly [min: number, max: number]; optional?: boolean };
export type Recipe = {
	id: string; // a seed kind, or "castle:<room>"
	name: string; // plain words, 1 to 60 characters
	kind: SeedKind | "castle";
	size: Size;
	site: SiteNeed;
	width: readonly [min: number, max: number]; // the body's width; only odd widths in this range are chosen
	materials: readonly Material[];
	tiers: readonly Tier[]; // bottom to top
	doors: readonly string[]; // door parts; empty for a build with no door
	decor: { parts: readonly string[]; max: number };
	sides: { parts: readonly string[]; max: number };
	fixed?: { footprint: Footprint; x: number; y: number }; // the castle's rooms: today's blueprint, at its place
};
export type Variation = {
	width: number;
	material: Material;
	tiers: Readonly<Record<string, { part: string; count: number } | null>>; // by tier slot; null: an optional tier left out
	door: string | null;
	decor: readonly { part: string; spot: number }[];
	sides: readonly { part: string; at: "left" | "right" }[];
};
// What a build compiles to: a blueprint's map, decor and legend (decor is [] or the map's size).
export type Footprint = { map: readonly string[]; decor: readonly string[]; legend: Legend };
// Where a build goes. ground: a level run of island top from column x, w wide, its top row `ground` (the build's bottom
// row goes on ground - 1); cliff says which end of the island the run touches, if one. bridge: between two islands, a
// the west island's last top cell and b the east island's first (column, top row).
export type Site =
	| { kind: "ground"; island: number; x: number; w: number; ground: number; cliff: "left" | "right" | null }
	| { kind: "bridge"; from: number; to: number; a: { x: number; y: number }; b: { x: number; y: number } };
// A compiled build: its footprint, the world tile of its top-left, its size and its block count (cellsOf's length).
export type Compiled = { recipe: string; footprint: Footprint; x: number; y: number; w: number; h: number; total: number };
export type RuleName = "mid-air" | "door" | "decor" | "site" | "overlap" | "tall" | "bounds";
export type Problem = { rule: RuleName; x: number; y: number };
// What the rules see of the world: its size, land (island rock and snow at or under its top row, never scenery), and the
// cells other builds' footprints cover.
export type RuleWorld = { w: number; h: number; land(x: number, y: number): boolean; taken(x: number, y: number): boolean };
export const MAX_TALL = 24;
export const BRIDGE_REACH = 60; // the most columns of sky a rope bridge crosses
export const BRIDGE_DROP = 16; // the most rows its two ends may differ

// The functions the planner is given (T8 tests with fakes; I1 passes T6's).
export type CompileFn = (recipe: Recipe, v: Variation, site: Site, parts: readonly Part[]) => Compiled;
export type ChooseFn = (recipe: Recipe, parts: readonly Part[], seed: number) => Variation;
export type VaryFn = (v: Variation, recipe: Recipe, parts: readonly Part[], seed: number) => Variation;
export type CheckFn = (c: Compiled, recipe: Recipe, site: Site, world: RuleWorld) => Problem[];

// The saved row (section 6.2). params: the variation as saved (unknown when read back).
export type BuildRow = {
	id: string;
	recipe: string;
	params: unknown;
	island: number;
	x: number;
	y: number;
	footprint: Footprint;
	total: number;
	laid: number;
	reason: string | null;
	started_at: string;
	finished_at: string | null;
};
// A row to insert: the table sets the id; started_at defaults to now and finished_at to null unless given (the castle's carry gives them).
export type NewBuild = Omit<BuildRow, "id" | "started_at" | "finished_at"> & { started_at?: string; finished_at?: string | null };
// One build as the world builds it (state.ts): its saved footprint's blocks in laying order and how far it is.
export type BuildProgress = {
	key: string; // the row's id; "castle:<room>" for a castle room whose row is not saved yet
	id: string | null;
	recipe: string;
	island: number;
	x: number;
	y: number;
	footprint: Footprint;
	blocks: readonly Block[]; // cellsOf(footprint, x, y, recipe)
	total: number; // blocks.length
	laid: number;
	saved: number; // what the table holds, as far as this page knows
	startedAt: string;
	finishedAt: string | null;
	reason: string | null;
	params: unknown;
};
// castle: the castle's open rooms in building order (started rooms oldest first, then spec order).
export type Builds = { castle: readonly CastleRoom[]; list: readonly BuildProgress[] };
export type BuildNews = { key: string; recipe: string; event: "started" | "finished" };

// What the planner offers (section 4.8).
export type Why = "leaned" | "mood" | "fresh";
export type MoodKind = "low" | "bright" | "tired" | "curious" | "missing" | "calm";
export type Candidate = {
	recipe: Recipe;
	variation: Variation;
	site: Site;
	compiled: Compiled;
	why: Why;
	fresh: boolean; // the recipe or one of its parts is new to him
	score: number; // the weight code's pick uses (above 0)
	place: string; // where, in words, at most 80 characters: "on the east island, by the cliff"
	size: Size;
	partNames: readonly string[]; // up to five plain part names
};
