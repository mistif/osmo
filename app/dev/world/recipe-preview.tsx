"use client";

// The dev page's recipe preview (I2 of docs/superpowers/plans/2026-10-11-osmo-free-will.md, spec 4.10): one recipe at one
// seed, compiled and laid on a flat fixture island and drawn by the world's own drawWorld and canvasPainter, with the
// rule checks it passes or fails. The fixture is island A of lib/world/build/all-recipes.test.ts (columns 100 to 299, top
// row 60) and, for the rope bridge, its island B (columns 330 to 529, top row 66). The castle's six rooms are fixed
// blueprints and stand on the home island at their own place. Nothing is read or saved.
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../../assistant.module.css";
import dev from "./dev.module.css";
import type { Look } from "@/lib/world/actor";
import { cellsOf } from "@/lib/world/blueprints";
import { TILE, type Block } from "@/lib/world/blueprints/types";
import { CASTLE_RECIPES } from "@/lib/world/build/castle";
import { compile } from "@/lib/world/build/compile";
import { PARTS } from "@/lib/world/build/parts";
import { RECIPES } from "@/lib/world/build/recipes";
import { checkBuild, ruleWorldOf } from "@/lib/world/build/rules";
import type { Compiled, Problem, Recipe, Site, Variation } from "@/lib/world/build/types";
import { standBeside } from "@/lib/world/build/stand";
import { sizeOf } from "@/lib/world/build/util";
import { chooseVariation } from "@/lib/world/build/variation";
import type { Camera } from "@/lib/world/camera";
import { canvasPainter } from "@/lib/world/canvas-painter";
import { generateWorld } from "@/lib/world/map/generate";
import { HOME_ISLAND, HOME_TOP } from "@/lib/world/map/home";
import { GEN, type Island, type WorldMap } from "@/lib/world/map/types";
import { FRAME_MS } from "@/lib/world/pace";
import { artFor, drawWorld, type WorldScene } from "@/lib/world/render";

const VIEW = { w: 480, h: 320 } as const; // canvas px
const STEPS = [2, 1, 0.5] as const; // the zoom: the nearest at which the build and a margin fit the canvas
const SCARF = "#d98c5f";
const OFF_SCREEN = -100_000; // where he stands when the build is a bridge: not in the picture
const MAX_REDRAWS = 30; // at zoom 1/2 the chunk bitmaps are baked a few a frame; the drawing is repeated until they are all there
const SEED_MAX = 2_147_483_647;
const STANDING: Look = { frame: "idle-1", flip: false, face: null, gaze: 0, blink: false, trail: null };
const ALL: readonly Recipe[] = [...RECIPES, ...CASTLE_RECIPES];

// Island A, and B 30 columns of sky east of it and 6 rows lower.
const FLAT = [
	{ id: 1, x0: 100, x1: 300, top: 60 },
	{ id: 2, x0: 330, x1: 530, top: 66 },
] as const;
const ROCK = 4; // rows of rock drawn under the snow row
type Fixture = { map: WorldMap; siteFor(r: Recipe): Site };

