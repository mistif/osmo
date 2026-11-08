// His taste (spec 4.4): weights from his finished builds, nothing stored apart from the builds themselves.
import { roomOfRecipe } from "../build/castle-sites";
import type { BuildRow, Variation } from "../build/types";
import { partsOf } from "../build/util";

export const NOVELTY = 0.75;
// A recipe among his last REPEAT_WINDOW free builds is weighed at REPEAT, so he does not repeat himself (spec 4.4).
export const REPEAT_WINDOW = 3;
export const REPEAT = 0.2;
// Each use adds weight, less each time (1, 2, 3, 4 at 1, 3, 7, 15 uses), so the recipe he leans toward cannot outgrow
// the variety bonus and every other candidate as his builds pile up.
export const lean = (uses: number): number => Math.log2(1 + Math.max(0, uses));
export type Taste = {
	recipes: Readonly<Record<string, number>>;
	parts: Readonly<Record<string, number>>;
	materials: Readonly<Record<string, number>>;
	recent: ReadonlySet<string>;
	used: ReadonlySet<string>; // every part and recipe of every free build, finished or not
	last: readonly string[]; // the recipes of his last REPEAT_WINDOW free builds by start, finished or not, oldest first
};
export function asVariation(x: unknown): Variation | null {
	if (typeof x !== "object" || x === null) return null;
	const o = x as Record<string, unknown>;
	const ok =
		typeof o.width === "number" && typeof o.material === "string" && typeof o.tiers === "object" && o.tiers !== null &&
		(o.door === null || typeof o.door === "string") && Array.isArray(o.decor) && Array.isArray(o.sides);
	return ok ? (x as Variation) : null;
}
const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);
export function tasteOf(rows: readonly BuildRow[]): Taste {
	const free = rows.filter((r) => roomOfRecipe(r.recipe) === null);
	const done = free.filter((r) => r.finished_at !== null).sort((a, b) => time(a.finished_at) - time(b.finished_at));
	const recipes: Record<string, number> = {};
	const parts: Record<string, number> = {};
	const materials: Record<string, number> = {};
	for (const r of done) {
		recipes[r.recipe] = (recipes[r.recipe] ?? 0) + 1;
		const v = asVariation(r.params);
		if (!v) continue;
		for (const p of partsOf(v)) parts[p] = (parts[p] ?? 0) + 1;
		materials[v.material] = (materials[v.material] ?? 0) + 1;
	}
	const recent = new Set(done.slice(-5).flatMap((r) => {
		const v = asVariation(r.params);
		return v ? partsOf(v) : [];
	}));
	const used = new Set(free.flatMap((r) => {
		const v = asVariation(r.params);
		return [r.recipe, ...(v ? partsOf(v) : [])];
	}));
	const last = [...free].sort((a, b) => time(a.started_at) - time(b.started_at)).slice(-REPEAT_WINDOW).map((r) => r.recipe);
	return { recipes, parts, materials, recent, used, last };
}
export function scoreOf(recipeId: string, v: Variation, t: Taste): number {
	const ps = partsOf(v);
	const score = 1 + 2 * lean(t.recipes[recipeId] ?? 0) + 0.5 * ps.reduce((s, p) => s + lean(t.parts[p] ?? 0), 0) + 0.5 * lean(t.materials[v.material] ?? 0) + NOVELTY * ps.filter((p) => !t.recent.has(p)).length;
	return t.last.includes(recipeId) ? REPEAT * score : score;
}
export const isFresh = (recipeId: string, v: Variation, t: Taste): boolean => !t.used.has(recipeId) || partsOf(v).some((p) => !t.used.has(p));
