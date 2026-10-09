// The camera (spec 2, as changed by the look pass): follows him with a dead zone, clamps at the world's left and right
// edges, tighter on a phone, and comes in on him in two whole-number scale steps when he turns to Gur. Up and down it
// is not clamped: above and below the world there is only sky. Pure; times in ms, positions in world px.
import { HALL } from "./blueprints/hall";
import { ISLAND } from "./blueprints/island";
import { GROUND_Y, TILE, WORLD_W } from "./blueprints/types";

export type View = { w: number; h: number }; // canvas px
export type Camera = { x: number; y: number; from: number; to: number; at: number };
export const STEP_MS = 200;
export const ZOOM_IN = 2; // steps
export const GROUND_SHARE = 0.72; // where the ground sits when there is room: this share of the visible height down
export const SKY_TILES = 2; // sky kept above the tallest blueprint's top
export const BELOW_TILES = 2; // island rows kept under the ground: the snow row and the first stone row
export const TALLEST_TILES = GROUND_Y - Math.min(HALL.y, ISLAND.y); // the tallest blueprint above the ground (the hall: 15)
const DEAD = { desk: 0.15, phone: 0.06 }; // dead zone half-width, as a share of the visible width
const SMOOTH_MS = 120;
const GROUND_PX = GROUND_Y * TILE;
const HEAD_PX = 20; // when close, the centre sits this far above his feet
const ABOVE_FIT = (TALLEST_TILES + SKY_TILES) * TILE; // world px above the ground: the hall and its sky
const ABOVE_MIN = TALLEST_TILES * TILE; // the hall alone
const BELOW_FIT = BELOW_TILES * TILE;
const BELOW_MIN = 8; // when the hall must win, at least a sliver of snow stays under his feet

export const WIDE_PX = 900; // from this width up, the base scale is 1
// Scale 1 (a 16 px tile is 16 screen px) on views 900 px wide or more, so the whole island and a lot of sky show; 2
// below that, but only when the hall, its sky and the island's top rows fit at 2 (a short landscape phone stays at 1).
export const baseZoom = (width: number, height: number): number => (width < WIDE_PX && height / 2 >= ABOVE_FIT + BELOW_FIT ? 2 : 1);
// How many world px of the visible height lie above the ground: 72% when that leaves room for the hall and two tiles of
// sky, else just enough for them, but never so many that the island's top rows leave the view; on a short view the hall wins.
export function groundAbove(vh: number): number {
	const room = Math.max(vh - BELOW_FIT, Math.min(ABOVE_MIN, vh - BELOW_MIN));
	return Math.min(Math.max(GROUND_SHARE * vh, ABOVE_FIT), room);
}
const centreY = (vh: number) => GROUND_PX - groundAbove(vh) + vh / 2;
const finite = (dt: number) => (Number.isFinite(dt) && dt > 0 ? dt : 0);
export const isPhone = (v: View): boolean => v.w <= 640;
const clampAxis = (centre: number, visible: number, size: number) =>
	visible >= size ? size / 2 : Math.min(size - visible / 2, Math.max(visible / 2, centre));

export function newCamera(heX: number, v: View, zoom: number): Camera {
	const vw = v.w / zoom;
	const vh = v.h / zoom;
	return { x: clampAxis(heX, vw, WORLD_W * TILE), y: centreY(vh), from: zoom, to: zoom, at: 0 };
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

// Where the camera is heading (centre, world px): he stays at the edge of the dead zone, or is centred when close.
function aim(c: Camera, heX: number, v: View, now: number, close: boolean) {
	const z = zoomAt(c, now);
	const vw = v.w / z;
	const vh = v.h / z;
	const half = (isPhone(v) ? DEAD.phone : DEAD.desk) * vw;
	let tx = c.x;
	if (close) tx = heX;
	else if (heX > c.x + half) tx = heX - half;
	else if (heX < c.x - half) tx = heX + half;
	const ty = close ? GROUND_PX - HEAD_PX : centreY(vh);
	return { z, vw, vh, tx, ty };
}

// One step of following. close: he faces Gur, so the camera centres on him instead of using the dead zone.
export function follow(c: Camera, heX: number, v: View, now: number, dt: number, close: boolean): Camera {
	const { vw, tx, ty } = aim(c, heX, v, now, close);
	const k = 1 - Math.exp(-finite(dt) / SMOOTH_MS);
	return { ...c, x: clampAxis(c.x + (tx - c.x) * k, vw, WORLD_W * TILE), y: c.y + (ty - c.y) * k };
}
// True while the follow smoothing has more than half a screen pixel to go, so the loop keeps its frame pace for it.
export function settling(c: Camera, heX: number, v: View, now: number, close: boolean): boolean {
	const { z, vw, tx, ty } = aim(c, heX, v, now, close);
	return Math.abs(clampAxis(tx, vw, WORLD_W * TILE) - c.x) * z > 0.5 || Math.abs(ty - c.y) * z > 0.5;
}

// World px to canvas px, rounded so the pixels stay crisp. parallax < 1 for the layers behind the island.
export function toScreen(c: Camera, v: View, now: number, wx: number, wy: number, parallax = 1): { x: number; y: number } {
	const z = zoomAt(c, now);
	return { x: Math.round((wx - c.x * parallax) * z + v.w / 2), y: Math.round((wy - c.y) * z + v.h / 2) };
}
