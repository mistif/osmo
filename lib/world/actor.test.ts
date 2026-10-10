import { describe, expect, it } from "vitest";
import {
	BLINK_MS, BLINK_WINDOW_MS, BLOCK_GAP_MS, BREATH_IN_MS, BREATH_MS, FOLLOW_UP_MS, LAY_MS, MAX_DT, PRESENT_MS, TRAIL_MS, TURN_MS,
	blinking, facingViewer, look, newActor, nextLookIn, pose, step,
	type Actor, type ActorEvent, type ActorWorld,
} from "./actor";

const W: ActorWorld = { next: 200, restX: 760, speed: 48, held: false };
const tick = (now: number, dt = 50): ActorEvent => ({ type: "tick", now, dt });
// Ticks every dt ms after `from`, up to and including `to`.
function run(a: Actor, from: number, to: number, w: ActorWorld = W, dt = 50) {
	let laid = 0;
	let maxMove = 0;
	for (let t = from + dt; t <= to; t += dt) {
		const s = step(a, tick(t, dt), w);
		maxMove = Math.max(maxMove, Math.abs(s.actor.x - a.x));
		a = s.actor;
		if (s.laid) laid++;
	}
	return { a, laid, maxMove };
}
const send = (a: Actor, e: ActorEvent, w: ActorWorld = W) => step(a, e, w).actor;

describe("building on his own", () => {
	it("walks to the next block, kneels, and lays it once", () => {
		const walking = run(newActor(100, 0, 12), 0, 50).a;
		expect(walking.kind).toBe("walking");
		expect(walking.dir).toBe(1);
		const there = run(walking, 50, 2300).a; // 100 px at 48 px/s: he arrives at 2150
		expect(there.kind).toBe("building");
		expect(there.x).toBe(200);
		const done = run(there, 2300, 2300 + LAY_MS + 100);
		expect(done.laid).toBe(1);
		expect(done.a.kind).toBe("idle");
	});
	it("lays one block every three seconds when he stands at it", () => {
		// kneels at 50, lays at 1250, waits until 3050, lays at 4250, then 7250: three by 10 s
		expect(run(newActor(200, 0, 12), 0, 10_000).laid).toBe(3);
		expect(LAY_MS + BLOCK_GAP_MS).toBe(3000);
	});
	it("waits when there is nothing to build", () => {
		expect(run(newActor(100, 0, 12), 0, 5000, { ...W, next: null }).a.kind).toBe("idle");
	});
});

describe("when Gur speaks", () => {
	it("stops mid-block without laying it, faces him, and starts the block again afterwards", () => {
		const building = run(newActor(200, 0, 12), 0, 650).a; // kneeling since 50
		expect(building.kind).toBe("building");
		const turned = send(building, { type: "message", now: 700 });
		expect(turned.kind).toBe("turning");
		expect(turned.toward).toBe("viewer");
		const faced = run(turned, 700, 700 + TURN_MS);
		expect(faced.a.kind).toBe("facing");
		expect(faced.laid).toBe(0);
		const back = run(faced.a, 700 + TURN_MS, 700 + FOLLOW_UP_MS + 50); // quiet for the window: turns back at 6700
		expect(back.a.kind).toBe("turning");
		expect(back.a.toward).toBe("work");
		expect(back.laid).toBe(0);
		const from = 700 + FOLLOW_UP_MS + TURN_MS + 100; // idle at 7000, kneels at 7050
		const kneel = run(back.a, 700 + FOLLOW_UP_MS + 50, from);
		expect(kneel.a.kind).toBe("building");
		expect(run(kneel.a, from, kneel.a.since + LAY_MS - 50).laid).toBe(0);
		expect(run(kneel.a, from, kneel.a.since + LAY_MS).laid).toBe(1);
	});
	it("keeps facing while he speaks, while the conversation is held, and inside the follow-up window", () => {
		const facing = run(send(newActor(200, 0, 12), { type: "message", now: 0 }), 0, TURN_MS).a;
		expect(facing.kind).toBe("facing");
		const speaking = send(facing, { type: "reply", now: 400 });
		expect(run(speaking, 400, 400 + 3 * FOLLOW_UP_MS).a.kind).toBe("facing");
		const quiet = send(speaking, { type: "replyDone", now: 500 });
		expect(run(quiet, 500, 500 + 3 * FOLLOW_UP_MS, { ...W, held: true }).a.kind).toBe("facing");
		expect(run(quiet, 500, 500 + FOLLOW_UP_MS - 50).a.kind).toBe("facing");
		expect(run(quiet, 500, 500 + FOLLOW_UP_MS).a.kind).toBe("turning");
	});
	it("turns to face a reply that comes without a message", () => {
		const r = send(newActor(200, 0, 12), { type: "reply", now: 10 });
		expect(r.kind).toBe("turning");
		expect(r.talk).toBe("speaking");
	});
	it("ends the conversation at once on rest, unless he is speaking or it is held", () => {
		const facing = run(send(newActor(200, 0, 12), { type: "message", now: 0 }), 0, TURN_MS).a;
		expect(facingViewer(facing)).toBe(true);
		expect(send(facing, { type: "rest", now: 400 }).kind).toBe("turning");
		expect(send(send(facing, { type: "reply", now: 350 }), { type: "rest", now: 400 }).kind).toBe("facing");
		expect(send(facing, { type: "rest", now: 400 }, { ...W, held: true }).kind).toBe("facing");
	});
});

