import { describe, expect, it } from "vitest";
import { closeness, emptyBond, localDay, mentioned, mergeBond, recordTurn, sanitizeBond, score, stageOf, type Bond } from "./bond";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const quiet = { feeling: false, event: false, nameKnown: false };
const talk = (b: Bond, now: number, over: Partial<typeof quiet> = {}, demo = false) =>
	recordTurn(b, { now, ...quiet, ...over, demo });

describe("recordTurn", () => {
	it("starts the relationship on the first message", () => {
		const b = talk(emptyBond(), at(2026, 9, 24));
		expect(b.messages).toBe(1);
		expect(b.days).toBe(1);
		expect(b.metAt).toBe(new Date(at(2026, 9, 24)).toISOString());
		expect(b.milestones.map((m) => m.id)).toEqual(["met"]);
		expect(b.toMention).toEqual([]);
	});

	it("counts a local calendar day once, and midnight starts a new one", () => {
		let b = talk(emptyBond(), at(2026, 9, 24, 23, 59));
		b = talk(b, at(2026, 9, 24, 23, 59));
		expect(b.days).toBe(1);
		b = talk(b, at(2026, 9, 25, 0, 1));
		expect(b.days).toBe(2);
		expect(b.lastDay).toBe(localDay(at(2026, 9, 25, 0, 1)));
	});

	it("never goes down", () => {
		let b = emptyBond();
		let prev = b;
		for (let i = 0; i < 50; i++) {
			b = talk(b, at(2026, 9, 1 + (i % 20)), { feeling: i % 3 === 0 });
			expect(b.messages).toBeGreaterThanOrEqual(prev.messages);
			expect(b.days).toBeGreaterThanOrEqual(prev.days);
			expect(b.shared).toBeGreaterThanOrEqual(prev.shared);
			expect(b.milestones.length).toBeGreaterThanOrEqual(prev.milestones.length);
			prev = b;
		}
	});

	it("counts sharing, and fires each first-share milestone exactly once", () => {
		let b = talk(emptyBond(), at(2026, 9, 24), { feeling: true });
		b = talk(b, at(2026, 9, 24), { feeling: true, event: true });
		expect(b.shared).toBe(3);
		expect(b.milestones.filter((m) => m.id === "firstFeeling")).toHaveLength(1);
		expect(b.milestones.filter((m) => m.id === "firstEvent")).toHaveLength(1);
		expect(b.toMention).toEqual(["firstFeeling", "firstEvent"]);
	});

	it("records the name quietly, and counts it as sharing once", () => {
		let b = talk(emptyBond(), at(2026, 9, 24), { nameKnown: true });
		b = talk(b, at(2026, 9, 24), { nameKnown: true });
		expect(b.nameKnown).toBe(true);
		expect(b.shared).toBe(1);
		expect(b.milestones.map((m) => m.id)).toContain("name");
		expect(b.toMention).not.toContain("name");
	});

	it("in demo mode counts every message as a new day", () => {
		let b = emptyBond();
		for (let i = 0; i < 5; i++) b = talk(b, at(2026, 9, 24), {}, true);
		expect(b.days).toBe(5);
	});
});

describe("stages", () => {
	const after = (messages: number, demo = true) => {
		let b = emptyBond();
		for (let i = 0; i < messages; i++) b = talk(b, at(2026, 9, 24), {}, demo);
		return b;
	};

	it("moves stranger, acquaintance, friend, old friend at the demo pace", () => {
		expect(stageOf(after(1))).toBe("stranger");
		expect(stageOf(after(3))).toBe("acquaintance");
		expect(stageOf(after(8))).toBe("friend");
		expect(stageOf(after(30))).toBe("oldFriend");
	});

	it("at the real pace, one long day is still a stranger or acquaintance, not a friend", () => {
		expect(stageOf(after(200, false))).not.toBe("friend");
		expect(stageOf(after(200, false))).not.toBe("oldFriend");
	});

	// Each part has diminishing returns, so pouring out feelings in one sitting cannot stand in for days.
	it("at the real pace, one day with 45 feelings shared and 60 messages is not a friend", () => {
		let b = emptyBond();
		for (let i = 0; i < 60; i++) b = talk(b, at(2026, 9, 24), { feeling: i < 45 });
		expect(b.days).toBe(1);
		expect(b.shared).toBe(45);
		expect(stageOf(b)).not.toBe("friend");
		expect(stageOf(b)).not.toBe("oldFriend");
	});

	it("queues each stage milestone once, in order", () => {
		const b = after(30);
		const ids = b.milestones.map((m) => m.id);
		expect(ids.indexOf("acquaintance")).toBeLessThan(ids.indexOf("friend"));
		expect(ids.indexOf("friend")).toBeLessThan(ids.indexOf("oldFriend"));
		expect(ids.filter((id) => id === "friend")).toHaveLength(1);
		expect(ids).toContain("days7");
	});

	it("closeness rises with diminishing returns and stays under 1", () => {
		const c1 = closeness(after(5));
		const c2 = closeness(after(10));
		const c3 = closeness(after(15));
		expect(c2).toBeGreaterThan(c1);
		expect(c3 - c2).toBeLessThan(c2 - c1);
		expect(closeness(after(300))).toBeLessThan(1);
		expect(score(emptyBond())).toBe(0);
	});
});

