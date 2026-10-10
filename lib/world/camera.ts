// The camera (spec 2, as changed by the look pass and the polish pass): follows him with a dead zone, clamps at the
// world's left and right edges, tighter on a phone, and comes in on him when he turns to Gur. Up and down it is not
// clamped: above and below the world there is only sky. Since the polish pass nothing moves in steps: the zoom runs
// on an ease-out cubic curve from wherever it is to the next whole scale, and when the place it heads for jumps (he
// turns to Gur or back, the zoom reframes) it glides there on the same curve. Pure; times in ms, positions in world px.
import { HALL } from "./blueprints/hall";
import { ISLAND } from "./blueprints/island";
import { GROUND_Y, TILE, WORLD_W } from "./blueprints/types";

export type View = { w: number; h: number }; // canvas px
// x, y: the centre drawn now. from, to, at: the zoom eases from `from` to the whole scale `to`, starting at `at`.
// aimX, aimY: where it heads for (the dead zone's own centre); ox, oy: how far the centre still lags behind that at
// glideAt, shrinking on the ease-out curve to nothing over GLIDE_MS.
export type Camera = { x: number; y: number; from: number; to: number; at: number; aimX: number; aimY: number; ox: number; oy: number; glideAt: number };
export const ZOOM_MS = 400; // spec 2's 400 ms, now one eased move instead of two steps
export const GLIDE_MS = 500;
export const JUMP_PX = 4; // the aim moving more than this in one frame is a jump to glide over (walking moves it 1.6 a frame)
export const ZOOM_IN = 2; // whole scales
export const GROUND_SHARE = 0.72; // where the ground sits when there is room: this share of the visible height down
export const SKY_TILES = 2; // sky kept above the tallest blueprint's top
export const BELOW_TILES = 2; // island rows kept under the ground: the snow row and the first stone row
export const TALLEST_TILES = GROUND_Y - Math.min(HALL.y, ISLAND.y); // the tallest blueprint above the ground (the hall: 15)
const DEAD = { desk: 0.15, phone: 0.06 }; // dead zone half-width, as a share of the visible width
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
export const isPhone = (v: View): boolean => v.w <= 640;
// The easing for every camera move: fast at first, settling softly. t is the share of the move's time, clamped.
export const easeOutCubic = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const clampAxis = (centre: number, visible: number, size: number) =>
	visible >= size ? size / 2 : Math.min(size - visible / 2, Math.max(visible / 2, centre));

export function newCamera(heX: number, v: View, zoom: number): Camera {
	const vw = v.w / zoom;
	const vh = v.h / zoom;
	const x = clampAxis(heX, vw, WORLD_W * TILE);
	const y = centreY(vh);
	return { x, y, from: zoom, to: zoom, at: 0, aimX: x, aimY: y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY };
}

// The zoom now: between two whole scales while it eases (the renderer draws those frames from the larger scale's
// atlas), exactly `to` once ZOOM_MS has passed.
export function zoomAt(c: Camera, now: number): number {
	if (c.from === c.to) return c.to;
	const t = (now - c.at) / ZOOM_MS;
	if (!(t < 1)) return c.to; // also when now is NaN
	return c.from + (c.to - c.from) * easeOutCubic(t);
}
export const easing = (c: Camera, now: number): boolean => zoomAt(c, now) !== c.to;
// Head for a zoom level from wherever it is now; reduced motion jumps.
export function zoomTo(c: Camera, level: number, now: number, instant = false): Camera {
	if (level === c.to) return c;
	return instant ? { ...c, from: level, to: level, at: now } : { ...c, from: zoomAt(c, now), to: level, at: now };
}

// Where the camera heads for (centre, world px): he stays at the edge of the dead zone, or is centred when close. The
// dead zone is measured from the aim, not from the gliding centre, so a glide never drags the zone along with it.
function aim(c: Camera, heX: number, v: View, now: number, close: boolean) {
	const z = zoomAt(c, now);
	const vw = v.w / z;
	const vh = v.h / z;
	const half = (isPhone(v) ? DEAD.phone : DEAD.desk) * vw;
	let tx = c.aimX;
	if (close) tx = heX;
	else if (heX > c.aimX + half) tx = heX - half;
	else if (heX < c.aimX - half) tx = heX + half;
	const ty = close ? GROUND_PX - HEAD_PX : centreY(vh);
	return { z, vw, tx: clampAxis(tx, vw, WORLD_W * TILE), ty };
}
// How much of the lag is left at `now` (1 at the start of a glide, 0 once it is over).
const lagLeft = (c: Camera, now: number) => 1 - easeOutCubic((now - c.glideAt) / GLIDE_MS);

// One step of following. close: he faces Gur, so the camera centres on him instead of using the dead zone. The aim
// follows him exactly (at the dead zone's edge it moves at his walking pace); when it jumps the centre glides after it
// on the ease-out curve, from wherever it is, over GLIDE_MS. instant (reduced motion): no glide, it is there at once.
// A dt that is not a positive number means no time has passed: nothing moves.
export function follow(c: Camera, heX: number, v: View, now: number, dt: number, close: boolean, instant = false): Camera {
	if (!(Number.isFinite(dt) && dt > 0)) return c;
	const { vw, tx, ty } = aim(c, heX, v, now, close);
	const jumped = Math.abs(tx - c.aimX) > JUMP_PX || Math.abs(ty - c.aimY) > JUMP_PX;
	let { ox, oy, glideAt } = c;
	if (instant) {
		ox = 0;
		oy = 0;
	} else if (jumped) {
		ox = c.x - tx;
		oy = c.y - ty;
		glideAt = now;
	}
	const k = instant ? 0 : lagLeft({ ...c, glideAt }, now);
	return { ...c, aimX: tx, aimY: ty, ox, oy, glideAt, x: clampAxis(tx + ox * k, vw, WORLD_W * TILE), y: ty + oy * k };
}
// True while the centre is more than half a screen pixel from where it heads for, so the loop keeps its frame pace.
export function settling(c: Camera, heX: number, v: View, now: number, close: boolean): boolean {
	const { z, tx, ty } = aim(c, heX, v, now, close);
	return Math.abs(tx - c.x) * z > 0.5 || Math.abs(ty - c.y) * z > 0.5;
}

// World px to canvas px, rounded so the pixels stay crisp. parallax < 1 for the layers behind the island.
export function toScreen(c: Camera, v: View, now: number, wx: number, wy: number, parallax = 1): { x: number; y: number } {
	const z = zoomAt(c, now);
	return { x: Math.round((wx - c.x * parallax) * z + v.w / 2), y: Math.round((wy - c.y) * z + v.h / 2) };
}
