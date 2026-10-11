// The planner (spec sections 4.4, 4.8, 5.3, 5.4), pure: when a decision is due, three different candidates (one he leans
// toward, one for his mood, one new to him), code's seeded pick, and his line when no model writes it. Task 0 stub; T8 builds it.
import type { Mood } from "../../agent/state";
import type { BuildRow, Candidate, CheckFn, ChooseFn, CompileFn, MoodKind, NewBuild, Part, Recipe, RuleWorld, VaryFn } from "../build/types";
import type { Rect, WorldMap } from "../map/types";
import type { WillBody } from "../will/types";

export const QUIET_MS = 120_000; // the conversation quiet this long before he decides
export const MAX_A_DAY = 4;
export const MAX_ON_RETURN = 3;
export const AWAY_LONG_MS = 3 * 86_400_000; // "Gur away a long time"
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
// Three candidates of different recipes where the world allows (fewer only when nothing else fits): leaned, mood, fresh,
// each compiled and passing every rule on its site.
export function plan(input: PlanInput, deps: PlanDeps): Candidate[] {
	void [input, deps];
	throw new Error("not built: plan");
}
// Code's pick (phase 2, and every fallback): a choice weighted by score, seeded by the world's seed and the decision's number.
export function pickByCode(cands: readonly Candidate[], seed: number, n: number): number {
	void [cands, seed, n];
	throw new Error("not built: pickByCode");
}
// His line for a build when no model writes it: one fixed line per recipe kind, in his register.
export function fallbackLine(c: Candidate): string {
	void c;
	throw new Error("not built: fallbackLine");
}
export type MoodInput = { mood: Mood | null; now: number; awayMs: number; hour: number };
// The mood the mood candidate follows (section 5.3).
export function moodOf(input: MoodInput): MoodKind {
	void input;
	throw new Error("not built: moodOf");
}
export type DueInput = { building: boolean; castleWaiting: boolean; budget: number; quietMs: number; decidedToday: number };
// A decision is due when no build is in progress, the castle waits for nothing, a block has accrued, the conversation
// has been quiet QUIET_MS and fewer than MAX_A_DAY decisions were made today.
export function decisionDue(s: DueInput): boolean {
	void s;
	throw new Error("not built: decisionDue");
}
// Free builds started on the same local calendar day as now.
export function decidedToday(rows: readonly BuildRow[], now: number): number {
	void [rows, now];
	throw new Error("not built: decidedToday");
}
// How many missed decisions to make on return: at most MAX_ON_RETURN, never past MAX_A_DAY in the day.
export function returnDecisions(decidedToday: number): number {
	void decidedToday;
	throw new Error("not built: returnDecisions");
}
// The will's body for exactly three candidates (throws otherwise): their words, his mood in words, his last three free builds.
export function willBody(cands: readonly Candidate[], mood: string, rows: readonly BuildRow[], recipes: readonly Recipe[]): WillBody {
	void [cands, mood, rows, recipes];
	throw new Error("not built: willBody");
}
// The row to insert for the chosen candidate, with his line as its reason.
export function newRow(c: Candidate, reason: string): NewBuild {
	void [c, reason];
	throw new Error("not built: newRow");
}
