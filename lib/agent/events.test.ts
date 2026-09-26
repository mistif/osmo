import { describe, expect, it } from "vitest";
import { defaultState, type EventRecord } from "./state";
import {
	EVENTS,
	applyEvent,
	argueOutlook,
	classifyUserEvents,
	detectArgument,
	kindFor,
	leaning,
	learnCoupling,
	pickEvent,
	type StoryEvent,
} from "./events";

const ev = (o: Partial<StoryEvent> = {}): StoryEvent => ({
	id: "x",
	kind: "k",
	valence: "tragic",
	text: "t",
	shifts: { sadness: 0.4 },
	...o,
});

describe("event library", () => {
	it("has 10 happy and 10 tragic events with unique ids", () => {
		expect(EVENTS.filter((e) => e.valence === "happy")).toHaveLength(10);
		expect(EVENTS.filter((e) => e.valence === "tragic")).toHaveLength(10);
		expect(new Set(EVENTS.map((e) => e.id)).size).toBe(20);
	});
});

describe("pickEvent", () => {
	it("starts with a happy event, then alternates", () => {
		expect(pickEvent([]).valence).toBe("happy");
		expect(pickEvent([{ id: "h1", valence: "happy" }]).valence).toBe("tragic");
		expect(
			pickEvent([
				{ id: "h1", valence: "happy" },
				{ id: "t1", valence: "tragic" },
			]).valence,
		).toBe("happy");
	});

	it("prefers events it has not seen", () => {
		const first = pickEvent([]);
		const second = pickEvent([
			{ id: first.id, valence: first.valence },
			{ id: "t1", valence: "tragic" },
		]);
		expect(second.id).not.toBe(first.id);
	});

	it("does not crash once everything has been seen", () => {
		const all: EventRecord[] = EVENTS.map((e) => ({ id: e.id, valence: e.valence }));
		expect(() => pickEvent(all)).not.toThrow();
	});
});

describe("applyEvent", () => {
	it("tragic events raise sadness and lower outlook; happy do the opposite", () => {
		const sad = applyEvent(defaultState(), ev());
		expect(sad.activations.sadness).toBeCloseTo(0.55, 5);
		expect(sad.outlook).toBeCloseTo(-0.032, 5);
		const glad = applyEvent(defaultState(), ev({ valence: "happy", shifts: { joy: 0.4 } }));
		expect(glad.outlook).toBeCloseTo(0.032, 5);
	});

	it("records the event in history and counts it in associations", () => {
		const s = applyEvent(defaultState(), ev({ id: "t9" }));
		expect(s.history).toEqual([{ id: "t9", valence: "tragic" }]);
		expect(s.associations.k.count).toBe(1);
	});

	it("keeps a running mean of what each kind of event triggers", () => {
		let s = applyEvent(defaultState(), ev({ shifts: { sadness: 0.4 } }));
		s = applyEvent(s, ev({ shifts: { sadness: 0.2 } }));
		expect(s.associations.k.count).toBe(2);
		expect(s.associations.k.tendencies.sadness).toBeCloseTo(0.3, 5);
	});

	it("blends the learned tendency into later events of the same kind", () => {
		let s = applyEvent(defaultState(), ev({ shifts: { sadness: 0.4 } })); // sadness 0.55
		s = applyEvent(s, ev({ shifts: { sadness: 0.2 } })); // + (0.6*0.2 + 0.4*0.4)
		expect(s.activations.sadness).toBeCloseTo(0.83, 5);
	});

	it("never lets outlook leave -1..1 or links exceed 0.8", () => {
		let s = defaultState();
		for (let i = 0; i < 200; i++) s = applyEvent(s, ev({ shifts: { sadness: 1 } }));
		expect(s.outlook).toBeGreaterThanOrEqual(-1);
		for (const w of Object.values(s.coupling.sadness)) expect(w!).toBeLessThanOrEqual(0.8);
	});
});

describe("learnCoupling", () => {
	it("tragic events strengthen positive links into sadness only", () => {
		const c = learnCoupling(defaultState().coupling, "tragic");
		expect(c.sadness.loneliness).toBeCloseTo(0.42, 5);
		expect(c.loneliness.boredom).toBeCloseTo(0.3, 5);
		expect(c.sadness.joy).toBeCloseTo(-0.4, 5);
	});

	it("happy events strengthen the dampening (negative) links", () => {
		const c = learnCoupling(defaultState().coupling, "happy");
		expect(c.sadness.joy).toBeCloseTo(-0.42, 5);
		expect(c.fear.hope).toBeCloseTo(-0.32, 5);
		expect(c.sadness.loneliness).toBeCloseTo(0.4, 5);
	});

	it("does not mutate its input", () => {
		const original = defaultState().coupling;
		learnCoupling(original, "tragic");
		expect(original.sadness.loneliness).toBeCloseTo(0.4, 5);
	});
});