describe("the tab and the clock", () => {
	it("stops where he is when the tab is hidden mid-walk, ignores time while hidden, and goes on from there", () => {
		const walking = run(newActor(100, 0, 12), 0, 1000).a;
		expect(walking.kind).toBe("walking");
		const hidden = send(walking, { type: "hidden", now: 1000 });
		expect(hidden.kind).toBe("idle");
		expect(hidden.x).toBe(walking.x);
		expect(run(hidden, 1000, 60_000).a).toEqual(hidden);
		const back = send(hidden, { type: "visible", now: 60_000 });
		expect(back.hidden).toBe(false);
		expect(back.x).toBe(walking.x);
		const r = run(back, 60_000, 60_000 + BLOCK_GAP_MS + 100);
		expect(r.a.kind).toBe("walking");
		expect(r.maxMove).toBeLessThanOrEqual((48 * 50) / 1000 + 1e-9);
	});
	it("never moves further than a quarter second of walking in one tick, however long the tick", () => {
		const walking = run(newActor(100, 0, 12), 0, 100).a;
		const after = step(walking, { type: "tick", now: 5 * 3_600_000, dt: 5 * 3_600_000 }, W).actor;
		expect(Math.abs(after.x - walking.x)).toBeLessThanOrEqual((48 * MAX_DT) / 1000);
		expect(step(walking, { type: "tick", now: 5 * 3_600_000, dt: 5 * 3_600_000 }, W).laid).toBe(false);
	});
});

describe("a bad dt", () => {
	it("counts a NaN, infinite or negative dt as 0, so he never stalls on it", () => {
		const walking = run(newActor(100, 0, 12), 0, 100).a;
		for (const dt of [Number.NaN, Number.POSITIVE_INFINITY, -50]) {
			const s = step(walking, { type: "tick", now: 150, dt }, W);
			expect(s.actor.x).toBe(walking.x);
			expect(s.laid).toBe(false);
		}
		const next = run(step(walking, { type: "tick", now: 150, dt: Number.NaN }, W).actor, 150, 400).a;
		expect(Number.isFinite(next.x)).toBe(true);
		expect(next.x).toBeGreaterThan(walking.x);
	});
});

describe("night", () => {
	it("walks to the bench and rests when nobody has spoken", () => {
		const night = newActor(700, 0, 23);
		expect(night.night).toBe(true);
		const r = run(night, 0, 3000);
		expect(r.a.kind).toBe("resting");
		expect(r.a.x).toBe(760);
		expect(r.laid).toBe(0);
	});
	it("keeps building at night while Gur is there, and rests once he has been quiet for PRESENT_MS", () => {
		expect(run({ ...newActor(200, 0, 23), lastMessage: 0 }, 0, 2000).laid).toBe(1);
		const later = { ...newActor(200, PRESENT_MS, 23), lastMessage: 0 };
		const r = run(later, PRESENT_MS, PRESENT_MS + 3000, { ...W, restX: 260 });
		expect(r.a.kind).toBe("resting");
		expect(r.laid).toBe(0);
	});
	it("stands up when the day comes", () => {
		const resting: Actor = { ...newActor(760, 0, 23), kind: "resting" };
		const day = send(resting, { type: "hour", now: 100, hour: 7 });
		expect(day.night).toBe(false);
		expect(run(day, 100, 200).a.kind).not.toBe("resting");
	});
});

