import { describe, expect, it } from "vitest";
import { interacting, NO_GESTURE, onKey, onPointer, onWheel, worldMayTake, zoomIntent, type Gesture, type Intent, type PointerIn } from "./input";

const P = (kind: PointerIn["kind"], id: number, x: number, y: number, t: number, onWorld = true): PointerIn => ({ kind, id, x, y, t, onWorld });
const play = (events: PointerIn[], g: Gesture = NO_GESTURE) => {
	const out: Intent[] = [];
	for (const e of events) {
		const r = onPointer(g, e);
		g = r.g;
		out.push(...r.out);
	}
	return { g, out };
};
const wheel = (dy: number, t: number, over: Partial<{ dx: number; mode: 0 | 1 | 2; ctrl: boolean; onWorld: boolean }> = {}) => ({ dx: 0, dy, mode: 0 as const, ctrl: false, x: 300, y: 200, t, onWorld: true, ...over });

describe("the conversation wins (spec 3.2)", () => {
	it("gives the world only gestures that start on it", () => {
		expect(worldMayTake({ inColumn: true, onControl: false })).toBe(false);
		expect(worldMayTake({ inColumn: false, onControl: true })).toBe(false);
		expect(worldMayTake({ inColumn: false, onControl: false })).toBe(true);
	});
	it("turns nothing into an intent that started on the conversation, however far it goes", () => {
		expect(play([P("down", 1, 100, 100, 0, false), P("move", 1, 160, 100, 20), P("move", 1, 400, 300, 40), P("up", 1, 400, 300, 60)]).out).toEqual([]);
		expect(onWheel(NO_GESTURE, wheel(300, 0, { onWorld: false })).out).toEqual([]);
	});
	it("moves nothing in a pinch whose first finger went down on the conversation, until every finger is up", () => {
		const r = play([P("down", 1, 100, 100, 0, false), P("down", 2, 200, 100, 5), P("move", 2, 260, 100, 20), P("move", 2, 320, 140, 40), P("move", 1, 60, 100, 45)]);
		expect(r.out).toEqual([]);
		expect(interacting(r.g)).toBe(false);
		const after = play([P("up", 1, 60, 100, 50, false), P("move", 2, 340, 140, 55), P("up", 2, 340, 140, 60), P("down", 3, 300, 300, 100), P("move", 3, 320, 300, 120)], r.g);
		expect(after.out).toEqual([{ kind: "pan", dx: 20, dy: 0 }]);
		expect(after.g.others).toEqual([]);
	});
	it("keeps a drag that began on the world when a finger then lands on the conversation", () => {
		const r = play([P("down", 1, 100, 100, 0), P("move", 1, 110, 100, 16), P("down", 2, 600, 300, 20, false), P("move", 1, 130, 100, 32)]);
		expect(r.out).toEqual([{ kind: "pan", dx: 10, dy: 0 }, { kind: "pan", dx: 20, dy: 0 }]);
		expect(r.g.others).toEqual([2]);
	});
	it("reads a short tap as a tap, never a drag", () => {
		expect(play([P("down", 2, 50, 50, 0), P("move", 2, 53, 51, 30), P("up", 2, 53, 51, 120)]).out).toEqual([{ kind: "tap", x: 53, y: 51 }]);
		expect(play([P("down", 2, 50, 50, 0), P("up", 2, 50, 50, 400)]).out).toEqual([]);
	});
});

describe("dragging and pinching", () => {
	it("pans with the finger once it has moved past 4 px, from where it went down", () => {
		const r = play([P("down", 1, 100, 100, 0), P("move", 1, 110, 100, 16), P("move", 1, 130, 90, 32), P("up", 1, 130, 90, 48)]);
		expect(r.out).toEqual([{ kind: "pan", dx: 10, dy: 0 }, { kind: "pan", dx: 20, dy: -10 }]);
		expect(interacting(r.g)).toBe(false);
	});
	it("zooms a step per quarter wider or narrower between two fingers, about their middle, and pans with the middle", () => {
		const r = play([P("down", 1, 100, 100, 0), P("down", 2, 200, 100, 5), P("move", 2, 230, 100, 20)]);
		expect(r.out).toEqual([{ kind: "pan", dx: 15, dy: 0 }, { kind: "zoom", dir: 1, x: 165, y: 100 }]);
		expect(interacting(r.g)).toBe(true);
		const out = play([P("move", 2, 180, 100, 40)], r.g).out;
		expect(out).toContainEqual({ kind: "zoom", dir: -1, x: 140, y: 100 });
	});
	it("ignores a third finger, and carries on as a drag when one of two lifts", () => {
		const two = play([P("down", 1, 100, 100, 0), P("down", 2, 200, 100, 5)]).g;
		expect(play([P("down", 3, 300, 300, 10), P("move", 3, 350, 300, 20)], two).out).toEqual([]);
		const one = play([P("up", 2, 200, 100, 30)], two).g;
		expect(play([P("move", 1, 120, 100, 40)], one).out).toEqual([{ kind: "pan", dx: 20, dy: 0 }]);
	});
});

