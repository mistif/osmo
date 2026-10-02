import { describe, expect, it } from "vitest";
import { rememberGur, validateDetection } from "./detection";
import { defaultState } from "./state";
import { GUR_FRESH_MS, newSession, prepareTurn } from "./mind";

const ctx = (o = {}) => ({ now: 1_000_000, lastAt: null, uuid: () => "id", ...o });
const heavy3 = validateDetection({ tone: ["sad"], intensity: 3, about: "gur", wants: "listen", note: "he lost a friend" })!;
const light = validateDetection({ tone: ["happy"], intensity: 2 })!;
const facts = (at: number, d = heavy3, o = {}) => prepareTurn(defaultState(), rememberGur(newSession(), d, at), "tell me about peru", ctx(o)).facts;

describe("prepareTurn and Gur's last tone", () => {
	it("carries a fresh read, and an intensity-3 negative one makes the turn heavy", () => {
		expect(facts(940_000)).toMatchObject({ gur: { tones: ["sad"], intensity: 3, about: "gur", wants: "listen" }, heavy: true });
		expect(facts(999_000, light)).toMatchObject({ gur: { tones: ["happy"] }, heavy: false });
	});
	it("forgets a stale or future read, and gives a guest nothing", () => {
		for (const at of [1_000_000 - GUR_FRESH_MS - 1, 1_005_000]) expect(facts(at)).toMatchObject({ gur: null, heavy: false });
		expect(facts(999_000, heavy3, { guest: true })).toMatchObject({ gur: null, heavy: false });
	});
});
