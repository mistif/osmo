// The camera in the big world (spec section 3.2). It works on camera.ts's Camera in canvas (device) px and world px; the
// zoom levels it is given are already multiplied by the device pixel ratio. Task 0 stub; T3 builds it.
import { TILE } from "../blueprints/types";
import { easeOutCubic, GLIDE_MS, groundAbove, JUMP_PX, toScreen, ZOOM_MS, zoomAt, zoomTo, type Camera, type View } from "../camera";
import { BIG_H, BIG_W } from "../map/types";

export const STEPS: readonly number[] = [4, 3, 2, 1, 0.5, 0.25, 0.125]; // CSS px per world px
export type Bounds = { w: number; h: number }; // world px
export const BIG_BOUNDS: Bounds = { w: BIG_W * TILE, h: BIG_H * TILE };
export type Him = { x: number; y: number }; // his feet, world px

const DEAD = { desk: 0.15, phone: 0.06 }; // dead zone half-width, a share of the visible width (as camera.ts)
const HEAD_PX = 20; // when close, the centre sits this far above his feet (as camera.ts)
const clampAxis = (centre: number, visible: number, size: number) => (visible >= size ? size / 2 : Math.min(size - visible / 2, Math.max(visible / 2, centre)));
const clampAt = (x: number, y: number, z: number, v: View, b: Bounds) => ({ x: clampAxis(x, v.w / z, b.w), y: clampAxis(y, v.h / z, b.h) });
// The centre's height that puts his feet where the small world puts the ground.
const frameY = (feet: number, vh: number) => feet - groundAbove(vh) + vh / 2;

// How far the islands reach across the world, world px: the leftmost island's start to the rightmost island's end.
export type Reach = { x0: number; x1: number };
export const FAR_MIN = 1 / 16; // the farthest step is never below this: a phone's whole world is a speck below it
export const REACH_MARGIN = 0.04; // sky left at each end of the whole-world step, a share of the reach
const paddedWidth = (reach: Reach): number => (reach.x1 - reach.x0) * (1 + 2 * REACH_MARGIN);
// The reach of a world's islands (columns, as the map keeps them), in world px; null when there are none.
export function reachOf(islands: readonly { x0: number; x1: number }[]): Reach | null {
	if (islands.length === 0) return null;
	return { x0: Math.min(...islands.map((i) => i.x0)) * TILE, x1: Math.max(...islands.map((i) => i.x1)) * TILE };
}
// The whole-world step for a view cssW wide: the islands' reach and its margin fitted to the width (the whole width of
// the world when no reach is given), but never below FAR_MIN.
export const fitZoom = (cssW: number, bounds: Bounds, reach?: Reach | null): number =>
	Math.max(FAR_MIN, cssW / (reach ? paddedWidth(reach) : bounds.w));
