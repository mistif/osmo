import { describe, expect, it } from "vitest";
import { CHARACTER } from "./character";
import { CRISIS_CAUSE } from "./crisis-cause";
import { validateDetection, type Detection } from "./detection";
import { applyCeilings, feelTurn, forgiveGrudges, pushesFor } from "./feelings";
import { newSession } from "./mind";
import { defaultState } from "./state";
const d =(tone: string[], intensity = 2, about = "gur"): Detection => validateDetection({ tone, intensity, about }, "rules")!;
const r4 = (v?: number) => Math.round((v ?? 0) * 1e4) / 1e4;
describe("pushesFor", () => {
	it("scales by intensity and reactivity (the spec's worked example: worried 2 at 0.75)", () => {
		const p = pushesFor(d(["worried"]), 0.75);
		expect([p.love, p.trust, p.sadness, p.hope].map(r4)).toEqual([0.06, 0.045, 0.03, 0.0225]);
		expect([1, 3].map((n) => r4(pushesFor(d(["worried"], n), 0.75).love))).toEqual([0.03, 0.09]);
		expect([r4(pushesFor(d(["sad"]), 3).love), r4(pushesFor(d(["sad"]), 0.1).love)]).toEqual([0.15, 0.06]);
	});
	it("never pushes fear for sad, worried or lonely; neutral pushes nothing; a second tone adds at 60%", () => {
		for (const t of ["sad", "worried", "lonely"]) expect(pushesFor(d([t]), 1).fear).toBeUndefined();
		expect(pushesFor(d(["neutral"]), 1)).toEqual({});
		expect(r4(pushesFor(d(["sad", "tired"]), 1).trust)).toBe(0.084);
	});
	it("caps one emotion at 0.20 and the turn at 0.40", () => {
		const v = Object.values(pushesFor(d(["excited", "happy"], 3), 1.5));
		expect(Math.max(...v.map(Math.abs))).toBeLessThanOrEqual(0.2 + 1e-9);
		expect(v.reduce((s, x) => s + Math.abs(x), 0)).toBeLessThanOrEqual(0.4 + 1e-9);
	});
	it("de-escalates anger: at Osmo it raises guilt not anger; at others it raises love", () => {
		expect(pushesFor(d(["angry"], 2, "osmo"), 1)).toEqual({ guilt: 0.06, anger: 0.02, trust: -0.02 });
		expect(pushesFor(d(["angry"], 2, "other"), 1)).toEqual({ love: 0.04, trust: 0.04, anger: 0.02 });
	});
});
describe("limits", () => {
	it("clamps the five ceilings, and on a new day keeps a quarter of anger's and guilt's excess only", () => {
		const a = applyCeilings({ ...CHARACTER.baseline, anger: 0.9, fear: 0.9, loneliness: 0.9, guilt: 0.9, disgust: 0.9, joy: 0.9 });
		expect([a.anger, a.fear, a.loneliness, a.guilt, a.disgust, a.joy]).toEqual([0.45, 0.45, 0.55, 0.5, 0.45, 0.9]);
		const b = CHARACTER.baseline;
		const g = forgiveGrudges({ ...b, anger: b.anger + 0.4, guilt: b.guilt + 0.2, sadness: b.sadness + 0.3 }, b);
		expect([g.anger - b.anger, g.guilt - b.guilt, g.sadness - b.sadness].map(r4)).toEqual([0.1, 0.05, 0.3]);
	});
});
const kept = () => ({ state: defaultState(), session: newSession(), reply: null, effects: [] });
const ctx = (o = {}) => ({ now: 1_000_000_000, lastAt: 1_000_000_000 - 60_000, ...o });
const worried = { tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again" };
describe("feelTurn", () => {
	it("pushes love, leaves fear, remembers the tone, gives the pushed feelings a cause, and falls back to the rules", () => {
		const r = feelTurn(kept(), "x", worried, ctx());
		expect(r.state.activations.love).toBeCloseTo(kept().state.activations.love + 0.06, 5);
		expect(r.state.activations.fear).toBe(kept().state.activations.fear);
		expect(r.session.gur?.read.tones).toEqual(["worried"]);
		expect(r.state.mood?.causes[0]).toMatchObject({ tone: "love", because: "his mother is in hospital again" });
		// no valid model record: the rules mapper reads the text
		expect(feelTurn(kept(), "i'm so sad", { tone: ["bogus"] }, ctx()).session.gur?.read).toMatchObject({ tones: ["sad"], intensity: 3 });
	});
	it("changes nothing for a guest, a crisis flag (even beside a happy tone), crisis text, the crisis cause, or no detection", () => {
		const k = kept();
		for (const [text, det, o] of [["i'm sad", null, { guest: true }], ["hello", { tone: ["happy"], intensity: 3 }, { crisis: true }], ["i'm sad and i want to die", null, {}], ["the weather", null, {}]] as const)
			expect(feelTurn(k, text, det, ctx(o))).toBe(k);
		const cause = { ...k, session: { ...k.session, cause: CRISIS_CAUSE } };
		expect(feelTurn(cause, "i'm sad", null, ctx())).toBe(cause);
	});
	it("forgives grudges on the first turn of a new local day only", () => {
		const hot = { ...kept(), state: { ...kept().state, activations: { ...kept().state.activations, anger: 0.45 } } };
		const same = feelTurn(hot, "x", worried, ctx()).state.activations.anger;
		expect(feelTurn(hot, "x", worried, ctx({ lastAt: 1_000_000_000 - 30 * 3_600_000 })).state.activations.anger).toBeLessThan(same);
		expect(feelTurn(hot, "x", worried, ctx({ lastAt: null })).state.activations.anger).toBe(same);
		expect(feelTurn(hot, "x", worried, ctx({ lastAt: 1_000_000_000 + 30 * 3_600_000 })).state.activations.anger).toBe(same);
	});
	it("fades the slow mood by the clock and survives a clock in the past", () => {
		const first = feelTurn(kept(), "x", worried, ctx());
		const later = feelTurn(first, "x", { tone: ["neutral"] }, ctx({ now: 1_000_000_000 + 12 * 3_600_000 }));
		expect(later.state.mood!.pad).not.toEqual(first.state.mood!.pad);
		expect(() => feelTurn(first, "x", worried, ctx({ now: 5, lastAt: 9_000_000 }))).not.toThrow();
	});
});
