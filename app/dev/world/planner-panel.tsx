"use client";

// The dev page's planner panel (I2 of docs/superpowers/plans/2026-10-11-osmo-free-will.md, spec 4.10): the three candidates
// the planner offers on the world a seed makes (four islands) with the castle finished, planned exactly as the big world's
// engine plans (lib/world/engine/big.ts): the real compiler, rules and variations, the castle's rects blocked, the dock's
// boards as land. The finished builds are placed by the planner itself, one after another, code picking each. Nothing is
// read or saved, and no model is asked.
import { useMemo, useState } from "react";
import dev from "./dev.module.css";
import { cellsOf, START_X } from "@/lib/world/blueprints";
import { CASTLE_ROOMS } from "@/lib/world/blueprints/types";
import { CASTLE_RECTS, castleAt, castleFootprint, castleRecipeId } from "@/lib/world/build/castle-sites";
import { compile } from "@/lib/world/build/compile";
import { PARTS } from "@/lib/world/build/parts";
import { RECIPES } from "@/lib/world/build/recipes";
import { checkBuild, ruleWorldOf } from "@/lib/world/build/rules";
import type { BuildRow, Candidate, MoodKind } from "@/lib/world/build/types";
import { chooseVariation, vary } from "@/lib/world/build/variation";
import { generateWorld } from "@/lib/world/map/generate";
import { DOCK_DECK, homePx } from "@/lib/world/map/home";
import { columnOf } from "@/lib/world/map/lookup";
import { GEN, START_ISLANDS } from "@/lib/world/map/types";
import { fallbackLine, newRow, pickByCode, plan, type PlanDeps } from "@/lib/world/plan/planner";

const MOODS: readonly MoodKind[] = ["low", "bright", "tired", "curious", "missing", "calm"];
const FINISHED_MAX = 12;
const SEED_MAX = 2_147_483_647;
const START = Date.parse("2026-10-01T00:00:00.000Z");
const at = (minutes: number): string => new Date(START + minutes * 60_000).toISOString();

// The castle finished, as six saved rows (the same as lib/world/plan/seam.test.ts).
function castleRows(): BuildRow[] {
	return CASTLE_ROOMS.map((room) => {
		const place = castleAt(room);
		const footprint = castleFootprint(room);
		const total = cellsOf(footprint, place.x, place.y, castleRecipeId(room)).length;
		return { id: `castle-${room}`, recipe: castleRecipeId(room), params: {}, island: 0, ...place, footprint, total, laid: total, reason: null, started_at: at(0), finished_at: at(0) };
	});
}

type Planned = { cands: Candidate[]; pick: number; free: number } | { error: string };
function planned(seed: number, mood: MoodKind, finished: number): Planned {
	try {
		const map = generateWorld(seed, GEN, START_ISLANDS);
		const deps: PlanDeps = { compile, check: checkBuild, choose: chooseVariation, vary, world: (taken) => ruleWorldOf(map, taken, [DOCK_DECK]) };
		const him = { island: 0, x: columnOf(homePx(START_X)) };
		const rows: BuildRow[] = castleRows();
		const input = (n: number) => ({ seed, n, map, rows, recipes: RECIPES, parts: PARTS, mood, him, blocked: CASTLE_RECTS });
		let free = 0;
		for (let i = 0; i < finished; i++) {
			const cands = plan(input(free), deps);
			if (cands.length === 0) break;
			const c = cands[pickByCode(cands, seed, free)];
			const row = newRow(c, fallbackLine(c));
			free++;
			rows.push({ ...row, id: `dev-${free}`, laid: row.total, started_at: at(free), finished_at: at(free) });
		}
		const cands = plan(input(free), deps);
		return { cands, pick: cands.length > 0 ? pickByCode(cands, seed, free) : -1, free };
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

const whole = (text: string, max: number): number => {
	const n = Math.floor(Number(text));
	return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

export function PlannerPanel() {
	const [seed, setSeed] = useState(7);
	const [mood, setMood] = useState<MoodKind>("calm");
	const [finished, setFinished] = useState(0);
	const result = useMemo(() => planned(seed, mood, finished), [seed, mood, finished]);
	return (
		<section className={dev.panel} aria-label="Planner">
			<h2 className={dev.panelTitle}>Planner</h2>
			<div className={dev.panelRow}>
				<label className={dev.field}>
					Seed
					<input className={dev.num} type="number" min={0} max={SEED_MAX} step={1} value={seed} onChange={(e) => setSeed(whole(e.target.value, SEED_MAX))} />
				</label>
				<label className={dev.field}>
					Mood
					<select className={dev.pick} value={mood} onChange={(e) => setMood(e.target.value as MoodKind)}>
						{MOODS.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</label>
				<label className={dev.field}>
					Finished builds
					<input className={dev.num} type="number" min={0} max={FINISHED_MAX} step={1} value={finished} onChange={(e) => setFinished(whole(e.target.value, FINISHED_MAX))} />
				</label>
			</div>
			{"error" in result ? (
				<p className={dev.facts}>The planner stopped: {result.error}</p>
			) : (
				<>
					<p className={dev.facts}>
						The world of seed {seed} with four islands and the castle finished, {result.free} free {result.free === 1 ? "build" : "builds"} placed
						by code before this decision (decision number {result.free}). {result.cands.length < 3 && `Only ${result.cands.length} candidates fit.`}
					</p>
					<div className={dev.cands}>
						{result.cands.map((c, i) => (
							<article key={`${c.recipe.id}-${i}`} className={dev.cand} data-picked={i === result.pick ? "" : undefined}>
								<h3 className={dev.candTitle}>
									{c.recipe.name}
									{i === result.pick && " (code picks this)"}
								</h3>
								<dl className={dev.pairs}>
									<dt>Why</dt>
									<dd>{c.why}</dd>
									<dt>Place</dt>
									<dd>{c.place}</dd>
									<dt>Size</dt>
									<dd>
										{c.size}, {c.compiled.total} blocks
									</dd>
									<dt>Parts</dt>
									<dd>{c.partNames.join(", ")}</dd>
									<dt>Fresh</dt>
									<dd>{c.fresh ? "yes" : "no"}</dd>
									<dt>Score</dt>
									<dd>{c.score.toFixed(2)}</dd>
									<dt>His line</dt>
									<dd>{fallbackLine(c)}</dd>
								</dl>
							</article>
						))}
					</div>
				</>
			)}
		</section>
	);
}
