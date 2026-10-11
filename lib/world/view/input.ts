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
export type KeyIn = { key: string; w: number; h: number }; // w, h: the world region's size, CSS px

export function onPointer(g: Gesture, e: PointerIn): { g: Gesture; out: Intent[] } {
	void [g, e];
	throw new Error("not built: onPointer");
}
export function onWheel(g: Gesture, e: WheelIn): { g: Gesture; out: Intent[] } {
	void [g, e];
	throw new Error("not built: onWheel");
}
export function onKey(e: KeyIn): Intent[] {
	void e;
	throw new Error("not built: onKey");
}
// The conversation wins (spec 3.2): a gesture is the world's only when it starts on the world, not on the conversation
// column's content and not on a control.
export function worldMayTake(start: { inColumn: boolean; onControl: boolean }): boolean {
	void start;
	throw new Error("not built: worldMayTake");
}
// True while a pointer is down on the world: frames come from requestAnimationFrame then.
export function interacting(g: Gesture): boolean {
	void g;
	throw new Error("not built: interacting");
}
