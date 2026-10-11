// The camera in the big world (spec section 3.2). It works on camera.ts's Camera in canvas (device) px and world px; the
// zoom levels it is given are already multiplied by the device pixel ratio. Task 0 stub; T3 builds it.
import { TILE } from "../blueprints/types";
import type { Camera, View } from "../camera";
import { BIG_H, BIG_W } from "../map/types";

export const STEPS: readonly number[] = [4, 3, 2, 1, 0.5, 0.25, 0.125]; // CSS px per world px
export type Bounds = { w: number; h: number }; // world px
export const BIG_BOUNDS: Bounds = { w: BIG_W * TILE, h: BIG_H * TILE };
export type Him = { x: number; y: number }; // his feet, world px

// The whole-world step for a view cssW wide.
export function fitZoom(cssW: number, bounds: Bounds): number {
	void [cssW, bounds];
	throw new Error("not built: fitZoom");
}
// The steps for a view cssW wide (CSS px per world px): the fixed steps larger than the fit, then the fit; the fixed
// steps alone when cssW is not above 0.
export function zoomSteps(cssW: number, bounds: Bounds): number[] {
	void [cssW, bounds];
	throw new Error("not built: zoomSteps");
}
// The index of the step nearest to z.
export function nearestStep(steps: readonly number[], z: number): number {
	void [steps, z];
	throw new Error("not built: nearestStep");
}
// A camera centred on him (framed as followBig frames him) at a zoom, clamped.
export function newBigCamera(him: Him, v: View, zoom: number, bounds: Bounds): Camera {
	void [him, v, zoom, bounds];
	throw new Error("not built: newBigCamera");
}
// One step in (1) or out (-1) from the step the camera heads for, about the canvas point `at`: the world point under it
// is under it again once the ease is over, unless the clamp moves the centre. instant: jump (reduced motion).
export function zoomAbout(c: Camera, steps: readonly number[], dir: 1 | -1, at: { x: number; y: number }, v: View, bounds: Bounds, now: number, instant: boolean): Camera {
	void [c, steps, dir, at, v, bounds, now, instant];
	throw new Error("not built: zoomAbout");
}
// Moves the view by a canvas px delta, the world moving with the pointer; ends any glide; clamped.
export function panBy(c: Camera, dx: number, dy: number, v: View, bounds: Bounds, now: number): Camera {
	void [c, dx, dy, v, bounds, now];
	throw new Error("not built: panBy");
}
// The camera while Gur steers: the centre settles on its aim over ZOOM_MS, clamped.
export function drift(c: Camera, v: View, bounds: Bounds, now: number): Camera {
	void [c, v, bounds, now];
	throw new Error("not built: drift");
}
// Following him as camera.ts follow does, with the ground under his feet framing the height, both axes clamped. phone:
// the view is a phone's (its CSS width at most 640), which keeps the tighter dead zone; the canvas px width cannot say,
// since it is multiplied by the device pixel ratio.
export function followBig(c: Camera, him: Him, v: View, bounds: Bounds, now: number, dt: number, close: boolean, instant: boolean, phone: boolean): Camera {
	void [c, him, v, bounds, now, dt, close, instant, phone];
	throw new Error("not built: followBig");
}
// Back to him (Home, a tap on him, a message): heads for zoom `base` and glides to him over GLIDE_MS; instant jumps.
export function homeTo(c: Camera, him: Him, base: number, v: View, bounds: Bounds, now: number, instant: boolean): Camera {
	void [c, him, base, v, bounds, now, instant];
	throw new Error("not built: homeTo");
}
// True when none of his sprite (16 by 32 world px standing on his feet) is in view: the Back to Osmo button shows.
export function offScreen(c: Camera, him: Him, v: View, now: number): boolean {
	void [c, him, v, now];
	throw new Error("not built: offScreen");
}
