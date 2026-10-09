import { describe, expect, it } from "vitest";
import { isVillageRow, lay, markSaved, needsSave, nextIndex, resume, SAVE_EVERY, saveRow, villageLine, type VillageRow } from "./progress";

const NOW = "2026-10-09T12:00:00.000Z";
const START = "2026-10-01T09:00:00.000Z";
const row = (laid: number, extra: Partial<VillageRow> = {}): VillageRow => ({ room: "hall", laid, started_at: START, finished_at: null, ...extra });

describe("resuming", () => {
	it("starts a new hall at the first block", () => {
		const p = resume([], "hall", 180, NOW);
		expect(p).toEqual({ room: "hall", laid: 0, total: 180, startedAt: NOW, finishedAt: null, saved: 0 });
		expect(nextIndex(p)).toBe(0);
	});
	it("picks up at the right block", () => {
		const p = resume([row(37)], "hall", 180, NOW);
		expect(nextIndex(p)).toBe(37);
		expect(p.startedAt).toBe(START);
		expect(p.saved).toBe(37);
	});
	it("never goes beyond the end or below zero", () => {
		const over = resume([row(500)], "hall", 180, NOW);
		expect(over.laid).toBe(180);
		expect(over.finishedAt).toBe(NOW);
		expect(nextIndex(over)).toBeNull();
		expect(resume([row(-4)], "hall", 180, NOW).laid).toBe(0);
		expect(resume([row(12.7)], "hall", 180, NOW).laid).toBe(12);
	});
	it("keeps the saved finish time", () => {
		expect(resume([row(180, { finished_at: "2026-10-05T10:00:00.000Z" })], "hall", 180, NOW).finishedAt).toBe("2026-10-05T10:00:00.000Z");
	});
	it("reads only well-formed rows", () => {
		const bad = [null, "hall", { room: "hall" }, { ...row(3), laid: "3" }, { ...row(3), laid: Number.NaN }, { ...row(3), finished_at: 5 }];
		expect(isVillageRow(row(3))).toBe(true);
		expect(bad.map(isVillageRow)).toEqual([false, false, false, false, false, false]);
	});
});

describe("laying", () => {
	it("says when the hall starts and when it finishes, and nothing in between", () => {
		const first = lay(resume([], "hall", 3, NOW), NOW);
		expect(first.news).toEqual({ room: "hall", event: "started" });
		const second = lay(first.progress, NOW);
		expect(second.news).toBeNull();
		const last = lay(second.progress, NOW);
		expect(last.news).toEqual({ room: "hall", event: "finished" });
		expect(last.progress.finishedAt).toBe(NOW);
		expect(lay(last.progress, NOW)).toEqual({ progress: last.progress, news: null });
	});
});

describe("saving", () => {
	it("saves every eight blocks, when the tab is hidden, and on the last block", () => {
		let p = resume([row(10)], "hall", 180, NOW);
		expect(needsSave(p, "hidden")).toBe(false);
		for (let i = 0; i < SAVE_EVERY - 1; i++) p = lay(p, NOW).progress;
		expect(needsSave(p, "block")).toBe(false);
		expect(needsSave(p, "hidden")).toBe(true);
		p = lay(p, NOW).progress;
		expect(needsSave(p, "block")).toBe(true);
		expect(needsSave(lay(resume([row(179)], "hall", 180, NOW), NOW).progress, "block")).toBe(true);
	});
	it("never moves the saved count backwards", () => {
		const p = markSaved(resume([row(40)], "hall", 180, NOW), 32);
		expect(p.saved).toBe(40);
		expect(markSaved(p, 48).saved).toBe(48);
	});
	it("writes the row the table takes", () => {
		expect(saveRow(resume([row(37)], "hall", 180, NOW))).toEqual({ room: "hall", laid: 37, started_at: START, finished_at: null });
	});
});

describe("his line when the AI is off", () => {
	it("says it plainly, in full forms", () => {
		expect(villageLine({ room: "hall", event: "started" })).toBe("I have begun the hall.");
		expect(villageLine({ room: "hall", event: "finished" })).toBe("The hall is finished.");
		for (const event of ["started", "finished"] as const) {
			const line = villageLine({ room: "hall", event });
			expect(line).not.toMatch(/[!']/);
			expect(line).not.toMatch(/remember/i);
		}
	});
});