describe("the wheel and the keys", () => {
	it("zooms out a step per 100 px of wheel, in toward the pointer the other way, and forgets a pause of 400 ms", () => {
		expect(onWheel(NO_GESTURE, wheel(100, 0)).out).toEqual([{ kind: "zoom", dir: -1, x: 300, y: 200 }]);
		const a = onWheel(NO_GESTURE, wheel(40, 0));
		expect(a.out).toEqual([]);
		expect(onWheel(a.g, wheel(70, 100)).out).toHaveLength(1);
		expect(onWheel(a.g, wheel(70, 600)).out).toEqual([]);
		expect(onWheel(NO_GESTURE, wheel(-12, 0, { ctrl: true })).out).toEqual([{ kind: "zoom", dir: 1, x: 300, y: 200 }]);
		expect(onWheel(NO_GESTURE, wheel(7, 0, { mode: 1 })).out).toHaveLength(1);
		expect(onWheel(NO_GESTURE, wheel(5000, 0)).out).toHaveLength(2);
	});
	it("pans sideways on a sideways scroll", () => {
		expect(onWheel(NO_GESTURE, wheel(3, 0, { dx: 40 })).out).toEqual([{ kind: "pan", dx: -40, dy: 0 }]);
	});
	it("zooms with + and -, pans an eighth of the view with the arrows, and goes home with Home", () => {
		const k = (key: string) => onKey({ key, w: 800, h: 600 });
		expect(k("+")).toEqual([{ kind: "zoom", dir: 1, x: 400, y: 300 }]);
		expect(k("=")).toEqual(k("+"));
		expect(k("-")).toEqual([{ kind: "zoom", dir: -1, x: 400, y: 300 }]);
		expect(k("ArrowLeft")).toEqual([{ kind: "pan", dx: 100, dy: 0 }]);
		expect(k("ArrowDown")).toEqual([{ kind: "pan", dx: 0, dy: -75 }]);
		expect(k("Home")).toEqual([{ kind: "home" }]);
		expect(k("a")).toEqual([]);
	});
});

describe("what the zoom keys and the zoom control zoom about", () => {
	const key = (k: string, him?: { x: number; y: number } | null) => onKey({ key: k, w: 800, h: 600, him });
	it("zoom about him when he is on screen, the keys and the control alike", () => {
		const him = { x: 320, y: 410 };
		expect(key("+", him)).toEqual([{ kind: "zoom", dir: 1, x: 320, y: 410 }]);
		expect(key("=", him)).toEqual(key("+", him));
		expect(key("-", him)).toEqual([{ kind: "zoom", dir: -1, x: 320, y: 410 }]);
		expect(key("_", him)).toEqual(key("-", him));
		expect(zoomIntent(1, 800, 600, him)).toEqual({ kind: "zoom", dir: 1, x: 320, y: 410 });
		expect(zoomIntent(-1, 800, 600, him)).toEqual({ kind: "zoom", dir: -1, x: 320, y: 410 });
	});
	it("zoom about the middle of the view when he is off screen, or when nothing is said", () => {
		for (const him of [null, undefined]) {
			expect(key("+", him)).toEqual([{ kind: "zoom", dir: 1, x: 400, y: 300 }]);
			expect(key("-", him)).toEqual([{ kind: "zoom", dir: -1, x: 400, y: 300 }]);
			expect(zoomIntent(1, 800, 600, him)).toEqual({ kind: "zoom", dir: 1, x: 400, y: 300 });
		}
	});
	it("leave the other keys alone, him or no him", () => {
		const him = { x: 320, y: 410 };
		expect(key("ArrowLeft", him)).toEqual(key("ArrowLeft"));
		expect(key("Home", him)).toEqual([{ kind: "home" }]);
	});
	it("leave the wheel and the pinch about the pointer", () => {
		expect(onWheel(NO_GESTURE, wheel(100, 0)).out).toEqual([{ kind: "zoom", dir: -1, x: 300, y: 200 }]);
	});
});
