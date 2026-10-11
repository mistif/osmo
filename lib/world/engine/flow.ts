// The big world's engine, its pure part (I1 of the free-will plan): which world runs, the village's castle moved into the
// big world, the lists the builds draw, what a catch-up laid and what it does next, the decks he walks, the zoom he is
// framed at, who moves the camera, where a gesture starts, and the gate that keeps decisions to one at a time.
import { cellsOf } from "../blueprints";
import { TILE, type Block } from "../blueprints/types";
import { roomOfRecipe } from "../build/castle-sites";
import { castleWaiting, freeInProgress, laidBuildBlocks } from "../build/state";
import type { BuildProgress, Builds } from "../build/types";
import { baseZoom, ZOOM_IN } from "../camera";
import { DOCK_DECK, shiftBlocks } from "../map/home";
import { islandAt } from "../map/lookup";
import { HOME_DX, HOME_DY, type Deck, type WorldMap } from "../map/types";
import { deckOf } from "../travel/travel";
import type { LapseRun } from "../travel/timelapse";
import { laidBlocks, nextBlock, type Village } from "../village";

export type Mode = "small" | "big" | "builds";
export const WILL_LINE_MS = 6000;
export const modeOf = (flags: { bigworld: boolean; builds: boolean }, pin?: Mode): Mode => pin ?? (flags.builds ? "builds" : flags.bigworld ? "big" : "small");

// No outline: the room never shows what he is building towards (Gur, 2026-10-11, ff1b324).
const KEPT = new WeakMap<Village, { laid: Block[]; ghost: Block | null }>();
export function shiftedVillage(v: Village): { laid: Block[]; ghost: Block | null } {
	const hit = KEPT.get(v);
	if (hit) return hit;
	const next = nextBlock(v);
	const out = {
		laid: shiftBlocks(laidBlocks(v), HOME_DX, HOME_DY),
		ghost: next ? shiftBlocks([next], HOME_DX, HOME_DY)[0] : null,
	};
	KEPT.set(v, out);
	return out;
}
export const lightsOf = (finished: readonly BuildProgress[]): { x: number; y: number }[] =>
	finished.map((p) => ({ x: (p.x + (p.footprint.map[0]?.length ?? 0) / 2) * TILE, y: (p.y + 1) * TILE }));
// What the builds draw, made once per Builds (a new one comes only when a block lands or the builds change).
const LISTS = new WeakMap<Builds, { laid: Block[]; lights: { x: number; y: number }[] }>();
export function drawLists(b: Builds): { laid: Block[]; lights: { x: number; y: number }[] } {
	const hit = LISTS.get(b);
	if (hit) return hit;
	const out = { laid: laidBuildBlocks(b), lights: lightsOf(b.list.filter((p) => p.laid >= p.total)) };
	LISTS.set(b, out);
	return out;
}
export function lapseRuns(before: Builds, after: Builds): LapseRun[] {
	const out: LapseRun[] = [];
	for (const p of after.list) {
		const was = before.list.find((q) => q.key === p.key || (q.id !== null && q.id === p.id))?.laid ?? 0;
		if (p.laid > was) out.push({ key: p.key, blocks: p.blocks.slice(was, p.laid) });
	}
	return out;
}
// The dock (builds mode) and every finished rope bridge. A bridge's west end may stand on the dock, over the sky, so
// its island there is the row's own (newRow saves a bridge's `from` as its island).
export function decksOf(b: Builds, map: Pick<WorldMap, "islands">, dock: boolean): Deck[] {
	const out: Deck[] = dock ? [DOCK_DECK] : [];
	for (const p of b.list) {
		if (p.recipe !== "rope-bridge" || p.laid < p.total || roomOfRecipe(p.recipe) !== null) continue;
		const w = p.footprint.map[0]?.length ?? 0;
		const from = islandAt(map, p.x)?.id ?? p.island;
		const to = islandAt(map, p.x + w - 1)?.id ?? islandAt(map, p.x + w)?.id;
		if (to === undefined) continue;
		out.push(deckOf(cellsOf(p.footprint, p.x, p.y, p.recipe), from, to));
	}
	return out;
}
export const followZoom = (cssW: number, cssH: number, close: boolean, dpr: number): number => (baseZoom(cssW, cssH) + (close ? ZOOM_IN : 0)) * dpr;

