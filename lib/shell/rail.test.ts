import { describe, expect, it } from "vitest";
import { createSeenStore, hasNew, railItems } from "./rail";

const ALL = ["talk", "ideas", "goals", "library", "feed", "search", "settings"] as const;
describe("railItems", () => {
	it("shows only shipped items, in order, Talk active with no panel", () => {
		const items = railItems({ panel: null }, {});
		expect(items.map((i) => i.id)).toEqual(["talk", "library", "feed", "settings"]);
		expect(items.filter((i) => i.active).map((i) => i.id)).toEqual(["talk"]);
		expect(railItems({ panel: null }, {}, ALL).map((i) => i.id)).toEqual([...ALL]);
	});
	it("marks the open panel active, also on a page of it", () => {
		expect(railItems({ panel: "settings", page: "voice" }, {}).filter((i) => i.active).map((i) => i.id)).toEqual(["settings"]);
	});
	it("allows a dot on Library and Goals only, and never on the active item", () => {
		const dots = { library: true, goals: true, feed: true, talk: true };
		const items = railItems({ panel: null }, dots, ALL);
		expect(items.filter((i) => i.dot).map((i) => i.id)).toEqual(["goals", "library"]);
		expect(railItems({ panel: "library" }, dots).find((i) => i.id === "library")?.dot).toBe(false);
		expect(items.find((i) => i.id === "library")?.sr).toBe(", something new");
	});
});
describe("dots", () => {
	const mem = () => {
		const m = new Map<string, string>();
		return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
	};
	it("is false with nothing seen, nothing latest, or nothing newer", () => {
		expect(hasNew(null, "2026-10-08T10:00:00Z")).toBe(false);
		expect(hasNew("2026-10-08T10:00:00Z", null)).toBe(false);
		expect(hasNew("2026-10-08T10:00:00Z", "2026-10-08T10:00:00Z")).toBe(false);
		expect(hasNew("2026-10-08T10:00:00Z", "2026-10-08T10:00:01+00:00")).toBe(true);
		expect(hasNew("junk", "2026-10-08T10:00:01Z")).toBe(false);
	});
	it("takes the first read as the baseline, then keeps what was marked", () => {
		let t = "2026-10-01T00:00:00Z";
		const s = createSeenStore(mem(), () => t);
		expect(s.get("library")).toBe(t);
		t = "2026-10-05T00:00:00Z";
		s.mark("library");
		expect(s.get("library")).toBe(t);
	});
	it("peeks without starting a baseline, and sees what was marked", () => {
		const s = createSeenStore(mem(), () => "2026-10-01T00:00:00Z");
		expect(s.peek("settings")).toBeNull();
		expect(s.peek("settings")).toBeNull();
		s.mark("settings");
		expect(s.peek("settings")).toBe("2026-10-01T00:00:00Z");
	});
	it("survives missing or throwing storage", () => {
		const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
		for (const storage of [null, boom]) {
			const s = createSeenStore(storage, () => "2026-10-01T00:00:00Z");
			expect(s.get("library")).toBeNull();
			expect(() => s.mark("library")).not.toThrow();
			expect(s.peek("settings")).toBeNull();
		}
	});
});