// A flat island: its snow row, then rock in the generator's own tiles. The rules read these blocks as the land.
function flatIsland(i: { id: number; x0: number; x1: number; top: number }): { island: Island; blocks: Block[] } {
	const w = i.x1 - i.x0;
	const blocks: Block[] = [];
	for (let c = 0; c < w; c++) {
		const left = c === 0;
		const right = c === w - 1;
		blocks.push({ x: i.x0 + c, y: i.top, tile: left ? "snow-edge-l" : right ? "snow-edge-r" : "snow", layer: "ground" });
		for (let r = 1; r <= ROCK; r++) {
			const tile =
				r === ROCK ? (left ? "stone-under-l" : right ? "stone-under-r" : "stone-bottom")
				: left ? "stone-edge-l"
				: right ? "stone-edge-r"
				: r <= 2 ? "stone"
				: "stone-dark";
			blocks.push({ x: i.x0 + c, y: i.top + r, tile, layer: "ground" });
		}
	}
	return { island: { id: i.id, x0: i.x0, x1: i.x1, ground: i.top, top: Array.from({ length: w }, () => i.top), home: false }, blocks };
}
let flatKept: Fixture | undefined;
function flatFixture(): Fixture {
	if (flatKept) return flatKept;
	const [a, b] = FLAT.map(flatIsland);
	const map: WorldMap = { seed: 0, gen: GEN, islands: [a.island, b.island], ground: [...a.blocks, ...b.blocks] };
	// The same three sites as all-recipes.test.ts: a level run, a run flush to the island's west end, and a bridge from A's last cell to B's first.
	const siteFor = (r: Recipe): Site =>
		r.site === "bridge" ? { kind: "bridge", from: 1, to: 2, a: { x: FLAT[0].x1 - 1, y: FLAT[0].top }, b: { x: FLAT[1].x0, y: FLAT[1].top } }
		: r.site === "cliff" ? { kind: "ground", island: 1, x: FLAT[0].x0 + 1, w: 60, ground: FLAT[0].top, cliff: "left" }
		: { kind: "ground", island: 1, x: FLAT[0].x0 + 20, w: 60, ground: FLAT[0].top, cliff: null };
	flatKept = { map, siteFor };
	return flatKept;
}
let homeKept: Fixture | undefined;
function homeFixture(): Fixture {
	if (homeKept) return homeKept;
	const map = generateWorld(0, GEN, 1);
	const site: Site = { kind: "ground", island: 0, x: HOME_ISLAND.x0, w: HOME_ISLAND.x1 - HOME_ISLAND.x0, ground: HOME_TOP, cliff: null };
	homeKept = { map, siteFor: () => site };
	return homeKept;
}

// The camera: the build, a margin of two tiles left (where he stands when the ground is only there) and above, three right
// (for him) and below (for the ground), at the nearest zoom of 2, 1 and 1/2 at which all of it fits.
function framing(c: Compiled, bridge: boolean): { z: number; x: number; y: number } {
	const left = c.x - 2;
	const right = c.x + c.w + (bridge ? 2 : 3);
	const top = c.y - 1;
	const bottom = c.y + c.h + 3;
	const z = STEPS.find((s) => (right - left) * TILE * s <= VIEW.w && (bottom - top) * TILE * s <= VIEW.h) ?? 0.5;
	return { z, x: ((left + right) / 2) * TILE, y: ((top + bottom) / 2) * TILE };
}

