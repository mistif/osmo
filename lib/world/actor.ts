// Him (spec 3), pure. The world feeds him events and ticks and tells him where the next block is; he answers with
// what he is doing and whether he laid a block this step. He never teleports: one tick moves him at most MAX_DT of
// walking, and a hidden tab freezes him where he is.
import { FOLLOW_UP_MS } from "../voice/machine";
import type { FaceId, FrameName, Gaze } from "./osmo-sprite";
import { isNight } from "./sky";

export { FOLLOW_UP_MS };
export type ActorKind = "idle" | "walking" | "building" | "turning" | "facing" | "resting";
export type Talk = "quiet" | "listening" | "speaking";
type Purpose = "build" | "rest" | "visit";
export type Actor = {
	kind: ActorKind;
	x: number; // his feet's centre, world px
	dir: 1 | -1; // the way his profile faces
	since: number; // when this kind began (ms); drives the animation
	target: number | null;
	purpose: Purpose | null;
	toward: "viewer" | "work"; // which way a turn goes; "viewer" also while facing
	talk: Talk;
	quietSince: number; // the last message, or the end of his last reply
	lastMessage: number | null;
	nextAt: number; // the earliest he may start the next block
	night: boolean;
	hidden: boolean;
};
export type ActorEvent =
	| { type: "message"; now: number }
	| { type: "reply"; now: number }
	| { type: "replyDone"; now: number }
	| { type: "rest"; now: number }
	| { type: "tick"; now: number; dt: number }
	| { type: "hour"; now: number; hour: number }
	| { type: "visible"; now: number }
	| { type: "hidden"; now: number };
// What the world tells him on each step.
export type ActorWorld = {
	next: number | null; // where he stands to lay the next block (world px); null when nothing is left to build
	restX: number; // where he sits at night (the hall's step, since phase 2)
	speed: number; // world px per second (face.ts)
	held: boolean; // the conversation is still open: the voice is in conversation, he is thinking, or speaking
	visit?: number | null; // phase 2: the room whose panel is open (world px); he goes there and waits, even at night
	yard?: number | null; // phase 2: where he waits when nothing is left to build (the yard before the hall)
};
export type Step = { actor: Actor; laid: boolean };

export const TURN_MS = 300;
export const LAY_MS = 1200;
export const BLOCK_GAP_MS = 1800;
export const PRESENT_MS = 10 * 60_000;
export const MAX_DT = 250;

export function newActor(x: number, now: number, hour: number): Actor {
	return {
		kind: "idle", x, dir: 1, since: now, target: null, purpose: null, toward: "work", talk: "quiet",
		quietSince: now, lastMessage: null, nextAt: now, night: isNight(hour), hidden: false,
	};
}

export const facingViewer = (a: Actor): boolean => a.kind === "facing" || (a.kind === "turning" && a.toward === "viewer");
const present = (a: Actor, now: number) => a.lastMessage !== null && now - a.lastMessage < PRESENT_MS;
const turn = (a: Actor, toward: "viewer" | "work", now: number): Actor => ({ ...a, kind: "turning", toward, since: now, target: null, purpose: null });

export function step(a: Actor, e: ActorEvent, w: ActorWorld): Step {
	const to = (actor: Actor): Step => ({ actor, laid: false });
	if (e.type === "hour") return to({ ...a, night: isNight(e.hour) });
	if (e.type === "visible") return to({ ...a, hidden: false, since: e.now, nextAt: e.now + BLOCK_GAP_MS, quietSince: e.now });
	if (a.hidden) return to(a);
	switch (e.type) {
		case "hidden":
			return to({ ...a, kind: a.kind === "resting" ? "resting" : "idle", hidden: true, since: e.now, target: null, purpose: null, toward: "work", talk: "quiet" });
		case "message": {
			const talk: Talk = a.talk === "speaking" ? "speaking" : "listening";
			const heard: Actor = { ...a, talk, quietSince: e.now, lastMessage: e.now };
			return to(facingViewer(a) ? heard : turn(heard, "viewer", e.now));
		}
		case "reply": {
			const speaking: Actor = { ...a, talk: "speaking", quietSince: e.now };
			return to(facingViewer(a) ? speaking : turn(speaking, "viewer", e.now));
		}
		case "replyDone":
			return to({ ...a, talk: "quiet", quietSince: e.now });
		case "rest":
			return to(facingViewer(a) && a.talk !== "speaking" && !w.held ? turn({ ...a, talk: "quiet" }, "work", e.now) : a);
		case "tick":
			return tick(a, e.now, Number.isFinite(e.dt) ? Math.min(MAX_DT, Math.max(0, e.dt)) : 0, w);
	}
}

// Where he wants to be and why, in this order: the room Gur opened, the bench at night, the next block (once the gap
// after the last one has passed, unless he is already on his way), or the yard when nothing is left to build.
function want(a: Actor, now: number, w: ActorWorld, onTheWay: boolean): { goal: number; purpose: Purpose } | null {
	if (w.visit != null) return { goal: w.visit, purpose: "visit" };
	if (a.night && !present(a, now)) return { goal: w.restX, purpose: "rest" };
	if (w.next !== null) return onTheWay || now >= a.nextAt ? { goal: w.next, purpose: "build" } : null;
	return w.yard != null ? { goal: w.yard, purpose: "visit" } : null;
}

