import { describe, expect, it } from "vitest";
import { LINES, lineFor } from "./lines";
import { BUILD_ERRORS } from "./protocol";

describe("LINES", () => {
	it("has no exclamation mark and no emoji", () => {
		for (const v of Object.values(LINES)) expect(/[!\p{Extended_Pictographic}]/u.test(v)).toBe(false);
	});
	it("has the ten lines of the spec and the room's delete line", () => {
		expect(Object.keys(LINES).sort()).toEqual(["allowance", "busy", "cap", "compile", "deleteFailed", "failed", "full", "off", "runtime", "saveFailed", "tooBig"]);
	});
});
describe("lineFor", () => {
	it("maps every stream error to its line", () => {
		expect(lineFor("too_big")).toBe(LINES.tooBig);
		expect(lineFor("allowance")).toBe(LINES.allowance);
		expect(lineFor("cap")).toBe(LINES.cap);
		expect(lineFor("off")).toBe(LINES.off);
		expect(lineFor("failed")).toBe(LINES.failed);
		for (const c of BUILD_ERRORS) expect(lineFor(c).length).toBeGreaterThan(10);
	});
});