type Shown = { recipe: Recipe; v: Variation; c: Compiled; problems: Problem[]; scene: WorldScene; zoom: number };
type Result = { ok: true; shown: Shown } | { ok: false; error: string };
function preview(id: string, seed: number): Result {
	const recipe = ALL.find((r) => r.id === id) ?? ALL[0];
	try {
		const fx = recipe.kind === "castle" ? homeFixture() : flatFixture();
		const site = fx.siteFor(recipe);
		const v = chooseVariation(recipe, PARTS, seed);
		const c = compile(recipe, v, site, PARTS);
		const problems = checkBuild(c, recipe, site, ruleWorldOf(fx.map, [], []));
		const bridge = site.kind === "bridge";
		const f = framing(c, bridge);
		const camera: Camera = { x: f.x, y: f.y, from: f.z, to: f.z, at: 0, aimX: f.x, aimY: f.y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY };
		const laid = cellsOf(c.footprint, c.x, c.y, c.recipe);
		// Beside the build on the side that has ground, else on its own floor (standBeside); a bridge's picture has no one in it.
		const stand = site.kind === "ground" ? standBeside(c, fx.map.islands.find((i) => i.id === site.island), laid) : null;
		const scene: WorldScene = {
			camera, view: VIEW, now: 0, clock: 0, ground: fx.map.ground, laid, ghost: null, outline: [],
			him: { x: stand ? stand.x : OFF_SCREEN, y: stand ? stand.y : 0, look: STANDING },
			dark: 0,
		};
		return { ok: true, shown: { recipe, v, c, problems, scene, zoom: f.z } };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

const seedOf = (text: string): number => {
	const n = Math.floor(Number(text));
	return Number.isFinite(n) ? Math.min(SEED_MAX, Math.max(0, n)) : 0;
};
const PROBLEMS_SHOWN = 12;

export function RecipePreview() {
	const [id, setId] = useState<string>(RECIPES[0].id);
	const [seed, setSeed] = useState(0);
	const canvas = useRef<HTMLCanvasElement>(null);
	const result = useMemo(() => preview(id, seed), [id, seed]);
	const scene = result.ok ? result.shown.scene : null;
	useEffect(() => {
		const ctx = canvas.current?.getContext("2d");
		if (!scene || !ctx) return;
		const painter = canvasPainter(ctx, artFor(SCARF));
		let timer: ReturnType<typeof setTimeout> | null = null;
		let tries = 0;
		const draw = () => {
			timer = null;
			try {
				const { pending } = drawWorld(painter, scene);
				if (pending > 0 && ++tries < MAX_REDRAWS) timer = setTimeout(draw, FRAME_MS);
			} catch (err) {
				console.warn("[dev] The recipe preview could not be drawn.", err);
			}
		};
		draw();
		return () => {
			if (timer !== null) clearTimeout(timer);
			painter.release?.();
		};
	}, [scene]);
	const shown = result.ok ? result.shown : null;
	const button = (label: string, onClick: () => void) => (
		<button type="button" className={`${styles.mic} ${dev.btn}`} onClick={onClick}>
			{label}
		</button>
	);
	return (
		<section className={dev.panel} aria-label="Recipe preview">
			<h2 className={dev.panelTitle}>Recipe preview</h2>
			<div className={dev.panelRow}>
				<label className={dev.field}>
					Recipe
					<select className={dev.pick} value={id} onChange={(e) => setId(e.target.value)}>
						<optgroup label="Seed recipes">
							{RECIPES.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
								</option>
							))}
						</optgroup>
						<optgroup label="Castle rooms">
							{CASTLE_RECIPES.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
								</option>
							))}
						</optgroup>
					</select>
				</label>
				{button("Previous", () => setSeed((s) => Math.max(0, s - 1)))}
				<label className={dev.field}>
					Seed
					<input className={dev.num} type="number" min={0} max={SEED_MAX} step={1} value={seed} onChange={(e) => setSeed(seedOf(e.target.value))} />
				</label>
				{button("Next", () => setSeed((s) => Math.min(SEED_MAX, s + 1)))}
			</div>
			<canvas
				ref={canvas}
				className={dev.canvas}
				width={VIEW.w}
				height={VIEW.h}
				role="img"
				aria-label={shown ? `${shown.recipe.name}, seed ${seed}, drawn at zoom ${shown.zoom === 0.5 ? "1/2" : shown.zoom}` : "No picture"}
			/>
			{shown ? (
				<>
					<p className={dev.facts}>
						{shown.c.total} blocks, {sizeOf(shown.c.total)}, {shown.c.w} tiles wide and {shown.c.h} tall, drawn at zoom {shown.zoom === 0.5 ? "1/2" : shown.zoom}.
					</p>
					{shown.problems.length === 0 ? (
						<p className={dev.facts}>Passes every rule</p>
					) : (
						<ul className={dev.problems}>
							{shown.problems.slice(0, PROBLEMS_SHOWN).map((p, i) => (
								<li key={i}>
									{p.rule} at {p.x}, {p.y}
								</li>
							))}
							{shown.problems.length > PROBLEMS_SHOWN && <li>and {shown.problems.length - PROBLEMS_SHOWN} more</li>}
						</ul>
					)}
					<pre className={dev.json}>{JSON.stringify(shown.v, null, 1)}</pre>
				</>
			) : (
				<p className={dev.facts}>
					This recipe could not be compiled: {result.ok ? "" : result.error}
				</p>
			)}
		</section>
	);
}
