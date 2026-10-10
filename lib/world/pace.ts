// The redraw rules (spec 2): frames only while he moves, builds or speaks or the camera eases; one timer for the gap
// between blocks or the end of the follow-up window; otherwise a tick every 3 s; nothing while hidden. Under reduced
// motion he still works, the ticks are slower, and the picture is redrawn only on a new block, mode or tile he steps to.
// The polish pass adds two wake-ups inside those rules, both off under reduced motion: lookIn, when his look changes by
// itself (a breath, a blink: actor.ts nextLookIn), and ambient, the pace the life in the world asks for while some of
// it is on screen (life.ts lifePace: frames for a block's dust, AMBIENT_MS for snow, smoke and birds). Neither is ever
// faster than the 30 frames a second cap.
import { FOLLOW_UP_MS, type Actor } from "./actor";

export const FRAME_MS = 33;
export const CALM_FRAME_MS = 250;
export const SLOW_MS = 3000;
export const AMBIENT_MS = 66;
export type PaceInput = {
	actor: Actor;
	now: number;
	easing: boolean;
	hasWork: boolean;
	reducedMotion: boolean;
	lookIn?: number | null;
	ambient?: number | null;
};

export function nextTickIn(p: PaceInput): number | null {
	const a = p.actor;
	if (a.hidden) return null;
	const frame = p.reducedMotion ? CALM_FRAME_MS : FRAME_MS;
	const wait = (ms: number) => Math.min(SLOW_MS, Math.max(frame, Math.ceil(ms)));
	if (a.kind === "walking" || a.kind === "building" || a.kind === "turning" || p.easing) return frame;
	let ms = SLOW_MS;
	if (a.kind === "facing") ms = a.talk === "speaking" ? frame : wait(a.quietSince + FOLLOW_UP_MS - p.now);
	else if (a.kind === "idle" && p.hasWork) ms = wait(a.nextAt - p.now);
	if (p.reducedMotion) return ms;
	if (p.lookIn != null && Number.isFinite(p.lookIn)) ms = Math.min(ms, wait(p.lookIn));
	if (p.ambient != null && Number.isFinite(p.ambient)) ms = Math.min(ms, wait(p.ambient));
	return ms;
}

export type DrawKey = { laid: number; kind: string; phase: string; zoom: number; tx: number }; // tx: his tile column
export function shouldDraw(reducedMotion: boolean, prev: DrawKey | null, next: DrawKey): boolean {
	if (!reducedMotion || !prev) return true;
	return prev.laid !== next.laid || prev.kind !== next.kind || prev.phase !== next.phase || prev.zoom !== next.zoom || prev.tx !== next.tx;
}