describe("rooms as places (phase 2)", () => {
	it("walks to the room Gur opened and waits there, laying nothing", () => {
		const r = run(newActor(200, 0, 12), 0, 6000, { ...W, visit: 400 });
		expect(r.a.kind).toBe("idle");
		expect(r.a.x).toBe(400);
		expect(r.laid).toBe(0);
		expect(run(r.a, 6000, 9000, { ...W, visit: 400 }).a).toEqual(r.a);
	});
	it("leaves a block unfinished to go, and goes back to work when the panel closes", () => {
		const kneeling = run(newActor(200, 0, 12), 0, 100).a;
		expect(kneeling.kind).toBe("building");
		const away = run(kneeling, 100, 2400, { ...W, visit: 300 });
		expect(away.laid).toBe(0);
		expect(away.a.x).toBe(300);
		const back = run(away.a, 2400, 8000);
		expect(back.a.x).toBe(200);
		expect(back.laid).toBeGreaterThan(0);
	});
	it("goes to the room even at night, and to the bench once the panel closes", () => {
		const there = run(newActor(700, 0, 23), 0, 3000, { ...W, visit: 650 });
		expect([there.a.kind, there.a.x]).toEqual(["idle", 650]);
		const rest = run(there.a, 3000, 6000);
		expect([rest.a.kind, rest.a.x]).toEqual(["resting", 760]);
		expect(run(rest.a, 6000, 6100, { ...W, visit: 650 }).a.kind).not.toBe("resting");
	});
	it("follows Gur from room to room without stopping", () => {
		const walking = run(newActor(200, 0, 12), 0, 500, { ...W, visit: 600 }).a;
		expect(walking.kind).toBe("walking");
		const turned = step(walking, tick(550), { ...W, visit: 100 }).actor;
		expect(turned.kind).toBe("walking");
		expect(turned.dir).toBe(-1);
	});
	it("waits in the yard when nothing is left to build, and builds when there is", () => {
		const yard = run(newActor(100, 0, 12), 0, 12_000, { ...W, next: null, yard: 520 });
		expect([yard.a.kind, yard.a.x]).toEqual(["idle", 520]);
		expect(run(yard.a, 12_000, 30_000, { ...W, yard: 520 }).laid).toBeGreaterThan(0);
	});
	it("after a talk at a room, stands at the room again", () => {
		const at = run(newActor(300, 0, 12), 0, 100, { ...W, visit: 300 }).a;
		const facing = run(send(at, { type: "message", now: 200 }, { ...W, visit: 300 }), 200, 600, { ...W, visit: 300 }).a;
		expect(facing.kind).toBe("facing");
		const after = run(facing, 600, 600 + FOLLOW_UP_MS + TURN_MS + 500, { ...W, visit: 300 }).a;
		expect([after.kind, after.x]).toEqual(["idle", 300]);
	});
});

