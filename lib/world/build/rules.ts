// The rules every build passes (spec section 4.3). Task 0 stub; T6 builds it.
import { cellsOf } from "../blueprints";
import type { Block, Layer } from "../blueprints/types";
import { surfaceAt } from "../map/lookup";
import { BIG_H, BIG_W, type Deck, type Rect, type WorldMap } from "../map/types";
import { MAX_TALL, type Compiled, type Problem, type Recipe, type RuleWorld, type Site } from "./types";

const hanging = (l: Layer) => l === "lanterns" || l === "banners";
const key = (x: number, y: number) => `${x},${y}`;

// Everything wrong with a compiled build on its site: [] when it passes every rule.
export function checkBuild(c: Compiled, recipe: Recipe, site: Site, world: RuleWorld): Problem[] {
	const out: Problem[] = [];
	const blocks = cellsOf(c.footprint, c.x, c.y, c.recipe);
	const solid = blocks.filter((b) => !hanging(b.layer));
	const cells = new Map<string, Block>(solid.map((b) => [key(b.x, b.y), b]));
	for (const b of blocks) if (b.x < 0 || b.x >= world.w || b.y < 0 || b.y >= world.h) out.push({ rule: "bounds", x: b.x, y: b.y });
	if (c.h > MAX_TALL) out.push({ rule: "tall", x: c.x, y: c.y });
	// Mid-air (spec 4.3): every block held, through the build's own blocks, by one standing on land. A held block holds
	// the block above it and the blocks beside it; only a bridge's blocks may also hang from the block above (its deck
	// sags between its two anchors).
	const standing = solid.filter((b) => world.land(b.x, b.y + 1));
	const held = new Set(standing.map((b) => key(b.x, b.y)));
	const queue = [...held];
	const hangs = recipe.site === "bridge";
	while (queue.length > 0) {
		const [x, y] = (queue.pop() as string).split(",").map(Number);
		const next = hangs ? [[x + 1, y], [x - 1, y], [x, y - 1], [x, y + 1]] : [[x + 1, y], [x - 1, y], [x, y - 1]];
		for (const [nx, ny] of next) {
			const k = key(nx, ny);
			if (cells.has(k) && !held.has(k)) {
				held.add(k);
				queue.push(k);
			}
		}
	}
	for (const b of solid) if (!held.has(key(b.x, b.y))) out.push({ rule: "mid-air", x: b.x, y: b.y });
	if (site.kind === "bridge") {
		for (const end of [site.a, site.b]) if (!standing.some((b) => b.x === end.x)) out.push({ rule: "mid-air", x: end.x, y: end.y - 1 });
	}
	const doors = blocks.filter((b) => b.tile === "door");
	if (doors.length > 1 || (recipe.doors.length > 0 && doors.length !== 1)) out.push({ rule: "door", x: c.x, y: c.y });
	for (const d of doors) if (cells.get(key(d.x, d.y + 1))?.layer !== "floor") out.push({ rule: "door", x: d.x, y: d.y });
	for (const b of blocks) {
		if (!hanging(b.layer)) continue;
		const wall = cells.get(key(b.x, b.y));
		if (!wall || (wall.layer !== "walls" && wall.layer !== "backwall")) out.push({ rule: "decor", x: b.x, y: b.y });
	}
	// A dug build (a pond's basin) takes the land of its dug rows, from the site's top row down, and only that: each of
	// those cells must be land (it is dug into the island, never into the sky beside it).
	const dug = (b: Block) => site.kind === "ground" && b.y >= site.ground && b.y < site.ground + (c.dug ?? 0);
	if (site.kind === "ground") {
		if (c.x < site.x || c.x + c.w > site.x + site.w) out.push({ rule: "site", x: c.x, y: c.y });
		const bottom = c.y + c.h - 1;
		for (const b of solid) if (b.y === bottom && !world.land(b.x, b.y + 1)) out.push({ rule: "site", x: b.x, y: b.y });
		for (const b of blocks) if (dug(b) && !world.land(b.x, b.y)) out.push({ rule: "site", x: b.x, y: b.y });
	} else {
		for (const end of [site.a, site.b]) if (!world.land(end.x, end.y)) out.push({ rule: "site", x: end.x, y: end.y });
	}
	for (const b of blocks) if ((world.land(b.x, b.y) && !dug(b)) || world.taken(b.x, b.y)) out.push({ rule: "overlap", x: b.x, y: b.y });
	return out;
}

// The rules' view of a world: land from the map's ground at or under each island's top row, and each deck's standing
// cells (the balloon dock, DOCK_DECK, in builds mode: a bridge east of home stands on its far board); taken from the rects.
export function ruleWorldOf(map: WorldMap, taken: readonly Rect[], decks: readonly Deck[] = []): RuleWorld {
	const land = new Set<string>();
	for (const b of map.ground) {
		const top = surfaceAt(map, b.x);
		if (top !== null && b.y >= top) land.add(key(b.x, b.y));
	}
	for (const d of decks) d.rows.forEach((row, i) => land.add(key(d.x0 + i, row)));
	return {
		w: BIG_W,
		h: BIG_H,
		land: (x, y) => land.has(key(x, y)),
		taken: (x, y) => taken.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h),
	};
}
