import { describe, expect, it } from "vitest";
import { CHARACTER } from "./character";
import { CRISIS_CAUSE } from "./crisis-cause";
import { validateDetection, type Detection } from "./detection";
import { applyCeilings, feelTurn, forgiveGrudges, pushesFor } from "./feelings";
import { newSession } from "./mind";
import { moodTheme } from "./mood-theme";
import { defaultState } from "./state";
const d =(tone: string[], intensity = 2, about = "gur"): Detection => validateDetection({ tone, intensity, about }, "rules")!;
const r4 = (v?: number) => Math.round((v ?? 0) * 1e4) / 1e4;
describe("pushesFor", () => {
	it("scales by intensity and reactivity (the spec's worked example: worried 2 at 0.75)", () => {
		const p = pushesFor(d(["worried"]), 0.75);
		expect([p.love, p.trust, p.sadness, p.hope].map(r4)).toEqual([0.105, 0.0788, 0.0525, 0.0398]);
		expect([1, 3].map((n) => r4(pushesFor(d(["worried"], n), 0.7).love))).toEqual([0.049, 0.147]); // 0.7, so intensity 3 stays under the 0.40 turn cap
		// Intensity 1 so neither side meets the 0.20 or 0.40 caps (intensity 2 at 1.5 now hits the per-emotion cap on love).
			expect([r4(pushesFor(d(["sad"], 1), 3).love), r4(pushesFor(d(["sad"], 1), 0.1).love)]).toEqual([0.1312, 0.0525]);
	});
	it("never pushes fear for sad, worried or lonely; neutral pushes nothing; a second tone adds at 60%", () => {
		for (const t of ["sad", "worried", "lonely"]) expect(pushesFor(d([t]), 1).fear).toBeUndefined();
		expect(pushesFor(d(["neutral"]), 1)).toEqual({});
		// Intensity 1 keeps the sum under the 0.40 turn cap: trust = 0.5 * (0.105 + 0.6 * 0.07).
			expect(r4(pushesFor(d(["sad", "tired"], 1), 1).trust)).toBe(0.0735);
	});
	it("caps one emotion at 0.20 and the turn at 0.40", () => {
		const v = Object.values(pushesFor(d(["excited", "happy"], 3), 1.5));
		expect(Math.max(...v.map(Math.abs))).toBeLessThanOrEqual(0.2 + 1e-9);
		expect(v.reduce((s, x) => s + Math.abs(x), 0)).toBeLessThanOrEqual(0.4 + 1e-9);
	});
	it("de-escalates anger: at Osmo it raises guilt not anger; at others it raises love", () => {
		expect(pushesFor(d(["angry"], 2, "osmo"), 1)).toEqual({ guilt: 0.105, anger: 0.035, trust: -0.035 });
		expect(pushesFor(d(["angry"], 2, "other"), 1)).toEqual({ love: 0.07, trust: 0.07, anger: 0.035 });
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
// Starts from the One Character baseline, as the live app does (defaultState still carries the older BASELINE, whose sadness sits 0.05 above it).
const kept = () => ({ state: { ...defaultState(), activations: { ...CHARACTER.baseline } }, session: newSession(), reply: null, effects: [] });
const ctx = (o = {}) => ({ now: 1_000_000_000, lastAt: 1_000_000_000 - 60_000, ...o });
const worried = { tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again" };
describe("feelTurn", () => {
	it("pushes love, leaves fear, remembers the tone, gives the pushed feelings a cause, and falls back to the rules", () => {
		const r = feelTurn(kept(), "x", worried, ctx());
		expect(r.state.activations.love).toBeCloseTo(kept().state.activations.love + 0.105, 5);
		expect(r.state.activations.fear).toBe(kept().state.activations.fear);
		expect(r.session.gur?.read.tones).toEqual(["worried"]);
		expect(r.state.mood?.causes[0]).toMatchObject({ tone: "love", because: "his mother is in hospital again" });
		// no valid model record: the rules mapper reads the text
		expect(feelTurn(kept(), "i'm so sad", { tone: ["bogus"] }, ctx()).session.gur?.read).toMatchObject({ tones: ["sad"], intensity: 3 });
	});
	it("a single sad message of intensity 2 is enough to turn the aura to love", () => {
		const r = feelTurn(kept(), "x", { tone: ["sad"], intensity: 2, about: "gur" }, ctx());
		expect(moodTheme(r.state.activations, CHARACTER.baseline).tone).toBe("love");
	});
	it("thanks raise joy, trust and love above their baseline (the old thanks cue moved here)", () => {
		const b = kept().state.activations;
		const a = feelTurn(kept(), "thank you!", null, ctx()).state.activations;
		expect(a.joy).toBeGreaterThan(b.joy);
		expect(a.trust).toBeGreaterThan(b.trust);
		expect(a.love).toBeGreaterThan(b.love);
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
	it("forgives on a new day even when the message has no reading, but never for a guest or a crisis", () => {
		const b = CHARACTER.baseline;
		const hot = { ...kept(), state: { ...kept().state, activations: { ...kept().state.activations, anger: b.anger + 0.4, guilt: b.guilt + 0.2, sadness: b.sadness + 0.3 } } };
		const yesterday = ctx({ lastAt: 1_000_000_000 - 30 * 3_600_000 });
		const r = feelTurn(hot, "the weather", null, yesterday);
		expect(r).not.toBe(hot);
		const a = r.state.activations;
		expect([a.anger - b.anger, a.guilt - b.guilt, a.sadness - b.sadness].map(r4)).toEqual([0.1, 0.05, 0.3]);
		// Nothing else about the turn is recorded.
		expect(r.state.mood).toBe(hot.state.mood);
		expect(r.session).toBe(hot.session);
		// The same day, or no earlier message: still nothing.
		expect(feelTurn(hot, "the weather", null, ctx())).toBe(hot);
		expect(feelTurn(hot, "the weather", null, ctx({ lastAt: null }))).toBe(hot);
		// A guest's turn, a crisis flag and crisis text leave everything exactly as it was.
		expect(feelTurn(hot, "the weather", null, { ...yesterday, guest: true })).toBe(hot);
		expect(feelTurn(hot, "the weather", null, { ...yesterday, crisis: true })).toBe(hot);
		expect(feelTurn(hot, "i want to kill myself", null, yesterday)).toBe(hot);
	});
	it("fades the slow mood by the clock and survives a clock in the past", () => {
		const first = feelTurn(kept(), "x", worried, ctx());
		const later = feelTurn(first, "x", { tone: ["neutral"] }, ctx({ now: 1_000_000_000 + 12 * 3_600_000 }));
		expect(later.state.mood!.pad).not.toEqual(first.state.mood!.pad);
		expect(() => feelTurn(first, "x", worried, ctx({ now: 5, lastAt: 9_000_000 }))).not.toThrow();
	});
});
