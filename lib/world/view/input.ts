// Gur's gestures as camera intents (spec section 3.2), pure. Pointer, wheel and key events come in with their CSS px
// position over the world region; out comes what the camera should do. Task 0 stub; T3 builds it.
export type Intent =
	| { kind: "pan"; dx: number; dy: number }
	| { kind: "zoom"; dir: 1 | -1; x: number; y: number }
	| { kind: "tap"; x: number; y: number }
	| { kind: "home" };
export type Gesture = {
	pointers: readonly { id: number; x: number; y: number }[]; // the world's pointers
	others: readonly number[]; // pointers down that went down off the world (the conversation, a control): while any is down no new world pointer is taken, so a pinch begun on the conversation stays the conversation's
	start: { x: number; y: number; t: number } | null; // where and when the first pointer went down
	moved: boolean; // it moved past DRAG_PX: a drag, not a tap
	pinch: number | null; // the two pointers' distance at the last pinch step
	wheel: number; // wheel distance not yet turned into a step
	wheelAt: number; // when the last wheel event came (ms)
};
export const NO_GESTURE: Gesture = { pointers: [], others: [], start: null, moved: false, pinch: null, wheel: 0, wheelAt: Number.NEGATIVE_INFINITY };
// onWorld: the pointer went down on the world (I1: worldMayTake(startOf(path))). The engine passes every pointer's down,
// up and cancel, wherever it went down, so the mapper knows about fingers on the conversation too.
export type PointerIn = { kind: "down" | "move" | "up" | "cancel"; id: number; x: number; y: number; t: number; onWorld: boolean };
export type WheelIn = { dx: number; dy: number; mode: 0 | 1 | 2; ctrl: boolean; x: number; y: number; t: number; onWorld: boolean };
// w, h: the world region's size, CSS px. him: where his feet are on it, CSS px, when any of him is in view (null or left
// out: he is off screen, or the caller does not say).
export type Spot = { x: number; y: number };
export type KeyIn = { key: string; w: number; h: number; him?: Spot | null };

export const DRAG_PX = 4;
export const TAP_PX = 6;
export const TAP_MS = 300;
export const PINCH_STEP = 1.25;
export const WHEEL_STEP = 100;
export const WHEEL_LINE = 16;
export const WHEEL_PAGE = 400;
export const PINCH_WHEEL = 10; // a trackpad pinch arrives as a wheel with ctrl, in small amounts
export const WHEEL_RESET_MS = 400;
export const KEY_PAN = 0.125;
const MAX_WHEEL_STEPS = 2;

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function onPointer(g: Gesture, e: PointerIn): { g: Gesture; out: Intent[] } {
	const out: Intent[] = [];
	const tracked = g.pointers.some((p) => p.id === e.id);
	// A finger off the world is remembered until it lifts: while one is down, no new world finger is taken.
	if (g.others.includes(e.id)) return { g: e.kind === "up" || e.kind === "cancel" ? { ...g, others: g.others.filter((id) => id !== e.id) } : g, out };
	if (e.kind === "down") {
		if (!e.onWorld) return { g: { ...g, others: [...g.others, e.id] }, out };
		if (tracked || g.others.length > 0) return { g, out };
		const pointers = [...g.pointers, { id: e.id, x: e.x, y: e.y }];
		if (pointers.length === 1) return { g: { ...g, pointers, start: { x: e.x, y: e.y, t: e.t }, moved: false, pinch: null }, out };
		if (pointers.length === 2) return { g: { ...g, pointers, moved: true, pinch: dist(pointers[0], pointers[1]) }, out };
		return { g: { ...g, pointers }, out };
	}
	if (!tracked) return { g, out };
	if (e.kind === "move") {
		const before = g.pointers;
		const pointers = before.map((p) => (p.id === e.id ? { id: p.id, x: e.x, y: e.y } : p));
		if (pointers.length === 1) {
			const s = g.start ?? { x: before[0].x, y: before[0].y, t: e.t };
			const moved = g.moved || Math.hypot(e.x - s.x, e.y - s.y) > DRAG_PX;
			if (moved) {
				const from = g.moved ? before[0] : s;
				out.push({ kind: "pan", dx: e.x - from.x, dy: e.y - from.y });
			}
			return { g: { ...g, pointers, moved }, out };
		}
		const [a0, b0] = before;
		const [a1, b1] = pointers;
		const m0 = mid(a0, b0);
		const m1 = mid(a1, b1);
		if (m1.x !== m0.x || m1.y !== m0.y) out.push({ kind: "pan", dx: m1.x - m0.x, dy: m1.y - m0.y });
		let pinch = g.pinch ?? dist(a1, b1);
		const d = dist(a1, b1);
		if (pinch > 0 && d / pinch >= PINCH_STEP) {
			out.push({ kind: "zoom", dir: 1, x: m1.x, y: m1.y });
			pinch = d;
		} else if (pinch > 0 && d / pinch <= 1 / PINCH_STEP) {
			out.push({ kind: "zoom", dir: -1, x: m1.x, y: m1.y });
			pinch = d;
		}
		return { g: { ...g, pointers, pinch }, out };
	}
	const pointers = g.pointers.filter((p) => p.id !== e.id);
	const s = g.start;
	if (e.kind === "up" && g.pointers.length === 1 && !g.moved && s && e.t - s.t <= TAP_MS && Math.hypot(e.x - s.x, e.y - s.y) <= TAP_PX) out.push({ kind: "tap", x: e.x, y: e.y });
	if (pointers.length === 0) return { g: { ...g, pointers, start: null, moved: false, pinch: null }, out };
	if (pointers.length === 1) return { g: { ...g, pointers, start: { x: pointers[0].x, y: pointers[0].y, t: e.t }, moved: true, pinch: null }, out };
	return { g: { ...g, pointers, pinch: dist(pointers[0], pointers[1]) }, out };
}

