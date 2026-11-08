import { describe, expect, it } from "vitest";
import { acceptMessage, clampHeight } from "./bridge";

const frame = {};
const N = "n1";
const msg = (t: string, v?: unknown, extra: Record<string, unknown> = {}) => ({ osmo: 1, n: N, t, ...(v === undefined ? {} : { v }), ...extra });
const take = (data: unknown, source: unknown = frame) => acceptMessage({ source, data }, frame, N);

describe("acceptMessage", () => {
	it("accepts one valid message of each type", () => {
		expect(take(msg("ready"))).toEqual({ type: "ready" });
		expect(take(msg("title", "Tip splitter"))).toEqual({ type: "title", text: "Tip splitter" });
		expect(take(msg("height", 320))).toEqual({ type: "height", px: 320 });
		expect(take(msg("error", "It broke."))).toEqual({ type: "error", text: "It broke." });
	});
	it("drops a message from another window, or when there is no frame", () => {
		expect(take(msg("ready"), {})).toBeNull();
		expect(take(msg("ready"), null)).toBeNull();
		expect(acceptMessage({ source: null, data: msg("ready") }, null, N)).toBeNull();
		expect(acceptMessage({ source: undefined, data: msg("ready") }, undefined, N)).toBeNull();
	});
	it("drops a wrong nonce, an extra key, a ready with a value", () => {
		expect(take({ ...msg("ready"), n: "other" })).toBeNull();
		expect(take(msg("title", "A", { extra: 1 }))).toBeNull();
		expect(take(msg("ready", "x"))).toBeNull();
		expect(take(msg("ready", undefined, { x: 1 }))).toBeNull();
	});
	it("drops a missing or wrong osmo marker", () => {
		expect(take({ n: N, t: "ready" })).toBeNull();
		expect(take({ osmo: 2, n: N, t: "ready" })).toBeNull();
	});
	it("holds the text limits: title 60, error 200", () => {
		expect(take(msg("title", "x".repeat(60)))).not.toBeNull();
		expect(take(msg("title", "x".repeat(61)))).toBeNull();
		expect(take(msg("error", "x".repeat(200)))).not.toBeNull();
		expect(take(msg("error", "x".repeat(201)))).toBeNull();
		expect(take(msg("title", 5))).toBeNull();
	});
	it("drops a height that is not a finite number", () => {
		expect(take(msg("height", "300"))).toBeNull();
		expect(take(msg("height", Number.NaN))).toBeNull();
		expect(take(msg("height", Number.POSITIVE_INFINITY))).toBeNull();
	});
	it("drops an unknown type and data that is not an object", () => {
		expect(take(msg("cmd", "go"))).toBeNull();
		expect(take("ready")).toBeNull();
		expect(take(null)).toBeNull();
		expect(take([msg("ready")])).toBeNull();
		expect(take(undefined)).toBeNull();
	});
});
describe("clampHeight", () => {
	it("stays between 160 and the smaller of 70% of the screen or 560", () => {
		expect(clampHeight(-50, 800)).toBe(160);
		expect(clampHeight(9999, 800)).toBe(560);
		expect(clampHeight(500, 600)).toBe(420);
		expect(clampHeight(300, 800)).toBe(300);
	});
	it("keeps the 160 floor on a tiny viewport", () => {
		expect(clampHeight(300, 200)).toBe(160);
		expect(clampHeight(100, 200)).toBe(160);
	});
});
