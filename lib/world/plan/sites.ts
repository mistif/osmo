// Where he may build (spec 4.8): free level runs of island top, cliff ends, the ground beside a house, and the gaps
// between facing islands for a rope bridge; ordered from his island and his last build outward.
import { roomOfRecipe } from "../build/castle-sites";
import { BRIDGE_DROP, BRIDGE_REACH, type BuildRow, type Recipe, type Site, type SiteNeed } from "../build/types";
import { bridgeEnd } from "../map/home";
import { islandById } from "../map/lookup";
import type { Island, Rect, WorldMap } from "../map/types";

export type Run = { island: number; x: number; w: number; ground: number };
const MAX_SITES = 8;
const MAX_PLACE = 80;
const HOUSES = ["cottage", "workshop-shed", "greenhouse", "tower", "windmill", "bell-tower"];
const NEAR_HOUSE = 2; // a beside site starts or ends within this many columns of a house
const FAR_WORDS = ["", "far ", "outer ", "farthest "];
export const rectOf = (r: BuildRow): Rect => ({ x: r.x, y: r.y, w: r.footprint.map[0]?.length ?? 0, h: r.footprint.map.length });
// Open ground kept on each side of a build (the look pass: builds one column apart line up like a street). Sites are
// found around each taken rect widened by it, and an island's built share counts it (engine/big.ts rise), so the
// columns kept open never hold an island back from rising.
export const SPACE = 2;
export const spaced = (r: Rect): Rect => ({ ...r, x: r.x - SPACE, w: r.w + 2 * SPACE });
const centre = (i: Island) => (i.x0 + i.x1) / 2;
const topAt = (i: Island, x: number) => i.top[x - i.x0] ?? i.ground;

// Each island's top columns from x0 + 1 to x1 - 2 that no rect covers, split where the top row changes, at least 3 wide.
export function freeRuns(map: WorldMap, taken: readonly Rect[]): Run[] {
	const out: Run[] = [];
	for (const i of map.islands) {
		let start = -1;
		for (let x = i.x0 + 1; x <= i.x1 - 1; x++) {
			const ok = x < i.x1 - 1 && !taken.some((r) => x >= r.x && x < r.x + r.w);
			const same = start >= 0 && ok && topAt(i, x) === topAt(i, start);
			if (start >= 0 && !same) {
				if (x - start >= 3) out.push({ island: i.id, x: start, w: x - start, ground: topAt(i, start) });
				start = -1;
			}
			if (ok && start < 0) start = x;
		}
	}
	return out;
}

const isFree = (r: BuildRow) => roomOfRecipe(r.recipe) === null;
// A finished house: a castle room, a cottage, a workshop shed, a greenhouse, a tower, a windmill or a bell tower.
const isHouse = (r: BuildRow) => r.finished_at !== null && (roomOfRecipe(r.recipe) !== null || HOUSES.includes(r.recipe));
// Free columns between a run and a house's rect on the same top row (0 when they touch), or null when not beside it.
function gapToHouse(run: Run, house: BuildRow): number | null {
	const rect = rectOf(house);
	if (rect.y + rect.h !== run.ground) return null;
	const after = run.x - (rect.x + rect.w); // the run starts this far past the house's right end
	const before = rect.x - (run.x + run.w); // the run ends this far short of the house's left end
	const gaps = [after, before].filter((g) => g >= 0 && g <= NEAR_HOUSE);
	return gaps.length > 0 ? Math.min(...gaps) : null;
}

type Ground = Extract<Site, { kind: "ground" }>;
const spanOf = (r: Rect) => ({ from: r.x, to: r.x + r.w - 1 });

