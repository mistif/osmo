// Choosing a build's variation (spec section 4.2), seeded. Task 0 stub; T6 builds it.
import type { Material, Part, Recipe, Variation } from "./types";
import { hash01, pickIndex } from "./util";

const oddWidths = (r: Recipe): number[] => {
	const out: number[] = [];
	for (let w = r.width[0]; w <= r.width[1]; w++) if (w % 2 === 1) out.push(w);
	return out.length > 0 ? out : [r.width[0]];
};
const fitting = (parts: readonly Part[], ids: readonly string[], m: Material) =>
	ids.filter((id) => {
		const p = parts.find((x) => x.id === id);
		return p !== undefined && (p.material === null || p.material === m);
	});

// Every choice for one build of a recipe, from a seed: the same seed always gives the same variation.
export function chooseVariation(recipe: Recipe, parts: readonly Part[], seed: number): Variation {
	const widths = oddWidths(recipe);
	const width = widths[pickIndex(seed, 0, widths.length)];
	const material = recipe.materials[pickIndex(seed, 1, recipe.materials.length)];
	const tiers: Record<string, { part: string; count: number } | null> = {};
	recipe.tiers.forEach((t, i) => {
		const ok = fitting(parts, t.parts, material);
		if (ok.length === 0) {
			if (t.optional) {
				tiers[t.slot] = null;
				return;
			}
			throw new Error(`${recipe.id}: no ${t.slot} part in ${material}`);
		}
		if (t.optional && hash01(seed, 10 + i) >= 0.6) {
			tiers[t.slot] = null;
			return;
		}
		const [lo, hi] = t.count ?? [1, 1];
		tiers[t.slot] = { part: ok[pickIndex(seed, 20 + i, ok.length)], count: lo + pickIndex(seed, 30 + i, hi - lo + 1) };
	});
	const doors = fitting(parts, recipe.doors, material);
	const door = doors.length > 0 ? doors[pickIndex(seed, 2, doors.length)] : null;
	const dp = fitting(parts, recipe.decor.parts, material);
	const nd = dp.length === 0 ? 0 : pickIndex(seed, 40, recipe.decor.max + 1);
	const decor = Array.from({ length: nd }, (_, j) => ({ part: dp[pickIndex(seed, 50 + j, dp.length)], spot: pickIndex(seed, 60 + j, 64) }));
	const sp = fitting(parts, recipe.sides.parts, material);
	const ns = sp.length === 0 ? 0 : pickIndex(seed, 70, recipe.sides.max + 1);
	const sides = Array.from({ length: ns }, (_, j) => ({ part: sp[pickIndex(seed, 80 + j, sp.length)], at: hash01(seed, 90 + j) < 0.5 ? ("left" as const) : ("right" as const) }));
	return { width, material, tiers, door, decor, sides };
}

// A variation of one of his own builds: the same recipe with exactly one choice changed (spec 4.2, "his own recipes").
export function vary(v: Variation, recipe: Recipe, parts: readonly Part[], seed: number): Variation {
	const changes: (() => Variation | null)[] = [
		() => {
			const others = oddWidths(recipe).filter((w) => w !== v.width);
			return others.length > 0 ? { ...v, width: others[pickIndex(seed, 1, others.length)] } : null;
		},
		() => {
			const swappable = recipe.tiers.filter((t) => v.tiers[t.slot] && fitting(parts, t.parts, v.material).length > 1);
			if (swappable.length === 0) return null;
			const t = swappable[pickIndex(seed, 2, swappable.length)];
			const now = v.tiers[t.slot];
			if (!now) return null;
			const others = fitting(parts, t.parts, v.material).filter((id) => id !== now.part);
			return { ...v, tiers: { ...v.tiers, [t.slot]: { ...now, part: others[pickIndex(seed, 3, others.length)] } } };
		},
		() => {
			const dp = fitting(parts, recipe.decor.parts, v.material);
			return v.decor.length < recipe.decor.max && dp.length > 0 ? { ...v, decor: [...v.decor, { part: dp[pickIndex(seed, 4, dp.length)], spot: pickIndex(seed, 5, 64) }] } : null;
		},
		() => (v.decor.length > 0 ? { ...v, decor: v.decor.slice(0, -1) } : null),
		() => {
			const sp = fitting(parts, recipe.sides.parts, v.material);
			return v.sides.length < recipe.sides.max && sp.length > 0 ? { ...v, sides: [...v.sides, { part: sp[pickIndex(seed, 6, sp.length)], at: hash01(seed, 7) < 0.5 ? ("left" as const) : ("right" as const) }] } : null;
		},
		() => (v.sides.length > 0 ? { ...v, sides: v.sides.slice(0, -1) } : null),
		() => {
			const optional = recipe.tiers.filter((t) => t.optional && fitting(parts, t.parts, v.material).length > 0);
			if (optional.length === 0) return null;
			const t = optional[pickIndex(seed, 8, optional.length)];
			const ok = fitting(parts, t.parts, v.material);
			return { ...v, tiers: { ...v.tiers, [t.slot]: v.tiers[t.slot] ? null : { part: ok[0], count: 1 } } };
		},
	];
	const start = pickIndex(seed, 0, changes.length);
	for (let k = 0; k < changes.length; k++) {
		const out = changes[(start + k) % changes.length]();
		if (out) return out;
	}
	return v;
}