describe("mentioned and sanitizeBond", () => {
	it("removes one queued milestone", () => {
		const b: Bond = { ...emptyBond(), toMention: ["firstFeeling", "friend"] };
		expect(mentioned(b, "firstFeeling").toMention).toEqual(["friend"]);
	});

	it("turns missing or broken data into a fresh bond", () => {
		for (const raw of [null, undefined, "x", 3, [], { messages: "lots" }]) {
			expect(sanitizeBond(raw)).toEqual(emptyBond());
		}
	});

	it("keeps valid fields, clamps negatives, and drops unknown milestones", () => {
		const b = sanitizeBond({
			metAt: "2026-09-24T10:00:00.000Z",
			messages: 12,
			days: -4,
			lastDay: "2026-09-24",
			shared: 2,
			nameKnown: true,
			milestones: [{ id: "met", at: "2026-09-24T10:00:00.000Z" }, { id: "bogus", at: "x" }],
			toMention: ["friend", "bogus"],
		});
		expect(b.messages).toBe(12);
		expect(b.days).toBe(0);
		expect(b.milestones.map((m) => m.id)).toEqual(["met"]);
		expect(b.toMention).toEqual(["friend"]);
	});
});

describe("mergeBond", () => {
	// Two tabs talking on different days, each saving the bond it has in memory.
	const tabA = (() => {
		let b = talk(emptyBond(), at(2026, 9, 20), { nameKnown: true });
		b = talk(b, at(2026, 9, 21), { feeling: true });
		b = talk(b, at(2026, 9, 22));
		return b;
	})();
	const tabB = (() => {
		let b = talk(emptyBond(), at(2026, 9, 19));
		b = talk(b, at(2026, 9, 23), { event: true });
		return b;
	})();

	it("never lowers any count", () => {
		for (const [saved, incoming] of [[tabA, tabB], [tabB, tabA]]) {
			const m = mergeBond(saved, incoming);
			for (const key of ["messages", "days", "shared"] as const) {
				expect(m[key], key).toBeGreaterThanOrEqual(saved[key]);
				expect(m[key], key).toBeGreaterThanOrEqual(incoming[key]);
			}
			expect(m.nameKnown).toBe(true);
		}
	});

	it("takes lastDay from the side that has counted at least as many days", () => {
		expect(mergeBond(tabA, tabB).lastDay).toBe(tabA.lastDay);
		expect(mergeBond(tabB, tabA).lastDay).toBe(tabA.lastDay);
		expect(mergeBond({ ...tabA, lastDay: "x" }, { ...tabA, lastDay: "y" }).lastDay).toBe("y");
	});

	it("keeps the earliest metAt, ignoring a missing one", () => {
		expect(mergeBond(tabA, tabB).metAt).toBe(tabB.metAt);
		expect(mergeBond(tabB, tabA).metAt).toBe(tabB.metAt);
		expect(mergeBond({ ...tabA, metAt: null }, tabA).metAt).toBe(tabA.metAt);
		expect(mergeBond(tabA, { ...tabA, metAt: null }).metAt).toBe(tabA.metAt);
	});

	it("unions milestones by id, keeping the earliest time", () => {
		const m = mergeBond(tabA, tabB);
		const ids = m.milestones.map((x) => x.id);
		for (const id of ["met", "name", "firstFeeling", "firstEvent"]) expect(ids.filter((x) => x === id), id).toHaveLength(1);
		expect(m.milestones.find((x) => x.id === "met")?.at).toBe(new Date(at(2026, 9, 19)).toISOString());
	});

	it("drops a queued mention that another tab already reached", () => {
		const saved: Bond = { ...tabA, milestones: [...tabA.milestones, { id: "friend", at: "2026-09-22T10:00:00.000Z" }] };
		const incoming: Bond = { ...tabB, toMention: ["firstEvent", "friend"] };
		expect(mergeBond(saved, incoming).toMention).toEqual(["firstEvent"]);
		// Reached in this tab too, so it is still this tab's to say.
		const both: Bond = { ...incoming, milestones: [...incoming.milestones, { id: "friend", at: "2026-09-23T10:00:00.000Z" }] };
		expect(mergeBond(saved, both).toMention).toEqual(["firstEvent", "friend"]);
	});

	it("is idempotent, and a fresh saved bond changes nothing", () => {
		for (const b of [tabA, tabB, emptyBond()]) expect(mergeBond(b, b)).toEqual(b);
		expect(mergeBond(emptyBond(), tabA)).toEqual(tabA);
	});
});