describe("how he looks", () => {
	it("walks in six frames, facing the way he goes", () => {
		const left = run(newActor(300, 0, 12), 0, 50).a; // the next block is to his left
		expect(left.dir).toBe(-1);
		const frames = new Set(Array.from({ length: 12 }, (_, i) => look(left, left.since + i * 50, "warm").frame));
		expect([...frames].sort()).toEqual(["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"]);
		expect(look(left, left.since, "warm").flip).toBe(true);
		expect(look(left, left.since, "warm").face).toBeNull();
	});
	it("shows his face only toward the viewer: pupils on Gur while listening, wandering while he speaks", () => {
		const speaking = pose("facing", 200, 0);
		const listening: Actor = { ...speaking, talk: "listening" };
		expect(new Set(Array.from({ length: 40 }, (_, i) => look(listening, i * 100, "tired").gaze))).toEqual(new Set([0]));
		expect(new Set(Array.from({ length: 40 }, (_, i) => look(speaking, i * 100, "tired").gaze))).toEqual(new Set([0, 1]));
		expect(look(speaking, 0, "tired").face).toBe("tired");
		expect(look(pose("building", 200, 0), 0, "warm").face).toBeNull();
	});
	it("turns through three frames and sits at night", () => {
		const t = pose("turning", 200, 0);
		expect([0, 100, 200].map((ms) => look(t, ms, "warm").frame)).toEqual(["turn-1", "turn-2", "turn-3"]);
		expect(look(t, 200, "warm").face).toBe("warm");
		expect(look({ ...t, toward: "work" }, 0, "warm").frame).toBe("turn-3");
		expect(look(pose("resting", 760, 0), 0, "warm").frame).toBe("sit-1");
	});
	it("breathes in for 700 ms at the end of every 3.2 s, standing or facing Gur (polish pass)", () => {
		const idle = newActor(200, 0, 12);
		const frameAt = (a: Actor, t: number) => look(a, t, "warm").frame;
		expect(frameAt(idle, 0)).toBe("idle-1");
		expect(frameAt(idle, BREATH_MS - BREATH_IN_MS - 1)).toBe("idle-1");
		expect(frameAt(idle, BREATH_MS - BREATH_IN_MS)).toBe("idle-2");
		expect(frameAt(idle, BREATH_MS)).toBe("idle-1");
		const facing = { ...pose("facing", 200, 0), talk: "listening" as const };
		expect(frameAt(facing, BREATH_MS - 1)).toBe("face-2");
		expect(frameAt(facing, 100)).toBe("face-1");
		expect(look(idle, BREATH_MS - 1, "warm", false).frame).toBe("idle-1"); // reduced motion: still
	});
	it("blinks for 140 ms, 3 to 6 s apart, only facing Gur, never under reduced motion (polish pass)", () => {
		const starts: number[] = [];
		for (let t = 0; t < 120_000; t++) if (blinking(t) && !blinking(t - 1)) starts.push(t);
		expect(starts.length).toBeGreaterThan(18);
		for (let i = 1; i < starts.length; i++) {
			expect(starts[i] - starts[i - 1]).toBeGreaterThan(3000);
			expect(starts[i] - starts[i - 1]).toBeLessThan(6000);
		}
		const on = starts[3];
		expect(blinking(on + BLINK_MS - 1)).toBe(true);
		expect(blinking(on + BLINK_MS)).toBe(false);
		const facing = { ...pose("facing", 200, 0), talk: "listening" as const };
		expect(look(facing, on, "warm").blink).toBe(true);
		expect(look(facing, on, "warm", false).blink).toBe(false);
		expect(look(newActor(200, 0, 12), on, "warm").blink).toBe(false); // in profile his eye is drawn in the frame
		expect(blinking(Number.NaN)).toBe(false);
		expect(BLINK_WINDOW_MS).toBe(4500);
	});
	it("trails his scarf in two cells that swap every 160 ms while he walks, and only then (polish pass)", () => {
		const walking = run(newActor(100, 0, 12), 0, 50).a;
		expect(walking.kind).toBe("walking");
		const trails = Array.from({ length: 4 }, (_, i) => look(walking, walking.since + i * TRAIL_MS, "warm").trail);
		expect(trails).toEqual([0, 1, 0, 1]);
		expect(look(newActor(100, 0, 12), 0, "warm").trail).toBeNull();
		expect(look(pose("building", 100, 0), 0, "warm").trail).toBeNull();
	});
	it("says when his look will change by itself, so the loop can wake for it (polish pass)", () => {
		const idle = newActor(200, 0, 12);
		expect(nextLookIn(idle, 0)).toBe(BREATH_MS - BREATH_IN_MS);
		expect(nextLookIn(idle, BREATH_MS - 100)).toBe(100);
		expect(nextLookIn(idle, 0, false)).toBeNull();
		expect(nextLookIn({ ...idle, hidden: true }, 0)).toBeNull();
		expect(nextLookIn({ ...idle, kind: "walking" }, 0)).toBeNull();
		expect(nextLookIn(pose("resting", 200, 0), 0)).toBeNull();
		// Facing: whichever comes first, a breath or a blink's start or end; never 0, and the look really changes then.
		const facing = { ...pose("facing", 200, 0), talk: "listening" as const };
		for (let now = 0; now < 30_000; now += 777) {
			const ms = nextLookIn(facing, now);
			expect(ms).not.toBeNull();
			if (ms === null) continue;
			expect(ms).toBeGreaterThanOrEqual(1);
			expect(ms).toBeLessThanOrEqual(BREATH_MS);
			const before = look(facing, now + ms - 1, "warm");
			const after = look(facing, now + ms, "warm");
			expect(before.frame !== after.frame || before.blink !== after.blink).toBe(true);
		}
	});
	it("poses every state for the dev page", () => {
		for (const k of ["idle", "walking", "building", "turning", "facing", "resting"] as const) expect(pose(k, 10, 0).kind).toBe(k);
	});
});
