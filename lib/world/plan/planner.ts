// The planner (spec sections 4.4, 4.8, 5.3, 5.4), pure: when a decision is due, three different candidates (one he leans
// toward, one for his mood, one new to him), code's seeded pick, and his line when no model writes it. It knows nothing
// of the real parts, recipes or compiler: they come in as data and as PlanDeps.
import type { Mood } from "../../agent/state";
import { roomOfRecipe } from "../build/castle-sites";
import type { BuildRow, Candidate, CheckFn, ChooseFn, CompileFn, Compiled, MoodKind, NewBuild, Part, Recipe, RuleWorld, SeedKind, Site, VaryFn, Variation, Why } from "../build/types";
import { hash01, partsOf, pickIndex, sizeOf } from "../build/util";
import type { Rect, WorldMap } from "../map/types";
import { WILL_LIMITS, type WillBody, type WillCandidate } from "../will/types";
import { MOOD_RECIPES } from "./mood";
import { placeWords, rectOf, sitesFor } from "./sites";
import { asVariation, isFresh, scoreOf, tasteOf } from "./taste";

export const QUIET_MS = 120_000; // the conversation quiet this long before he decides
export const MAX_A_DAY = 4;
export const MAX_ON_RETURN = 3;
export const AWAY_LONG_MS = 3 * 86_400_000; // "Gur away a long time"
const HALL_X = 477; // the hall's column: "near the hall" is near this
const REASON_MAX = 200;
export type PlanInput = {
	seed: number; // the world's seed
	n: number; // free builds so far, finished or not: this decision's number, so two tabs with the same rows choose the same
	map: WorldMap;
	rows: readonly BuildRow[]; // every build, the castle's included
	recipes: readonly Recipe[]; // the seed recipes; castle recipes are never offered
	parts: readonly Part[];
	mood: MoodKind;
	him: { island: number; x: number }; // the island he is on and his tile column
	blocked: readonly Rect[]; // room no free build may take: always CASTLE_RECTS (build/castle-sites.ts), the castle's six rooms, reserved whether they have a row or not
};
export type PlanDeps = { compile: CompileFn; check: CheckFn; choose: ChooseFn; vary: VaryFn; world: (taken: readonly Rect[]) => RuleWorld };

// A seeded key for one choice of one decision: the world's seed, the decision's number and which choice.
const mix = (seed: number, n: number, k: number) => (Math.imul(seed | 0, 31) + Math.imul(n + 1, 0x9e3779b1) + k) | 0;
type Option = { recipe: Recipe; v: Variation; score: number; fresh: boolean };
const distanceToHall = (s: Site) => Math.abs((s.kind === "ground" ? s.x + s.w / 2 : (s.a.x + s.b.x) / 2) - HALL_X);

