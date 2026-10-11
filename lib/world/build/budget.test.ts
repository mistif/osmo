import { describe, expect, it } from "vitest";
import { accrued, BUDGET_CAP, LIVE_BLOCKS, MS_PER_BLOCK, nextAccrualIn, spendBudget, splitReturn } from "./budget";

const T0 = Date.parse("2026-10-11T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("the work budget (spec 4.7)", () => {
	it("accrues one block every 576 s: 150 a day, at most 450", () => {
		expect([MS_PER_BLOCK, BUDGET_CAP, LIVE_BLOCKS]).toEqual([576_000, 450, 40]);
		expect(accrued(iso(T0), T0 + 575_999)).toBe(0);
		expect(accrued(iso(T0), T0 + 576_000)).toBe(1);
		expect(accrued(iso(T0), T0 + 86_400_000)).toBe(150);
		expect(accrued(iso(T0), T0 + 3 * 86_400_000)).toBe(450);
		expect(accrued(iso(T0), T0 + 30 * 86_400_000)).toBe(450);
	});
	it("a sleeping laptop and a clock change: never negative, never over 450, no burst after the clock went back", () => {
		expect(accrued(iso(T0), T0 + 9 * 3_600_000)).toBe(56);
		expect(accrued(iso(T0), T0 - 3_600_000)).toBe(0);
		const kept = spendBudget(iso(T0), 5, T0 - 3_600_000);
		expect(kept).toBe(iso(T0));
		expect(accrued(kept, T0 + 576_000)).toBe(1);
		expect(accrued("not a date", T0)).toBe(0);
		expect(accrued(iso(T0), Number.NaN)).toBe(0);
	});
	it("spends what has accrued, counting from three days back at most", () => {
		expect(spendBudget(iso(T0), 1, T0 + 576_000 * 10)).toBe(iso(T0 + 576_000));
		const away = T0 + 10 * 86_400_000;
		const after = spendBudget(iso(T0), 1, away);
		expect(after).toBe(iso(away - 450 * 576_000 + 576_000));
		expect(accrued(after, away)).toBe(449);
		expect(spendBudget(iso(T0), 1000, T0 + 576_000 * 3)).toBe(iso(T0 + 576_000 * 3));
	});
	it("splits a return: all but the last 40 as the time-lapse", () => {
		expect(splitReturn(450)).toEqual({ lapse: 410, live: 40 });
		expect(splitReturn(41)).toEqual({ lapse: 1, live: 40 });
		expect(splitReturn(30)).toEqual({ lapse: 0, live: 30 });
		expect(splitReturn(0)).toEqual({ lapse: 0, live: 0 });
		expect(splitReturn(-3)).toEqual({ lapse: 0, live: 0 });
	});
	it("says when the next block comes, across midnight like any minute", () => {
		expect(nextAccrualIn(iso(T0), T0 + 100_000)).toBe(476_000);
		expect(nextAccrualIn(iso(T0), T0 + 4 * 86_400_000)).toBe(576_000);
		expect(nextAccrualIn(iso(T0), T0 - 1_000)).toBe(577_000);
		const late = Date.parse("2026-10-11T23:55:00.000Z");
		expect(accrued(iso(late), late + 576_000)).toBe(1);
	});
});