describe("classifyUserEvents", () => {
	it("recognizes a tragic event", () => {
		const events = classifyUserEvents("my dog died today");
		expect(events.map((e) => e.valence)).toEqual(["tragic"]);
	});

	it("recognizes a happy event", () => {
		expect(classifyUserEvents("I got the job!").map((e) => e.valence)).toEqual(["happy"]);
	});

	it("registers both sides of a mixed message", () => {
		const events = classifyUserEvents("my dog died but I got the job");
		expect(events.map((e) => e.valence).sort()).toEqual(["happy", "tragic"]);
	});

	it("does not treat a negated success as happy", () => {
		expect(classifyUserEvents("I didn't get the job")).toEqual([]);
		expect(classifyUserEvents("I did not pass the exam")).toEqual([]);
	});

	it("ignores ordinary text", () => {
		expect(classifyUserEvents("hello there")).toEqual([]);
		expect(classifyUserEvents("")).toEqual([]);
		expect(classifyUserEvents("I lost my keys")).toEqual([]);
	});
});

describe("arguing about outlook", () => {
	it("detects bright and dark arguments", () => {
		expect(detectArgument("look on the bright side!")).toBe(1);
		expect(detectArgument("nothing matters anyway")).toBe(-1);
		expect(detectArgument("hello")).toBe(0);
	});

	it("nudges outlook only slightly, scaled by trust", () => {
		const s = defaultState(); // trust 0.5
		expect(argueOutlook(s, 1).outlook).toBeCloseTo(0.01, 5);
		const distrustful = { ...s, activations: { ...s.activations, trust: 0 } };
		expect(argueOutlook(distrustful, 1).outlook).toBe(0);
	});
});

describe("leaning and kindFor", () => {
	it("states which way it leans and why", () => {
		expect(leaning(0.5, "kindness", "loss")).toMatch(/hope/);
		expect(leaning(-0.5, "kindness", "loss")).toMatch(/caution/);
		expect(leaning(0, "kindness", "loss")).toMatch(/undecided/);
	});

	it("looks up event kinds, with a fallback for user-told events", () => {
		expect(kindFor({ id: EVENTS[0].id, valence: EVENTS[0].valence })).toBe(EVENTS[0].kind);
		expect(kindFor({ id: "user-happy", valence: "happy" })).toBe("joy");
		expect(kindFor({ id: "user-tragic", valence: "tragic" })).toBe("sorrow");
	});
});

describe("classifyUserEvents: everyday chat (review fixes)", () => {
	it("ignores things that are not a loss to a person or pet", () => {
		expect(classifyUserEvents("my phone died")).toEqual([]);
		expect(classifyUserEvents("the battery died again")).toEqual([]);
	});

	it("ignores negated or hypothetical tragedies", () => {
		expect(classifyUserEvents("thankfully nobody died")).toEqual([]);
		expect(classifyUserEvents("I was not diagnosed with anything")).toEqual([]);
	});

	it("ignores questions and negated happy phrases", () => {
		expect(classifyUserEvents("any good news?")).toEqual([]);
		expect(classifyUserEvents("who won the war?")).toEqual([]);
		expect(classifyUserEvents("I haven't graduated yet")).toEqual([]);
		expect(classifyUserEvents("she never had a baby")).toEqual([]);
	});

	it("scopes negation to its own clause", () => {
		expect(classifyUserEvents("I didn't think I'd get it, but I got the job!").map((e) => e.valence)).toEqual(["happy"]);
		expect(classifyUserEvents("I got the job but my friend didn't get one").map((e) => e.valence)).toEqual(["happy"]);
	});

	it("still recognizes real losses", () => {
		expect(classifyUserEvents("my grandma died").map((e) => e.valence)).toEqual(["tragic"]);
		expect(classifyUserEvents("our dog passed away").map((e) => e.valence)).toEqual(["tragic"]);
	});
});

describe("classifyUserEvents: only the user's own news (review fix)", () => {
	it("ignores statements about others and negated good news", () => {
		expect(classifyUserEvents("the Romans won the war")).toEqual([]);
		expect(classifyUserEvents("that is not good news")).toEqual([]);
		expect(classifyUserEvents("that isn't good news")).toEqual([]);
	});

	it("still recognizes the user's own wins", () => {
		expect(classifyUserEvents("we won the game").map((e) => e.valence)).toEqual(["happy"]);
		expect(classifyUserEvents("I won a prize").map((e) => e.valence)).toEqual(["happy"]);
		expect(classifyUserEvents("I have good news").map((e) => e.valence)).toEqual(["happy"]);
	});
});
