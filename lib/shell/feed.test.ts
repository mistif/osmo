import { describe, expect, it } from "vitest";
import { actionLine, buildFeed, dayKey, resolveZone } from "./feed";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const empty = { actions: [], reminders: [], moods: [], things: [] };
describe("zones and days", () => {
	it("falls back from a bad zone and cuts the day in the zone", () => {
		expect(resolveZone("Nowhere/Land", "Europe/Stockholm")).toBe("Europe/Stockholm");
		expect(resolveZone(null, "also/bad")).toBe("UTC");
		expect(dayKey("2026-10-07T22:30:00Z", "Europe/Stockholm")).toBe("2026-10-08");
		expect(dayKey("2026-10-07T22:30:00Z", "UTC")).toBe("2026-10-07");
	});
});
describe("buildFeed", () => {
	const input = {
		...empty,
		actions: [{ id: 4, at: "2026-10-08T07:00:00Z", surface: "room", status: "done", summary: "Reminder set for 09:00: call Dad" }],
		reminders: [
			{ id: "r1", text: "call Dad", due_at: "2026-10-08T07:00:00Z", sent_at: "2026-10-08T07:00:03Z", status: "sent" as const },
			{ id: "r2", text: "pay rent", due_at: "2026-10-07T21:30:00Z", sent_at: null, status: "missed" as const },
			{ id: "r3", text: "later", due_at: "2026-10-09T08:00:00Z", sent_at: null, status: "pending" as const },
			{ id: "r4", text: "earlier", due_at: "2026-10-08T15:00:00Z", sent_at: null, status: "pending" as const },
		],
		moods: [{ day: "2026-10-07", strongest: "hope" }],
		things: [{ id: "t1", title: "Tip splitter", version: 1, parent_id: null, created_at: "2026-10-06T09:00:00Z" }],
	};
	const feed = buildFeed(input, { zone: "Europe/Stockholm", now: NOW });
	it("puts pending reminders in Coming up, soonest first", () => {
		expect(feed.comingUp.map((r) => r.id)).toEqual(["r4", "r3"]);
	});
	it("groups by day in the zone, newest first, with plain headings", () => {
		expect(feed.days.map((d) => d.heading)).toEqual(["Today", "Yesterday", "Tuesday 6 October"]);
		expect(feed.days[0].rows.map((r) => r.text)).toEqual(["A reminder went off at 09:00: call Dad.", "Done. Reminder set for 09:00: call Dad."]); // sent_at is 3 s after the action
		// 21:30 UTC on the 7th is 23:30 on the 7th in Stockholm; a missed reminder keeps its own day
		expect(feed.days[1].rows.map((r) => r.text)).toEqual(["Mostly hopeful.", "I missed a reminder at 23:30: pay rent."]);
	});
	it("says which source's delete applies", () => {
		const targets = feed.days.flatMap((d) => d.rows.map((r) => r.forget));
		expect(targets).toContainEqual({ table: "actions", key: 4 });
		expect(targets).toContainEqual({ table: "reminders", key: "r1" });
		expect(targets).toContainEqual({ table: "mood_days", key: "2026-10-07" });
		expect(targets).toContainEqual({ table: "artifacts", key: "t1", warn: "This also deletes the thing I built." });
	});
	it("shows 30 rows and says there is more", () => {
		const many = { ...empty, actions: Array.from({ length: 45 }, (_, i) => ({ id: i + 1, at: "2026-10-08T07:00:00Z", surface: "room", status: "done", summary: `x${i}` })) };
		const f = buildFeed(many, { zone: "UTC", now: NOW, limit: 30 });
		expect(f.days.flatMap((d) => d.rows)).toHaveLength(30);
		expect(f.more).toBe(true);
	});
	it("has no exclamation marks in any sentence", () => {
		expect(actionLine({ id: 1, at: "", surface: "room", status: "failed", summary: "" })).toBe("I could not do it.");
	});
	it("skips a row whose date is not a date instead of throwing", () => {
		const bad = {
			actions: [{ id: 1, at: "not a date", surface: "room", status: "done", summary: "x" }],
			reminders: [{ id: "r", text: "y", due_at: "2026-10-08T07:00:00Z", sent_at: "junk", status: "sent" as const }],
			moods: [{ day: "someday", strongest: "calm" }],
			things: [{ id: "t", title: "T", version: 1, parent_id: null, created_at: "junk" }],
		};
		const f = buildFeed(bad, { zone: "UTC", now: NOW });
		expect(f.days.flatMap((d) => d.rows).map((r) => r.key)).toEqual(["rr"]);
	});
});