export function sitesFor(recipe: Recipe, map: WorldMap, rows: readonly BuildRow[], near: { island: number; x: number }, taken: readonly Rect[]): Site[] {
	const mine = islandById(map, near.island);
	if (recipe.site === "bridge") return bridgeSites(map, rows, near.island).slice(0, MAX_SITES);
	// the point the nearest-first order measures from: the last free build on his island (its rect's centre), else him
	let last: BuildRow | null = null;
	for (const r of rows) {
		if (!isFree(r) || r.island !== near.island || r.recipe === "rope-bridge") continue;
		if (last === null || !(Date.parse(r.started_at) < Date.parse(last.started_at))) last = r;
	}
	const p = last ? rectOf(last).x + rectOf(last).w / 2 : near.x;
	const houses = rows.filter(isHouse);
	const entries: { site: Ground; key: [number, number, number, number] }[] = [];
	for (const run of freeRuns(map, taken.map(spaced))) {
		const island = islandById(map, run.island);
		if (!island) continue;
		const cliffs: (Ground["cliff"])[] = [];
		if (recipe.site === "level") cliffs.push(null);
		if (recipe.site === "cliff") {
			if (run.x === island.x0 + 1) cliffs.push("left");
			if (run.x + run.w - 1 === island.x1 - 2) cliffs.push("right");
		}
		if (recipe.site === "beside" && houses.some((h) => gapToHouse(run, h) !== null)) cliffs.push(null);
		for (const cliff of cliffs) {
			const here = run.island === near.island;
			const reach = here ? (p < run.x ? run.x - p : p > run.x + run.w ? p - (run.x + run.w) : 0) : mine ? Math.abs(centre(island) - centre(mine)) : Math.abs(centre(island) - near.x);
			entries.push({ site: { kind: "ground", island: run.island, x: run.x, w: run.w, ground: run.ground, cliff }, key: [here ? 0 : 1, reach, run.x, cliff === "right" ? 1 : 0] });
		}
	}
	entries.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.key[3] - b.key[3]);
	return entries.slice(0, MAX_SITES).map((e) => e.site);
}

// Each pair of neighbouring islands (none between them) a rope bridge can span and that has none yet, his island's first.
function bridgeSites(map: WorldMap, rows: readonly BuildRow[], hisIsland: number): Site[] {
	const sorted = [...map.islands].sort((a, b) => a.x0 - b.x0);
	const bridges = rows.filter((r) => isFree(r) && r.recipe === "rope-bridge").map((r) => spanOf(rectOf(r)));
	const out: { site: Site; here: number }[] = [];
	for (let k = 0; k + 1 < sorted.length; k++) {
		const west = sorted[k];
		const east = sorted[k + 1];
		const a = bridgeEnd(west, "east");
		const b = bridgeEnd(east, "west");
		if (b.x - a.x - 1 > BRIDGE_REACH || Math.abs(a.y - b.y) > BRIDGE_DROP) continue;
		if (bridges.some((s) => s.from <= a.x && s.to >= b.x)) continue;
		out.push({ site: { kind: "bridge", from: west.id, to: east.id, a, b }, here: west.id === hisIsland || east.id === hisIsland ? 0 : 1 });
	}
	return out.sort((x, y) => x.here - y.here).map((e) => e.site);
}

// An island in words, by side and rank from home: "the home island", "the east island", "the far west island".
function islandWords(map: WorldMap, id: number): string {
	const i = islandById(map, id);
	if (!i) return "an island";
	if (i.home) return "the home island";
	const home = map.islands.find((x) => x.home);
	const east = home ? centre(i) > centre(home) : true;
	const side = map.islands.filter((x) => !x.home && (home ? centre(x) > centre(home) : true) === east).sort((a, b) => (east ? a.x0 - b.x0 : b.x0 - a.x0));
	const rank = Math.min(side.findIndex((x) => x.id === id), FAR_WORDS.length - 1);
	return `the ${FAR_WORDS[Math.max(0, rank)]}${east ? "east" : "west"} island`;
}

// Where a site is, in words, at most 80 characters. A beside build (need "beside") names the nearest finished house.
export function placeWords(site: Site, map: WorldMap, rows: readonly BuildRow[], recipes: readonly Recipe[], need: SiteNeed = "level"): string {
	if (site.kind === "bridge") return `between ${islandWords(map, site.from)} and ${islandWords(map, site.to)}`.slice(0, MAX_PLACE);
	const on = `on ${islandWords(map, site.island)}`;
	if (site.cliff !== null) return `${on}, by the cliff`.slice(0, MAX_PLACE);
	if (need === "beside") {
		const run: Run = { island: site.island, x: site.x, w: site.w, ground: site.ground };
		const house = rows
			.filter(isHouse)
			.map((h) => ({ h, gap: gapToHouse(run, h) }))
			.filter((e): e is { h: BuildRow; gap: number } => e.gap !== null)
			.sort((a, b) => a.gap - b.gap)[0];
		if (house) return `${on}, beside the ${recipes.find((r) => r.id === house.h.recipe)?.name ?? "house"}`.slice(0, MAX_PLACE);
	}
	return on.slice(0, MAX_PLACE);
}