// Three candidates of different recipes where the world allows (fewer only when nothing else fits): leaned, mood, fresh,
// each compiled and passing every rule on its site.
export function plan(input: PlanInput, deps: PlanDeps): Candidate[] {
	const taste = tasteOf(input.rows);
	const taken = [...input.rows.map(rectOf), ...input.blocked];
	const world = deps.world(taken);
	const seeds = input.recipes.filter((r) => r.kind !== "castle");
	const options: Option[] = [];
	seeds.forEach((recipe, i) => {
		try {
			const v = deps.choose(recipe, input.parts, mix(input.seed, input.n, i));
			options.push({ recipe, v, score: scoreOf(recipe.id, v, taste), fresh: isFresh(recipe.id, v, taste) });
		} catch {
			// a recipe with no part for its materials is never offered
		}
	});
	input.rows.filter((r) => r.finished_at !== null && roomOfRecipe(r.recipe) === null).forEach((r, j) => {
		const recipe = seeds.find((x) => x.id === r.recipe);
		const v = asVariation(r.params);
		if (!recipe || !v) return;
		try {
			const w = deps.vary(v, recipe, input.parts, mix(input.seed, input.n, 100 + j));
			options.push({ recipe, v: w, score: scoreOf(recipe.id, w, taste), fresh: isFresh(recipe.id, w, taste) });
		} catch {
			// his own recipe that cannot be varied is not offered again this time
		}
	});
	const byScore = [...options].sort((a, b) => b.score - a.score || seeds.indexOf(a.recipe) - seeds.indexOf(b.recipe));
	const chosen: Candidate[] = [];
	const unused = (o: Option) => !chosen.some((c) => c.recipe.id === o.recipe.id);
	const sitesOf = new Map<string, Site[]>();
	const sitesFrom = (recipe: Recipe): Site[] => {
		let sites = sitesOf.get(recipe.id);
		if (!sites) sitesOf.set(recipe.id, (sites = sitesFor(recipe, input.map, input.rows, input.him, taken)));
		return sites;
	};
	// The option on the first of its sites that compiles and passes every rule. order: which of its sites to try, in what
	// order (as sitesFor gives them, by default).
	const place = (o: Option, why: Why, order: (sites: Site[]) => Site[] = (s) => s): Candidate | null => {
		for (const site of order(sitesFrom(o.recipe))) {
			let compiled: Compiled;
			try {
				compiled = deps.compile(o.recipe, o.v, site, input.parts);
			} catch {
				continue;
			}
			if (deps.check(compiled, o.recipe, site, world).length > 0) continue;
			const names = partsOf(o.v).map((id) => input.parts.find((p) => p.id === id)?.name ?? id).slice(0, WILL_LIMITS.parts);
			return {
				recipe: o.recipe, variation: o.v, site, compiled, why, fresh: o.fresh, score: Math.max(0.1, o.score),
				place: placeWords(site, input.map, input.rows, input.recipes, o.recipe.site), size: sizeOf(compiled.total), partNames: names,
			};
		}
		return null;
	};
	const first = (list: readonly Option[], why: Why, order?: (sites: Site[]) => Site[]) => {
		for (const o of list) {
			if (!unused(o)) continue;
			const c = place(o, why, order);
			if (c) return c;
		}
		return null;
	};
	const leaned = first(byScore, "leaned");
	if (leaned) chosen.push(leaned);
	// missing: the placeable option whose site is nearest the hall (the better score on a tie); curious: a recipe or part
	// new to him, tried first on an island with no free build of his.
	const nearHall = (sites: Site[]) => [...sites].sort((a, b) => distanceToHall(a) - distanceToHall(b));
	const nearestHall = (): Candidate | null => {
		let best: Candidate | null = null;
		for (const o of byScore) {
			if (!unused(o)) continue;
			const c = place(o, "mood", nearHall);
			if (c && (best === null || distanceToHall(c.site) < distanceToHall(best.site))) best = c;
		}
		return best;
	};
	const newIsland = (sites: Site[]) => sites.filter((s) => s.kind === "ground" && !input.rows.some((r) => roomOfRecipe(r.recipe) === null && r.island === s.island));
	const freshFirst = [...byScore.filter((o) => o.fresh), ...byScore.filter((o) => !o.fresh)];
	const mood =
		(input.mood === "curious"
			? (first(freshFirst, "mood", newIsland) ?? first(freshFirst, "mood"))
			: input.mood === "missing"
				? nearestHall()
				: first(byScore.filter((o) => MOOD_RECIPES[input.mood].includes(o.recipe.kind as SeedKind)), "mood")) ?? first(byScore, "mood");
	if (mood) chosen.push(mood);
	// fresh: one new to him, which one by the seed; else the best of the recipes not yet chosen
	const freshList = byScore.filter((o) => o.fresh);
	const start = pickIndex(mix(input.seed, input.n, 500), 0, Math.max(1, freshList.length));
	const fresh = first([...freshList.slice(start), ...freshList.slice(0, start)], "fresh") ?? first(byScore, "fresh");
	if (fresh) chosen.push(fresh);
	return chosen;
}