function tick(a: Actor, now: number, dt: number, w: ActorWorld): Step {
	const to = (actor: Actor, laid = false): Step => ({ actor, laid });
	const idle = (x: Actor): Actor => ({ ...x, kind: "idle", since: now, target: null, purpose: null, toward: "work" });
	const restWanted = a.night && !present(a, now);
	const visiting = w.visit != null;
	// Arriving: kneel at a block, sit at the bench, or just stand at a room or in the yard.
	const arrive = (x: Actor, goal: number, purpose: Purpose): Actor =>
		purpose === "visit" ? { ...idle(x), x: goal } : { ...x, x: goal, kind: purpose === "rest" ? "resting" : "building", since: now, target: null, purpose: null };
	switch (a.kind) {
		case "turning":
			if (now - a.since < TURN_MS) return to(a);
			return to(a.toward === "viewer" ? { ...a, kind: "facing", since: now } : { ...idle(a), nextAt: now });
		case "facing":
			if (a.talk === "speaking" || w.held || now - a.quietSince < FOLLOW_UP_MS) return to(a);
			return to(turn({ ...a, talk: "quiet" }, "work", now));
		case "resting":
			return to(restWanted && !visiting ? a : idle(a));
		case "idle": {
			const g = want(a, now, w, false);
			if (g === null) return to(a);
			if (Math.abs(g.goal - a.x) < 0.5) return to(g.purpose === "visit" ? a : arrive(a, g.goal, g.purpose));
			return to({ ...a, kind: "walking", since: now, target: g.goal, purpose: g.purpose, dir: g.goal > a.x ? 1 : -1 });
		}
		case "walking": {
			// The goal may change under him (the next block, another room, nightfall): follow it while the reason is the
			// same, or stop where he is and choose again on the next tick.
			const g = want(a, now, w, true);
			if (g === null || g.purpose !== a.purpose) return to(idle(a));
			const stride = (w.speed * dt) / 1000;
			const gap = g.goal - a.x;
			if (Math.abs(gap) <= stride) return to(arrive(a, g.goal, g.purpose));
			return to({ ...a, x: a.x + Math.sign(gap) * stride, target: g.goal, dir: gap > 0 ? 1 : -1 });
		}
		case "building":
			if (visiting || restWanted || w.next === null || Math.abs(w.next - a.x) >= 0.5) return to(idle(a));
			if (now - a.since < LAY_MS) return to(a);
			return to({ ...idle(a), nextAt: now + BLOCK_GAP_MS }, true);
	}
}

export type Look = { frame: FrameName; flip: boolean; face: FaceId | null; gaze: Gaze };
const IDLE: readonly FrameName[] = ["idle-1", "idle-2"];
const WALK: readonly FrameName[] = ["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"];
const BUILD: readonly FrameName[] = ["build-1", "build-2", "build-3", "build-4"];
const TURN: readonly FrameName[] = ["turn-1", "turn-2", "turn-3"];
const FACE: readonly FrameName[] = ["face-1", "face-2"];
// While he speaks his eyes go slightly off Gur and back: 600 ms away in every 2.4 s.
const speakingGaze = (t: number): Gaze => (Math.floor(t / 600) % 4 === 1 ? 1 : 0);

// The frame to draw now. `face` comes from his mood (face.ts) and shows only toward the viewer.
export function look(a: Actor, now: number, face: FaceId): Look {
	const t = Math.max(0, now - a.since);
	const flip = a.dir < 0;
	const cycle = (names: readonly FrameName[], ms: number) => names[Math.floor(t / ms) % names.length];
	switch (a.kind) {
		case "walking":
			return { frame: cycle(WALK, 100), flip, face: null, gaze: 0 };
		case "building":
			return { frame: cycle(BUILD, LAY_MS / BUILD.length), flip, face: null, gaze: 0 };
		case "resting":
			return { frame: "sit-1", flip: false, face: null, gaze: 0 };
		case "turning": {
			const order = a.toward === "viewer" ? TURN : [...TURN].reverse();
			const frame = order[Math.min(2, Math.floor(t / (TURN_MS / 3)))];
			return { frame, flip, face: frame === "turn-3" ? face : null, gaze: 0 };
		}
		case "facing":
			return { frame: cycle(FACE, 700), flip: false, face, gaze: a.talk === "speaking" ? speakingGaze(t) : 0 };
		default:
			return { frame: cycle(IDLE, 600), flip, face: null, gaze: 0 };
	}
}

// A still pose of any state, for /dev/world.
export function pose(kind: ActorKind, x: number, now: number, hour = 12): Actor {
	const a = newActor(x, now, hour);
	if (kind === "walking") return { ...a, kind, target: x + 64, purpose: "build" };
	if (kind === "turning") return { ...a, kind, toward: "viewer" };
	if (kind === "facing") return { ...a, kind, toward: "viewer", talk: "speaking" };
	return { ...a, kind };
}
