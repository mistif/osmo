// The compiler (spec section 4.2): a recipe, its variation and a site to a footprint and its place. Task 0 stub; T6 builds it.
import type { Layer } from "../blueprints/types";
import { cellsOf } from "../blueprints";
import type { TileId } from "../tiles";
import type { Compiled, Footprint, Part, Recipe, Role, Site, Variation } from "./types";
import { roofRows, rowsAt } from "./util";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// A right slope with a chimney standing in it.
const CHIMNEY_FOOT: Partial<Record<TileId, TileId>> = { "roof-right": "chimney-base", "thatch-r": "chimney-base-thatch" };
type Cell = { tile: TileId; layer: Layer };
const at = (x: number, y: number) => `${x},${y}`;
const xy = (k: string) => k.split(",").map(Number) as [number, number];

// Two grids of cells (local: row 0 is the floor row, up is negative) to a footprint, letters in first-seen order.
function footprintOf(map: Map<string, Cell>, decor: Map<string, Cell>, name: string): { footprint: Footprint; x0: number; y0: number; w: number; h: number } {
	const keys = [...map.keys(), ...decor.keys()].map(xy);
	if (keys.length === 0) throw new Error(`${name}: nothing to build`);
	const x0 = Math.min(...keys.map(([x]) => x));
	const y0 = Math.min(...keys.map(([, y]) => y));
	const w = Math.max(...keys.map(([x]) => x)) - x0 + 1;
	const h = Math.max(...keys.map(([, y]) => y)) - y0 + 1;
	const letters = new Map<string, string>();
	const legend: Record<string, Cell> = {};
	const letterOf = (c: Cell) => {
		const k = `${c.tile}|${c.layer}`;
		let l = letters.get(k);
		if (l === undefined) {
			if (letters.size >= ALPHABET.length) throw new Error(`${name}: more than ${ALPHABET.length} kinds of block`);
			l = ALPHABET[letters.size];
			letters.set(k, l);
			legend[l] = { tile: c.tile, layer: c.layer };
		}
		return l;
	};
	const grid = (cells: Map<string, Cell>) =>
		Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, q) => {
			const c = cells.get(at(x0 + q, y0 + r));
			return c ? letterOf(c) : ".";
		}).join(""));
	const mapRows = grid(map);
	const decorRows = decor.size > 0 ? grid(decor) : [];
	return { footprint: { map: mapRows, decor: decorRows, legend }, x0, y0, w, h };
}

const finish = (name: string, footprint: Footprint, x: number, y: number, w: number, h: number): Compiled => ({
	recipe: name, footprint, x, y, w, h, total: cellsOf(footprint, x, y, name).length,
});

