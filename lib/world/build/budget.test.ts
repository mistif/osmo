import { describe, expect, it } from "vitest";
import { accrued, BLOCKS_PER_DAY, BUDGET_CAP, LIVE_BLOCKS, MS_PER_BLOCK, nextAccrualIn, spendBudget, splitReturn } from "./budget";

const T0 = Date.parse("2026-10-11T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const M = 2_160_000; // 36 minutes

describe("the work budget (spec 4.7)", () => {
	it("accrues one block every 36 minutes: 40 a day, at most three days' worth (120)", () => {
		// The grammar's builds average about 50 to 65 blocks and a world holds about 3,000 to 4,300 free blocks, so 40 a
		// day fills it in about three months (spec 1, answer 5), about one build a day.
		expect([BLOCKS_PER_DAY, MS_PER_BLOCK, BUDGET_CAP, LIVE_BLOCKS]).toEqual([40, M, 120, 40]);
		expect(BLOCKS_PER_DAY * MS_PER_BLOCK).toBe(86_400_000);
		expect(accrued(iso(T0), T0 + M - 1)).toBe(0);
		expect(accrued(iso(T0), T0 + M)).toBe(1);
		expect(accrued(iso(T0), T0 + 86_400_000)).toBe(40);
		expect(accrued(iso(T0), T0 + 3 * 86_400_000)).toBe(120);
		expect(accrued(iso(T0), T0 + 30 * 86_400_000)).toBe(120);
	});
	it("a sleeping laptop and a clock change: never negative, never over the cap, no burst after the clock went back", () => {
		expect(accrued(iso(T0), T0 + 9 * 3_600_000)).toBe(15);
		expect(accrued(iso(T0), T0 - 3_600_000)).toBe(0);
		const kept = spendBudget(iso(T0), 5, T0 - 3_600_000);
		expect(kept).toBe(iso(T0));
		expect(accrued(kept, T0 + M)).toBe(1);
		expect(accrued("not a date", T0)).toBe(0);
		expect(accrued(iso(T0), Number.NaN)).toBe(0);
	});
	it("spends what has accrued, counting from three days back at most", () => {
		expect(spendBudget(iso(T0), 1, T0 + M * 10)).toBe(iso(T0 + M));
		const away = T0 + 10 * 86_400_000;
		const after = spendBudget(iso(T0), 1, away);
		expect(after).toBe(iso(away - 120 * M + M));
		expect(accrued(after, away)).toBe(119);
		expect(spendBudget(iso(T0), 1000, T0 + M * 3)).toBe(iso(T0 + M * 3));
	});
	it("splits a return: all but the last 40 as the time-lapse", () => {
		expect(splitReturn(120)).toEqual({ lapse: 80, live: 40 });
		expect(splitReturn(41)).toEqual({ lapse: 1, live: 40 });
		expect(splitReturn(30)).toEqual({ lapse: 0, live: 30 });
		expect(splitReturn(0)).toEqual({ lapse: 0, live: 0 });
		expect(splitReturn(-3)).toEqual({ lapse: 0, live: 0 });
	});
	it("says when the next block comes, across midnight like any minute", () => {
		expect(nextAccrualIn(iso(T0), T0 + 100_000)).toBe(M - 100_000);
		expect(nextAccrualIn(iso(T0), T0 + 4 * 86_400_000)).toBe(M);
		expect(nextAccrualIn(iso(T0), T0 - 1_000)).toBe(M + 1_000);
		const late = Date.parse("2026-10-11T23:55:00.000Z");
		expect(accrued(iso(late), late + M)).toBe(1);
	});
});
