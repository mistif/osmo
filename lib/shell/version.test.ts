import { describe, expect, it } from "vitest";
import { versionLine } from "./version";

describe("versionLine", () => {
	it("names the version, the build and the day", () => {
		expect(versionLine("0.2.0", "8b16119", "2026-10-08T10:05:26Z")).toBe("Version 0.2.0, build 8b16119, 8 October 2026.");
	});

	it("leaves the day out when there is none or it is unreadable", () => {
		expect(versionLine("0.2.0", "local", "")).toBe("Version 0.2.0, build local.");
		expect(versionLine("0.2.0", "local", "not a date")).toBe("Version 0.2.0, build local.");
	});

	it("has no exclamation mark and ends with a full stop", () => {
		const line = versionLine("1.0.0", "abcdef0", "2026-12-31T23:59:59Z");
		expect(line).not.toMatch(/!/);
		expect(line.endsWith(".")).toBe(true);
	});
});
