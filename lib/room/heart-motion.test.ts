import { describe, expect, it } from "vitest";
import { speechBeat } from "../agent/speech";
import { beatTargets, currentSentence, ease, REST_SHAPES, rollShapes, settled, STILL, wordTargets } from "./heart-motion";

describe("what each character asks of the heart", () => {
	it("opens the heart on a vowel, less on a consonant, not at all on a space", () => {
		expect(beatTargets("a", speechBeat("a", "t"), 1).open).toBe(1);
		expect(beatTargets("t", speechBeat("t", "a"), 1).open).toBe(0.4);
		expect(beatTargets(" ", speechBeat(" ", "a"), 1).open).toBe(0);
	});

	it("is as loud as the beat, scaled by how strongly he feels", () => {
		const beat = speechBeat("e", "t");
		expect(beatTargets("e", beat, 1).voice).toBeCloseTo(Math.min(1, beat.voice));
		expect(beatTargets("e", beat, 0).voice).toBeCloseTo(beat.voice * 0.6);
	});

	it("asks the rings to flow while speaking", () => {
		expect(beatTargets("a", speechBeat("a", undefined), 0.5).flow).toBe(3);
	});
});

describe("what a spoken word asks of the heart", () => {
	it("opens on a word with a vowel, and less on one without", () => {
		expect(wordTargets("Gur").open).toBe(1);
		expect(wordTargets("hmm").open).toBe(0.4);
		expect(wordTargets("Gur").voice).toBeGreaterThan(0.5);
	});
});

describe("the heart's shape", () => {
	it("rests in a fixed shape and rolls to a new one, within bounds, deterministically", () => {
		let n = 0;
		const rng = () => ((n += 7) % 10) / 10;
		const a = rollShapes(rng);
		expect(a).toHaveLength(3);
		expect(a).not.toEqual(REST_SHAPES);
		for (const shape of a) {
			const numbers = shape.match(/\d+(?=%)/g)!.map(Number);
			expect(numbers).toHaveLength(8);
			for (const x of numbers) expect(x).toBeGreaterThanOrEqual(35);
			for (const x of numbers) expect(x).toBeLessThanOrEqual(65);
		}
		n = 0;
		expect(rollShapes(rng)).toEqual(a);
	});
});

describe("easing", () => {
	const loud = { voice: 1, open: 1, flow: 3 };

	it("attacks faster than it releases", () => {
		const up = ease(STILL, loud, 50).voice;
		const down = 1 - ease(loud, STILL, 50).voice;
		expect(up).toBeGreaterThan(down);
		expect(up).toBeGreaterThan(0.3);
	});

	it("moves the same distance whatever the frame rate", () => {
		const one = ease(STILL, loud, 32);
		const two = ease(ease(STILL, loud, 16), loud, 16);
		expect(two.voice).toBeCloseTo(one.voice, 2);
		expect(two.flow).toBeCloseTo(one.flow, 2);
	});

	it("lets the rings' flow change slowly", () => {
		const m = ease(STILL, loud, 100);
		expect(m.flow - 1).toBeLessThan(0.5);
		expect(m.voice).toBeGreaterThan(0.8);
	});

	it("knows when it has settled", () => {
		expect(settled(STILL, STILL)).toBe(true);
		expect(settled({ voice: 0.004, open: 0, flow: 1.001 }, STILL)).toBe(true);
		expect(settled({ voice: 0.02, open: 0, flow: 1 }, STILL)).toBe(false);
	});
});

describe("the subtitle", () => {
	it("shows the sentence being said, not the whole reply", () => {
		expect(currentSentence("Good evening, Gur. The room is qui")).toBe("The room is qui");
		expect(currentSentence("Good evening, Gur.")).toBe("Good evening, Gur.");
		expect(currentSentence("Hello")).toBe("Hello");
		expect(currentSentence("Really? Yes! Of course")).toBe("Of course");
		expect(currentSentence("")).toBe("");
	});
});