// Code's pick (phase 2, and every fallback): a choice weighted by score, seeded by the world's seed and the decision's number.
export function pickByCode(cands: readonly Candidate[], seed: number, n: number): number {
	const weights = cands.map((c) => Math.max(0.1, c.score));
	const r = hash01(mix(seed, n, 999), 0) * weights.reduce((s, w) => s + w, 0);
	let run = 0;
	for (let i = 0; i < weights.length; i++) {
		run += weights[i];
		if (r < run) return i;
	}
	return Math.max(0, weights.length - 1);
}

// His line for a build when no model writes it: one fixed line per recipe kind, in his register (lines.ts).
export { fallbackLine } from "./lines";
export type MoodInput = { mood: Mood | null; now: number; awayMs: number; hour: number };
// The mood the mood candidate follows (section 5.3; mood.ts).
export { moodOf } from "./mood";
export type DueInput = { building: boolean; castleWaiting: boolean; budget: number; quietMs: number; decidedToday: number };
// A decision is due when no build is in progress, the castle waits for nothing, a block has accrued, the conversation
// has been quiet QUIET_MS and fewer than MAX_A_DAY decisions were made today.
export function decisionDue(s: DueInput): boolean {
	return !s.building && !s.castleWaiting && s.budget >= 1 && s.quietMs >= QUIET_MS && s.decidedToday < MAX_A_DAY;
}
// Free builds started on the same local calendar day as now.
export function decidedToday(rows: readonly BuildRow[], now: number): number {
	const day = (t: number) => {
		const d = new Date(t);
		return d.getFullYear() * 10_000 + d.getMonth() * 100 + d.getDate();
	};
	const today = day(now);
	return rows.filter((r) => roomOfRecipe(r.recipe) === null && day(Date.parse(r.started_at)) === today).length;
}
// How many missed decisions to make on return: at most MAX_ON_RETURN, never past MAX_A_DAY in the day.
export function returnDecisions(decidedToday: number): number {
	return Math.max(0, Math.min(MAX_ON_RETURN, MAX_A_DAY - decidedToday));
}
const cut = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max));
// The will's body for exactly three candidates (throws otherwise): their words, his mood in words, his last three free builds.
export function willBody(cands: readonly Candidate[], mood: string, rows: readonly BuildRow[], recipes: readonly Recipe[]): WillBody {
	if (cands.length !== 3) throw new Error(`the will is asked about exactly three candidates, not ${cands.length}`);
	const words = (c: Candidate): WillCandidate => ({
		name: cut(c.recipe.name, WILL_LIMITS.name),
		place: cut(c.place, WILL_LIMITS.place),
		size: c.size,
		parts: c.partNames.slice(0, WILL_LIMITS.parts).map((p) => cut(p, WILL_LIMITS.part)),
		fresh: c.fresh,
	});
	const time = (r: BuildRow) => Date.parse(r.finished_at ?? "");
	const recent = rows
		.filter((r) => r.finished_at !== null && roomOfRecipe(r.recipe) === null)
		.sort((a, b) => time(b) - time(a))
		.slice(0, WILL_LIMITS.recent)
		.map((r) => ({ name: cut(recipes.find((x) => x.id === r.recipe)?.name ?? r.recipe, WILL_LIMITS.name), reason: cut(r.reason ?? "", WILL_LIMITS.reason) }));
	return { candidates: [words(cands[0]), words(cands[1]), words(cands[2])], mood: cut(mood, WILL_LIMITS.mood), recent };
}
// The row to insert for the chosen candidate, with his line as its reason.
export function newRow(c: Candidate, reason: string): NewBuild {
	return {
		recipe: c.recipe.id,
		params: c.variation,
		island: c.site.kind === "ground" ? c.site.island : c.site.from,
		x: c.compiled.x,
		y: c.compiled.y,
		footprint: c.compiled.footprint,
		total: c.compiled.total,
		laid: 0,
		reason: cut(reason, REASON_MAX),
	};
}
