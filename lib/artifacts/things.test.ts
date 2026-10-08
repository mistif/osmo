import { describe, expect, it } from "vitest";
import { describeThing, latestOfChains, sanitizeThing, type ThingRow } from "./things";

const row = (over: Partial<ThingRow> = {}): ThingRow => ({ id: "a", title: "Tip splitter", version: 1, parent_id: null, created_at: "2026-10-07T12:00:00Z", ...over });

describe("sanitizeThing", () => {
	it("keeps a well-shaped row", () => {
		expect(sanitizeThing({ id: "a", title: "Tip splitter", version: 2, parent_id: "p", created_at: "2026-10-07T12:00:00Z", source: "never kept" })).toEqual({
			id: "a",
			title: "Tip splitter",
			version: 2,
			parent_id: "p",
			created_at: "2026-10-07T12:00:00Z",
		});
	});
	it("takes a missing parent as none", () => {
		expect(sanitizeThing({ id: "a", title: "T", version: 1, created_at: "2026-10-07T12:00:00Z" })?.parent_id).toBeNull();
	});
	it("rejects a missing id, a version that is not a number, and a title that is empty or over 60", () => {
		expect(sanitizeThing({ title: "T", version: 1, created_at: "x" })).toBeNull();
		expect(sanitizeThing({ id: "a", title: "T", version: "1", created_at: "x" })).toBeNull();
		expect(sanitizeThing({ id: "a", title: "", version: 1, created_at: "x" })).toBeNull();
		expect(sanitizeThing({ id: "a", title: "x".repeat(61), version: 1, created_at: "x" })).toBeNull();
		expect(sanitizeThing({ id: "a", title: "x".repeat(60), version: 1, created_at: "x" })).not.toBeNull();
	});
	it("rejects things that are not rows", () => {
		expect(sanitizeThing(null)).toBeNull();
		expect(sanitizeThing("row")).toBeNull();
		expect(sanitizeThing([])).toBeNull();
	});
});

describe("latestOfChains", () => {
	it("shows the newest version of each chain, newest chain first", () => {
		const v1 = row({ id: "a", created_at: "2026-10-01T10:00:00Z" });
		const v2 = row({ id: "b", version: 2, parent_id: "a", created_at: "2026-10-02T10:00:00Z" });
		const c = row({ id: "c", title: "Timer", created_at: "2026-10-03T10:00:00Z" });
		expect(latestOfChains([v1, v2, c]).map((r) => r.id)).toEqual(["c", "b"]);
	});
	it("orders by created_at, not by the order given", () => {
		const old = row({ id: "old", created_at: "2026-09-01T10:00:00Z" });
		const fresh = row({ id: "fresh", created_at: "2026-10-05T10:00:00Z" });
		expect(latestOfChains([old, fresh]).map((r) => r.id)).toEqual(["fresh", "old"]);
		expect(latestOfChains([fresh, old]).map((r) => r.id)).toEqual(["fresh", "old"]);
	});
	it("shows the one before when a chain's newest row was deleted", () => {
		const v1 = row({ id: "a" });
		const v2 = row({ id: "b", version: 2, parent_id: "a" });
		expect(latestOfChains([v1]).map((r) => r.id)).toEqual(["a"]);
		expect(latestOfChains([v1, v2]).map((r) => r.id)).toEqual(["b"]);
	});
	it("is empty for no rows", () => {
		expect(latestOfChains([])).toEqual([]);
	});
});

describe("describeThing", () => {
	const now = Date.parse("2026-10-08T12:00:00Z");
	it("names a first version and the day", () => {
		expect(describeThing(row(), now)).toBe("Tip splitter, made on Wednesday 7 October.");
	});
	it("names the version from the second on", () => {
		expect(describeThing(row({ version: 2 }), now)).toBe("Tip splitter, version 2, made on Wednesday 7 October.");
	});
	it("adds the year when it is not this one", () => {
		expect(describeThing(row({ created_at: "2025-10-07T12:00:00Z" }), now)).toBe("Tip splitter, made on Tuesday 7 October 2025.");
	});
	it("has no digits as symbols and no commas inside the day, and no exclamation mark", () => {
		const text = describeThing(row({ version: 3 }), now);
		expect(text).not.toMatch(/[!/:]/);
	});
	it("still names a thing whose date cannot be read", () => {
		expect(describeThing(row({ created_at: "nope" }), now)).toBe("Tip splitter.");
	});
});
