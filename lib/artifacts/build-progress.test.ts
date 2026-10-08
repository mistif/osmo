import { describe, expect, it } from "vitest";
import { buildProgress, sketchBlocks } from "./build-progress";

describe("buildProgress", () => {
	it("starts at 0 and rises with bytes", () => {
		expect(buildProgress(0, 4000)).toBe(0);
		const a = buildProgress(1000, 4000),
			b = buildProgress(2000, 4000),
			c = buildProgress(4000, 4000);
		expect(a).toBeGreaterThan(0);
		expect(b).toBeGreaterThan(a);
		expect(c).toBeGreaterThan(b);
		expect(c).toBeLessThan(0.95);
	});
	it("never reaches 1 on its own: a huge count gives 0.95", () => {
		expect(buildProgress(1e9, 4000)).toBe(0.95);
		expect(buildProgress(Number.POSITIVE_INFINITY, 4000)).toBe(0.95);
	});
	it("gives 0 for nonsense", () => {
		expect(buildProgress(Number.NaN, 4000)).toBe(0);
		expect(buildProgress(-5, 4000)).toBe(0);
		expect(buildProgress(100, 0)).toBe(0);
		expect(buildProgress(100, Number.NaN)).toBe(0);
	});
	it("is 1 only when finished", () => {
		expect(buildProgress(10, 4000, true)).toBe(1);
		expect(buildProgress(0, 0, true)).toBe(1);
	});
});
describe("sketchBlocks", () => {
	it("counts the elements opened so far", () => {
		expect(sketchBlocks("")).toBe(0);
		expect(sketchBlocks("<div><h1>A</h1><button>x</button></div>")).toBe(3);
		expect(sketchBlocks("return (\n<div>\n<h1")).toBe(2);
	});
	it("ignores comments and strings", () => {
		expect(sketchBlocks("// <b>\n/* <i> */\nconst a = \"<p>\"; const b = '<p>'; const c = `<p>`;")).toBe(0);
		expect(sketchBlocks("// <b>\nreturn <div>x</div>;")).toBe(1);
	});
	it("does not count comparisons or generics", () => {
		expect(sketchBlocks("for (let i = 0; i < n; i++) {}")).toBe(0);
		expect(sketchBlocks("if (a<b) {}")).toBe(0);
		expect(sketchBlocks("const [n, setN] = useState<number>(0);")).toBe(0);
	});
	it("caps at 12", () => {
		expect(sketchBlocks("<p>x</p>".repeat(20))).toBe(12);
	});
	it("survives an apostrophe in the text of an element", () => {
		expect(sketchBlocks("<p>Don't stop</p>\n<h2>Next</h2>")).toBe(2);
	});
});