// Throws when the variation names a part that is not in `parts` or not fit for its tier, or leaves a required tier out.
export function compile(recipe: Recipe, v: Variation, site: Site, parts: readonly Part[]): Compiled {
	if (recipe.fixed) {
		const { footprint, x, y } = recipe.fixed;
		return finish(recipe.id, footprint, x, y, footprint.map[0]?.length ?? 0, footprint.map.length);
	}
	const byId = new Map(parts.map((p) => [p.id, p]));
	const part = (id: string, role: Role): Part => {
		const p = byId.get(id);
		if (!p) throw new Error(`${recipe.id}: no part "${id}"`);
		if (p.role !== role) throw new Error(`${recipe.id}: "${id}" is a ${p.role}, not a ${role}`);
		return p;
	};
	const map = new Map<string, Cell>();
	const decor = new Map<string, Cell>();
	// A piece's rows, its bottom row on row `bottom`, its left column on x0.
	const lay = (into: Map<string, Cell>, p: Part, rows: readonly string[], x0: number, bottom: number) => {
		rows.forEach((row, r) => {
			const y = bottom - (rows.length - 1 - r);
			[...row].forEach((ch, c) => {
				if (ch === ".") return;
				const e = p.legend[ch];
				if (!e) throw new Error(`${p.id}: no legend entry for "${ch}"`);
				into.set(at(x0 + c, y), { tile: e.tile, layer: e.layer });
			});
		});
	};

	if (recipe.site === "bridge") {
		if (site.kind !== "bridge") throw new Error(`${recipe.id} needs a bridge site`);
		const span = part(v.tiers.span?.part ?? "", "span");
		const anchor = part(v.tiers.anchor?.part ?? "", "anchor");
		const { a, b } = site;
		if (b.x - a.x < 2) throw new Error(`${recipe.id}: the two ends are too close`);
		lay(map, anchor, anchor.map, a.x, a.y - 1);
		lay(map, anchor, anchor.map, b.x, b.y - 1);
		// One board a column on a sagging curve, level with the island's top at each end (he steps on and off without a
		// step), never more than a row from the board before it, with its rope in the cell over it as a handrail at his
		// waist. A board a row lower hangs from its rope, which sits beside the board before it; one a row higher stands
		// beside the rope before it (bridges may hang from above, rules.ts).
		const rope = span.map[0][1];
		const board = span.map[1][1];
		const n = b.x - a.x - 1;
		const sag = Math.min(3, Math.max(1, Math.round(n / 12)));
		let prev = a.y;
		for (let x = a.x + 1; x < b.x; x++) {
			const t = (x - a.x) / (b.x - a.x);
			const left = b.x - 1 - x; // columns after this one: the last board is level with the far end
			const want = Math.round(a.y + (b.y - a.y) * t + sag * 4 * t * (1 - t));
			const row = Math.min(b.y + left, Math.max(b.y - left, Math.min(prev + 1, Math.max(prev - 1, want))));
			lay(map, span, [board], x, row);
			lay(map, span, [rope], x, row - 1);
			prev = row;
		}
		const f = footprintOf(map, decor, recipe.id);
		return finish(recipe.id, f.footprint, f.x0, f.y0, f.w, f.h);
	}

	if (site.kind !== "ground") throw new Error(`${recipe.id} needs a ground site`);
	let bottom = 0;
	let span = { x: 0, w: v.width };
	const storeys: { x: number; w: number; top: number; bottom: number }[] = [];
	const roofTop = new Map<number, number>();
	let roofSpan: { x: number; w: number } | null = null;
	for (const tier of recipe.tiers) {
		const choice = v.tiers[tier.slot];
		if (!choice) {
			if (tier.optional) continue;
			throw new Error(`${recipe.id}: the ${tier.slot} tier is required`);
		}
		const p = part(choice.part, tier.role);
		if (tier.role === "chimney") {
			if (!roofSpan) throw new Error(`${recipe.id}: a chimney needs a roof under it`);
			const cx = roofSpan.x + roofSpan.w - 1 - Math.floor(roofSpan.w / 4);
			const top = roofTop.get(cx);
			if (top === undefined) throw new Error(`${recipe.id}: no roof under the chimney`);
			// The slope cell under it becomes the chimney's foot (the stack down to the slope, the roof below it), so it
			// stands in the roof, not on the slope's corner with sky under it.
			const slope = map.get(at(cx, top));
			const foot = slope ? CHIMNEY_FOOT[slope.tile] : undefined;
			if (slope && foot) map.set(at(cx, top), { tile: foot, layer: slope.layer });
			lay(map, p, p.map, cx, top - 1);
			continue;
		}
		for (let k = 0; k < Math.max(1, choice.count); k++) {
			let rows: string[];
			let x: number;
			if (p.fit === "row") {
				const o = p.overhang ?? 0;
				rows = rowsAt(p.map, span.w + 2 * o);
				x = span.x - o;
			} else if (p.fit === "gable" || p.fit === "spire") {
				rows = roofRows(p.map[0], span.w, p.fit);
				x = span.x;
			} else {
				rows = [...p.map];
				x = span.x + Math.floor((span.w - rows[0].length) / 2);
			}
			lay(map, p, rows, x, bottom);
			const top = bottom - rows.length + 1;
			if (tier.role === "storey") storeys.push({ x, w: rows[0].length, top, bottom });
			if (tier.role === "roof") {
				roofSpan = { x, w: rows[0].length };
				rows.forEach((row, r) => [...row].forEach((ch, c) => {
					if (ch === ".") return;
					const y = top + r;
					const was = roofTop.get(x + c);
					if (was === undefined || y < was) roofTop.set(x + c, y);
				}));
			}
			bottom = top - 1;
			if (p.fit === "fixed") span = { x, w: rows[0].length };
			else if (p.fit === "gable" || p.fit === "spire") span = { x: x + Math.floor(rows[0].length / 2), w: 1 };
		}
	}
	let doorX: number | null = null;
	if (recipe.doors.length > 0) {
		if (!v.door) throw new Error(`${recipe.id}: a door is required`);
		const d = part(v.door, "door");
		const s = storeys[0];
		if (!s) throw new Error(`${recipe.id}: a door needs a storey`);
		doorX = s.x + Math.floor(s.w / 2);
		const wall = map.get(at(doorX, s.bottom));
		lay(map, d, d.map, doorX, s.bottom);
		for (let y = s.top; y < s.bottom - (d.map.length - 1); y++) {
			const c = map.get(at(doorX, y));
			if (c && c.layer === "windows" && wall) map.set(at(doorX, y), wall);
		}
	}
	const wallAt = (x: number, y: number) => {
		const c = map.get(at(x, y));
		return c !== undefined && (c.layer === "walls" || c.layer === "backwall") && c.tile !== "statue-back"; // nothing hangs on the shrine's figure
	};
	const centre = doorX ?? (storeys[0] ? storeys[0].x + Math.floor(storeys[0].w / 2) : 0);
	// Decor hangs on a storey's wall rows (not the beam row over a storey of four), inside its corner posts; on a storey
	// with no wall inside its posts (gate posts), on the posts themselves.
	const spots: { x: number; y: number }[] = [];
	for (const s of storeys) {
		const top = s.bottom - s.top + 1 === 4 ? s.top + 1 : s.top;
		const inner = (x: number) => x > s.x && x < s.x + s.w - 1;
		const walls = (keep: (x: number) => boolean) => {
			const out: { x: number; y: number }[] = [];
			for (let y = s.bottom; y >= top; y--) {
				const row: { x: number; y: number }[] = [];
				for (let x = s.x; x < s.x + s.w; x++) if (keep(x) && x !== doorX && wallAt(x, y)) row.push({ x, y });
				row.sort((p, q) => Math.abs(p.x - centre) - Math.abs(q.x - centre) || p.x - q.x);
				out.push(...row);
			}
			return out;
		};
		const mine = walls(inner);
		spots.push(...(mine.length > 0 ? mine : walls(() => true)));
	}
	const hangable = new Set(spots.map((s) => at(s.x, s.y))); // every cell of a decor part must be one of these
	// A shutter hangs only beside a window, along its whole height.
	const besideWindow = (x: number, y: number, h: number) =>
		[-1, 1].some((dx) => Array.from({ length: h }, (_, k) => map.get(at(x + dx, y + k))?.layer === "windows").every(Boolean));
	for (const d of v.decor) {
		const p = part(d.part, "decor");
		const shutter = Object.values(p.legend).some((e) => e.tile === "shutter");
		const free = spots.filter((s) => p.map.every((_, k) => hangable.has(at(s.x, s.y + k)) && !decor.has(at(s.x, s.y + k))) && (!shutter || besideWindow(s.x, s.y, p.map.length)));
		if (free.length === 0) continue;
		const s = free[((d.spot % free.length) + free.length) % free.length];
		lay(decor, p, p.map, s.x, s.y + p.map.length - 1);
	}
	const xs = [...map.keys()].map((k) => xy(k)[0]);
	let left = Math.min(...xs);
	let right = Math.max(...xs);
	for (const s of v.sides) {
		const p = part(s.part, "side");
		const w = p.map[0].length;
		const x = s.at === "left" ? left - 1 - w : right + 2;
		lay(map, p, p.map, x, 0);
		if (s.at === "left") left = x;
		else right = x + w - 1;
	}
	const f = footprintOf(map, decor, recipe.id);
	const x = site.cliff === "left" ? site.x : site.cliff === "right" ? site.x + site.w - f.w : site.x + Math.floor((site.w - f.w) / 2);
	return finish(recipe.id, f.footprint, x, site.ground - f.h, f.w, f.h);
}