// The steps for a view cssW wide (CSS px per world px): the fixed steps larger than the fit, then the fit; the fixed
// steps alone when cssW is not above 0.
export function zoomSteps(cssW: number, bounds: Bounds, reach?: Reach | null): number[] {
	if (!(cssW > 0)) return [...STEPS];
	const fit = fitZoom(cssW, bounds, reach);
	return [...STEPS.filter((s) => s > fit), fit];
}
// The index of the step nearest to z.
export function nearestStep(steps: readonly number[], z: number): number {
	let best = 0;
	for (let i = 1; i < steps.length; i++) if (Math.abs(Math.log(steps[i] / z)) < Math.abs(Math.log(steps[best] / z))) best = i;
	return best;
}
// A camera centred on him (framed as followBig frames him) at a zoom, clamped.
export function newBigCamera(him: Him, v: View, zoom: number, bounds: Bounds): Camera {
	const p = clampAt(him.x, frameY(him.y, v.h / zoom), zoom, v, bounds);
	return { x: p.x, y: p.y, from: zoom, to: zoom, at: 0, aimX: p.x, aimY: p.y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY };
}
// The camera while Gur steers: the centre settles on its aim over ZOOM_MS, clamped.
export function drift(c: Camera, v: View, bounds: Bounds, now: number): Camera {
	const k = 1 - easeOutCubic((now - c.glideAt) / ZOOM_MS);
	const z = zoomAt(c, now);
	if (!(z > 0)) return c;
	const p = clampAt(c.aimX + c.ox * k, c.aimY + c.oy * k, z, v, bounds);
	return { ...c, x: p.x, y: p.y };
}
// One step in (1) or out (-1) from the step the camera heads for, about the canvas point `at`: the world point under it
// is under it again once the ease is over, unless the clamp moves the centre. instant: jump (reduced motion). reach: the
// islands'; a step that shows all of it (the fit) rests with the islands in the middle, not wherever the point was.
export function zoomAbout(
	c: Camera, steps: readonly number[], dir: 1 | -1, at: { x: number; y: number }, v: View, bounds: Bounds, now: number, instant: boolean, reach?: Reach | null,
): Camera {
	if (steps.length === 0) return c;
	const i = nearestStep(steps, c.to);
	const z1 = steps[Math.max(0, Math.min(steps.length - 1, i - dir))]; // index 0 is the nearest step
	if (z1 === c.to) return c;
	const here = drift(c, v, bounds, now);
	const z0 = zoomAt(c, now);
	const wx = here.x + (at.x - v.w / 2) / z0;
	const wy = here.y + (at.y - v.h / 2) / z0;
	const whole = reach != null && v.w / z1 >= paddedWidth(reach) - 1e-6;
	const aim = clampAt(whole ? (reach.x0 + reach.x1) / 2 : wx - (at.x - v.w / 2) / z1, wy - (at.y - v.h / 2) / z1, z1, v, bounds);
	if (instant) return { ...c, x: aim.x, y: aim.y, from: z1, to: z1, at: now, aimX: aim.x, aimY: aim.y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY };
	return { ...c, x: here.x, y: here.y, from: z0, to: z1, at: now, aimX: aim.x, aimY: aim.y, ox: here.x - aim.x, oy: here.y - aim.y, glideAt: now };
}
// Moves the view by a canvas px delta, the world moving with the pointer; ends any glide; clamped.
export function panBy(c: Camera, dx: number, dy: number, v: View, bounds: Bounds, now: number): Camera {
	const z = zoomAt(c, now);
	if (!(z > 0)) return c;
	const here = drift(c, v, bounds, now);
	const p = clampAt(here.x - dx / z, here.y - dy / z, z, v, bounds);
	return { ...c, x: p.x, y: p.y, aimX: p.x, aimY: p.y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY };
}
// Following him as camera.ts follow does, with the ground under his feet framing the height, both axes clamped. phone:
// the view is a phone's (its CSS width at most 640), which keeps the tighter dead zone; the canvas px width cannot say,
// since it is multiplied by the device pixel ratio.
export function followBig(c: Camera, him: Him, v: View, bounds: Bounds, now: number, dt: number, close: boolean, instant: boolean, phone: boolean): Camera {
	if (!(Number.isFinite(dt) && dt > 0)) return c;
	const z = zoomAt(c, now);
	const half = (phone ? DEAD.phone : DEAD.desk) * (v.w / c.to);
	let tx = c.aimX;
	if (close) tx = him.x;
	else if (him.x > c.aimX + half) tx = him.x - half;
	else if (him.x < c.aimX - half) tx = him.x + half;
	const ty = close ? him.y - HEAD_PX : frameY(him.y, v.h / c.to);
	const aim = clampAt(tx, ty, c.to, v, bounds);
	const jumped = Math.abs(aim.x - c.aimX) > JUMP_PX || Math.abs(aim.y - c.aimY) > JUMP_PX;
	let { ox, oy, glideAt } = c;
	if (instant) {
		ox = 0;
		oy = 0;
	} else if (jumped) {
		ox = c.x - aim.x;
		oy = c.y - aim.y;
		glideAt = now;
	}
	const k = instant ? 0 : 1 - easeOutCubic((now - glideAt) / GLIDE_MS);
	const p = clampAt(aim.x + ox * k, aim.y + oy * k, z, v, bounds);
	return { ...c, aimX: aim.x, aimY: aim.y, ox, oy, glideAt, x: p.x, y: p.y };
}
// Back to him (Home, a tap on him, a message): heads for zoom `base` and glides to him over GLIDE_MS; instant jumps.
export function homeTo(c: Camera, him: Him, base: number, v: View, bounds: Bounds, now: number, instant: boolean): Camera {
	const zc = zoomTo(c, base, now, instant);
	const aim = clampAt(him.x, frameY(him.y, v.h / base), base, v, bounds);
	if (instant) return { ...zc, x: aim.x, y: aim.y, aimX: aim.x, aimY: aim.y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY };
	return { ...zc, aimX: aim.x, aimY: aim.y, ox: c.x - aim.x, oy: c.y - aim.y, glideAt: now };
}
// True when none of his sprite (16 by 32 world px standing on his feet) is in view: the Back to Osmo button shows.
export function offScreen(c: Camera, him: Him, v: View, now: number): boolean {
	const a = toScreen(c, v, now, him.x - 8, him.y - 32);
	const b = toScreen(c, v, now, him.x + 8, him.y);
	return b.x <= 0 || b.y <= 0 || a.x >= v.w || a.y >= v.h;
}
// Where his feet are on the view, canvas px, while any of him is in view; null once none of him is. The zoom keys and the
// zoom control zoom about it, so the ground under him stays where it is as the world grows or shrinks round him.
export function himOnScreen(c: Camera, him: Him, v: View, now: number): { x: number; y: number } | null {
	return offScreen(c, him, v, now) ? null : toScreen(c, v, now, him.x, him.y);
}
