// The work budget (spec section 4.7): blocks accrue continuously by the wall clock, capped. Task 0 stub; T7 builds it.
export const BLOCKS_PER_DAY = 150;
export const MS_PER_BLOCK = 576_000; // 86,400,000 / 150
export const BUDGET_CAP = 450; // three days
export const LIVE_BLOCKS = 40; // laid live on return; the rest is the time-lapse

// Whole blocks accrued since budgetAt (ISO), 0 to BUDGET_CAP; 0 for a time in the future or one that cannot be read.
export function accrued(budgetAt: string, now: number): number {
	void [budgetAt, now];
	throw new Error("not built: accrued");
}
// The budget_at after spending n blocks (at most what has accrued), as ISO.
export function spendBudget(budgetAt: string, n: number, now: number): string {
	void [budgetAt, n, now];
	throw new Error("not built: spendBudget");
}
// How the blocks accrued while away are spent on return.
export function splitReturn(accrued: number): { lapse: number; live: number } {
	void accrued;
	throw new Error("not built: splitReturn");
}
// Milliseconds until the next block accrues (MS_PER_BLOCK while at the cap).
export function nextAccrualIn(budgetAt: string, now: number): number {
	void [budgetAt, now];
	throw new Error("not built: nextAccrualIn");
}