export function onWheel(g: Gesture, e: WheelIn): { g: Gesture; out: Intent[] } {
	if (!e.onWorld) return { g, out: [] };
	const unit = e.mode === 1 ? WHEEL_LINE : e.mode === 2 ? WHEEL_PAGE : 1;
	if (!e.ctrl && Math.abs(e.dx) > Math.abs(e.dy)) return { g, out: [{ kind: "pan", dx: -e.dx * unit, dy: 0 }] };
	let wheel = (e.t - g.wheelAt > WHEEL_RESET_MS ? 0 : g.wheel) + e.dy * unit * (e.ctrl ? PINCH_WHEEL : 1);
	const out: Intent[] = [];
	while (wheel >= WHEEL_STEP) {
		if (out.length < MAX_WHEEL_STEPS) out.push({ kind: "zoom", dir: -1, x: e.x, y: e.y });
		wheel -= WHEEL_STEP;
	}
	while (wheel <= -WHEEL_STEP) {
		if (out.length < MAX_WHEEL_STEPS) out.push({ kind: "zoom", dir: 1, x: e.x, y: e.y });
		wheel += WHEEL_STEP;
	}
	return { g: { ...g, wheel, wheelAt: e.t }, out };
}

// A zoom step from the keys or the zoom control: about him when he is on screen (so three steps in at home do not push
// him off the bottom), else about the middle of the view. The wheel and the pinch zoom about the pointer.
export const zoomIntent = (dir: 1 | -1, w: number, h: number, him?: Spot | null): Intent => ({ kind: "zoom", dir, x: him ? him.x : w / 2, y: him ? him.y : h / 2 });

export function onKey(e: KeyIn): Intent[] {
	switch (e.key) {
		case "+":
		case "=":
			return [zoomIntent(1, e.w, e.h, e.him)];
		case "-":
		case "_":
			return [zoomIntent(-1, e.w, e.h, e.him)];
		case "ArrowLeft":
			return [{ kind: "pan", dx: e.w * KEY_PAN, dy: 0 }];
		case "ArrowRight":
			return [{ kind: "pan", dx: -e.w * KEY_PAN, dy: 0 }];
		case "ArrowUp":
			return [{ kind: "pan", dx: 0, dy: e.h * KEY_PAN }];
		case "ArrowDown":
			return [{ kind: "pan", dx: 0, dy: -e.h * KEY_PAN }];
		case "Home":
			return [{ kind: "home" }];
		default:
			return [];
	}
}

// The conversation wins (spec 3.2): a gesture is the world's only when it starts on the world, not on the conversation
// column's content and not on a control.
export const worldMayTake = (start: { inColumn: boolean; onControl: boolean }): boolean => !start.inColumn && !start.onControl;
// True while a pointer is down on the world: frames come from requestAnimationFrame then.
export const interacting = (g: Gesture): boolean => g.pointers.length > 0;
