import { describe, expect, it } from "vitest";
import { lockdown, requireOnly } from "./lockdown";

describe("lockdown", () => {
	it("removes the six doors and does not let them come back", () => {
		const win: Record<string, unknown> = { fetch: 1, XMLHttpRequest: 1, WebSocket: 1, EventSource: 1, open: 1, eval: 1 };
		lockdown(win);
		for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "open", "eval"]) {
			expect(win[name]).toBeUndefined();
			expect(Object.getOwnPropertyDescriptor(win, name)?.configurable).toBe(false);
			expect(() => {
				win[name] = 1;
			}).toThrow();
			expect(win[name]).toBeUndefined();
		}
	});
	it("does not throw for a property it cannot redefine", () => {
		const win = {};
		Object.defineProperty(win, "fetch", { value: 1, configurable: false, writable: false });
		expect(() => lockdown(win)).not.toThrow();
	});
});
describe("requireOnly", () => {
	it("answers for react and nothing else", () => {
		const req = requireOnly("R");
		expect(req("react")).toBe("R");
		expect(() => req("react-dom")).toThrow();
		expect(() => req("fs")).toThrow();
		expect(() => req("./x")).toThrow();
	});
});
