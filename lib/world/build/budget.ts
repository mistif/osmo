// The work budget (spec section 4.7): blocks accrue continuously by the wall clock, capped. Task 0 stub; T7 builds it.
// The world fills in about three months (spec 1, answer 5) at about one build a day: the grammar's builds average about
// 50 to 65 blocks and a generated world holds about 3,000 to 4,300 free blocks, so 40 a day (fix round; the spec's 150
// was sized for medium builds of about 150 blocks, which the grammar rarely makes).
export const BLOCKS_PER_DAY = 40;
export const MS_PER_BLOCK = 2_160_000; // 86,400,000 / 40: one every 36 minutes
export const BUDGET_CAP = 3 * BLOCKS_PER_DAY; // three days
export const LIVE_BLOCKS = 40; // laid live on return; the rest is the time-lapse

// Whole blocks accrued since budgetAt (ISO), 0 to BUDGET_CAP; 0 for a time in the future or one that cannot be read.
export function accrued(budgetAt: string, now: number): number {
	const t = Date.parse(budgetAt);
	if (!Number.isFinite(t) || !Number.isFinite(now) || now <= t) return 0;
	return Math.min(BUDGET_CAP, Math.floor((now - t) / MS_PER_BLOCK));
}
// The budget_at after spending n blocks (at most what has accrued), as ISO.
export function spendBudget(budgetAt: string, n: number, now: number): string {
	const t = Date.parse(budgetAt);
	const k = Math.max(0, Math.min(Math.floor(n), accrued(budgetAt, now)));
	if (!Number.isFinite(t) || k === 0) return budgetAt;
	return new Date(Math.max(t, now - BUDGET_CAP * MS_PER_BLOCK) + k * MS_PER_BLOCK).toISOString();
}
// How the blocks accrued while away are spent on return.
export function splitReturn(accrued: number): { lapse: number; live: number } {
	const n = Number.isFinite(accrued) ? Math.max(0, Math.floor(accrued)) : 0;
	return { lapse: Math.max(0, n - LIVE_BLOCKS), live: Math.min(n, LIVE_BLOCKS) };
}
// Milliseconds until the next block accrues (MS_PER_BLOCK while at the cap).
export function nextAccrualIn(budgetAt: string, now: number): number {
	const t = Date.parse(budgetAt);
	if (!Number.isFinite(t) || !Number.isFinite(now)) return MS_PER_BLOCK;
	if (now < t) return t - now + MS_PER_BLOCK;
	if (accrued(budgetAt, now) >= BUDGET_CAP) return MS_PER_BLOCK;
	return MS_PER_BLOCK - ((now - t) % MS_PER_BLOCK);
}
