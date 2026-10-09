// The camera (spec 2): follows him with a dead zone, clamps at the world's edges, tighter on a phone, and comes in on
// him in two whole-number scale steps when he turns to Gur. Pure; times in ms, positions in world px.
import { GROUND_Y, TILE, WORLD_H, WORLD_W } from "./blueprints/types";

export type View = { w: number; h: number }; // canvas px
export type Camera = { x: number; y: number; from: number; to: number; at: number };
export const STEP_MS = 200;
export const ZOOM_IN = 2; // steps
export const GROUND_AT = 0.22; // the ground sits this share of the visible height below the centre (72% down)
const DEAD = { desk: 0.15, phone: 0.06 }; // dead zone half-width, as a share of the visible width
const SMOOTH_MS = 120;
const GROUND_PX = GROUND_Y * TILE;
const HEAD_PX = 20; // when close, the centre sits this far above his feet

export const baseZoom = (width: number): number => (width > 1400 ? 3 : 2);
export const isPhone = (v: View): boolean => v.w <= 640;
const clampAxis = (centre: number, visible: number, size: number) =>
	visible >= size ? size / 2 : Math.min(size - visible / 2, Math.max(visible / 2, centre));

export function newCamera(heX: number, v: View, zoom: number): Camera {
	const vw = v.w / zoom;
	const vh = v.h / zoom;
	return { x: clampAxis(heX, vw, WORLD_W * TILE), y: clampAxis(GROUND_PX - vh * GROUND_AT, vh, WORLD_H * TILE), from: zoom, to: zoom, at: 0 };
}

export function zoomAt(c: Camera, now: number): number {
	if (c.from === c.to) return c.to;
	const steps = Math.min(Math.abs(c.to - c.from), Math.floor(Math.max(0, now - c.at) / STEP_MS));
	return c.from + Math.sign(c.to - c.from) * steps;
}
export const easing = (c: Camera, now: number): boolean => zoomAt(c, now) !== c.to;
// Head for a zoom level from wherever it is now; reduced motion jumps.
export function zoomTo(c: Camera, level: number, now: number, instant = false): Camera {
	if (level === c.to) return c;
	return instant ? { ...c, from: level, to: level, at: now } : { ...c, from: zoomAt(c, now), to: level, at: now };
}

// One step of following. close: he faces Gur, so the camera centres on him instead of using the dead zone.
export function follow(c: Camera, heX: number, v: View, now: number, dt: number, close: boolean): Camera {
	const z = zoomAt(c, now);
	const vw = v.w / z;
	const vh = v.h / z;
	const half = (isPhone(v) ? DEAD.phone : DEAD.desk) * vw;
	let tx = c.x;
	if (close) tx = heX;
	else if (heX > c.x + half) tx = heX - half;
	else if (heX < c.x - half) tx = heX + half;
	const ty = close ? GROUND_PX - HEAD_PX : GROUND_PX - vh * GROUND_AT;
	const k = 1 - Math.exp(-Math.max(0, dt) / SMOOTH_MS);
	return { ...c, x: clampAxis(c.x + (tx - c.x) * k, vw, WORLD_W * TILE), y: clampAxis(c.y + (ty - c.y) * k, vh, WORLD_H * TILE) };
}

// World px to canvas px, rounded so the pixels stay crisp. parallax < 1 for the cloud layers.
export function toScreen(c: Camera, v: View, now: number, wx: number, wy: number, parallax = 1): { x: number; y: number } {
	const z = zoomAt(c, now);
	return { x: Math.round((wx - c.x * parallax) * z + v.w / 2), y: Math.round((wy - c.y) * z + v.h / 2) };
}