// Who moves the camera (spec 3.2 and 4.7): following him; steering (Gur panned, zoomed, pinched, wheeled or used the
// keys: following stops); or the time-lapse visiting its sites. home (Back to Osmo, a tap on him, the Home key, a
// message) always restores following; Gur's own steering wins over the time-lapse.
export type CameraMode = "following" | "steering" | "lapse";
export type CameraEvent = "steer" | "home" | "lapse" | "lapse-end";
export function cameraAfter(mode: CameraMode, e: CameraEvent): CameraMode {
	switch (e) {
		case "steer":
			return "steering";
		case "home":
			return "following";
		case "lapse":
			return mode === "following" ? "lapse" : mode;
		case "lapse-end":
			return mode === "lapse" ? "following" : mode;
	}
}
// The Back to Osmo button: while he is off screen and the camera is not following him.
export const showHome = (mode: CameraMode, off: boolean): boolean => off && mode !== "following";

// Where a pointer or wheel event started (spec 3.2, the conversation wins), from the event's composed path, target
// first, as big.ts reads it: each element's lower-case tag, its role attribute, and whether it is the world's own input
// layer. Only an event whose target is that layer is on the world; a button, link, field or anything with a control's
// role is a control wherever it is.
export type PathEl = { tag: string; role: string | null; world: boolean };
const CONTROL_TAGS = ["button", "a", "input", "textarea", "select", "label", "summary", "details"];
const CONTROL_ROLES = ["button", "link", "textbox", "slider", "checkbox", "switch", "tab", "menuitem", "option", "combobox"];
export const startOf = (path: readonly PathEl[]): { inColumn: boolean; onControl: boolean } => ({
	inColumn: path.length === 0 || !path[0].world,
	onControl: path.some((e) => CONTROL_TAGS.includes(e.tag) || (e.role !== null && CONTROL_ROLES.includes(e.role))),
});

// One decision at a time, at most one per due moment (spec 4.8). A decision that started no build (no candidates, a
// failed insert, or a taken insert whose re-read shows no free build in progress) pauses decisions for NO_ROOM_MS, so
// nothing repeats every frame; a started build ends the due moment by itself (decisionDue is false while it is in progress).
export const NO_ROOM_MS = 600_000;
export type Gate = { deciding: boolean; pausedUntil: number };
export const OPEN_GATE: Gate = { deciding: false, pausedUntil: Number.NEGATIVE_INFINITY };
export const mayDecide = (g: Gate, due: boolean, now: number): boolean => due && !g.deciding && now >= g.pausedUntil;
export const beginDecision = (g: Gate): Gate => ({ ...g, deciding: true });
export const endDecision = (g: Gate, started: boolean, now: number): Gate => ({ deciding: false, pausedUntil: started ? g.pausedUntil : now + NO_ROOM_MS });
// Whether an insert started a build: a row of ours, or (taken: another tab chose first) the build the re-read shows in progress.
export const decisionStarted = (inserted: "row" | "taken" | "failed", reread: Builds | null): boolean =>
	inserted === "row" || (inserted === "taken" && reread !== null && freeInProgress(reread) !== null);

// One step of the catch-up on return (spec 4.7): lay part of the free build in progress, decide a new one, or stop.
// left: lapse blocks not laid yet; decided: decisions made in this catch-up; allowed: returnDecisions(decidedToday(...)).
export type CatchUp = { left: number; decided: number; allowed: number };
export function catchUpStep(c: CatchUp, b: Builds): { kind: "lay"; n: number } | { kind: "decide" } | { kind: "done" } {
	if (c.left <= 0 || castleWaiting(b)) return { kind: "done" };
	const p = freeInProgress(b);
	if (p) return { kind: "lay", n: Math.min(c.left, p.total - p.laid) };
	return c.decided < c.allowed ? { kind: "decide" } : { kind: "done" };
}
