// The time-lapse on return (spec section 4.7): the camera visits each site and its blocks pop in quickly. A pure
// schedule.
import { TILE, type Block } from "../blueprints/types";
import type { WorldPt } from "../map/types";

export const LAPSE_MS = 10_000;
export const VISIT_MS = 400; // the camera's move to each site
export type LapseRun = { key: string; blocks: readonly Block[] }; // a build's blocks to pop in, in laying order
// When (ms from the start) a block pops in, and where the camera looks then (world px).
export type Shot = { at: number; key: string; block: Block; look: WorldPt };

// The centre of the box a run's blocks fill, world px.
const centreOf = (blocks: readonly Block[]): WorldPt => {
	const xs = blocks.map((b) => b.x);
	const ys = blocks.map((b) => b.y);
	return { x: ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * TILE, y: ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * TILE };
};
// The shots of every run, in order: the time is shared by the runs' sizes, each run first spends its visit (at most half
// its share) getting there, then pops its blocks in at an even pace; the last block of the last run lands at `ms`.
export function lapseSchedule(runs: readonly LapseRun[], ms: number = LAPSE_MS): Shot[] {
	const live = runs.filter((r) => r.blocks.length > 0);
	const n = live.reduce((s, r) => s + r.blocks.length, 0);
	if (n === 0) return [];
	const shots: Shot[] = [];
	let start = 0;
	for (const r of live) {
		const share = (ms * r.blocks.length) / n;
		const visit = Math.min(VISIT_MS, share / 2);
		const step = (share - visit) / r.blocks.length;
		const look = centreOf(r.blocks);
		r.blocks.forEach((block, i) => shots.push({ at: Math.round(start + visit + (i + 1) * step), key: r.key, block, look }));
		start += share;
	}
	return shots;
}
// How many shots have popped in by `elapsed`.
export function shotsDue(shots: readonly Shot[], elapsed: number): number {
	let k = 0;
	while (k < shots.length && shots[k].at <= elapsed) k++;
	return k;
}
// Where the camera looks at `elapsed`: the site of the next shot to pop in (so it is already there during a run's visit),
// or null once the last shot has popped in.
export function lookAt(shots: readonly Shot[], elapsed: number): WorldPt | null {
	if (shots.length === 0 || !(elapsed <= shots[shots.length - 1].at)) return null;
	return (shots.find((s) => s.at >= elapsed) ?? shots[shots.length - 1]).look;
}
