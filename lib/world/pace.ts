// The redraw rules (spec 2): frames only while he moves, builds or speaks or the camera eases; one timer for the gap
// between blocks or the end of the follow-up window; otherwise a tick every 3 s; nothing while hidden. Under reduced
// motion he still works, the ticks are slower, and the picture is redrawn only on a new block, mode or tile he steps to.
import { FOLLOW_UP_MS, type Actor } from "./actor";

export const FRAME_MS = 33;
export const CALM_FRAME_MS = 250;
export const SLOW_MS = 3000;
export type PaceInput = { actor: Actor; now: number; easing: boolean; hasWork: boolean; reducedMotion: boolean };

export function nextTickIn(p: PaceInput): number | null {
	const a = p.actor;
	if (a.hidden) return null;
	const frame = p.reducedMotion ? CALM_FRAME_MS : FRAME_MS;
	const wait = (ms: number) => Math.min(SLOW_MS, Math.max(frame, Math.ceil(ms)));
	if (a.kind === "walking" || a.kind === "building" || a.kind === "turning" || p.easing) return frame;
	if (a.kind === "facing") return a.talk === "speaking" ? frame : wait(a.quietSince + FOLLOW_UP_MS - p.now);
	if (a.kind === "idle" && p.hasWork) return wait(a.nextAt - p.now);
	return SLOW_MS;
}

export type DrawKey = { laid: number; kind: string; phase: string; zoom: number; tx: number }; // tx: his tile column
export function shouldDraw(reducedMotion: boolean, prev: DrawKey | null, next: DrawKey): boolean {
	if (!reducedMotion || !prev) return true;
	return prev.laid !== next.laid || prev.kind !== next.kind || prev.phase !== next.phase || prev.zoom !== next.zoom || prev.tx !== next.tx;
}
