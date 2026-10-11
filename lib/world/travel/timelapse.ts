// The time-lapse on return (spec section 4.7): the camera visits each site and its blocks pop in quickly. A pure
// schedule. Task 0 stub; T10 builds it.
import type { Block } from "../blueprints/types";
import type { WorldPt } from "../map/types";

export const LAPSE_MS = 10_000;
export const VISIT_MS = 400; // the camera's move to each site
export type LapseRun = { key: string; blocks: readonly Block[] }; // a build's blocks to pop in, in laying order
// When (ms from the start) a block pops in, and where the camera looks then (world px).
export type Shot = { at: number; key: string; block: Block; look: WorldPt };
export function lapseSchedule(runs: readonly LapseRun[], ms: number = LAPSE_MS): Shot[] {
	void [runs, ms];
	throw new Error("not built: lapseSchedule");
}
// How many shots have popped in by `elapsed`.
export function shotsDue(shots: readonly Shot[], elapsed: number): number {
	void [shots, elapsed];
	throw new Error("not built: shotsDue");
}
// Where the camera looks at `elapsed`: the current shot's site, or null before the first and after the last.
export function lookAt(shots: readonly Shot[], elapsed: number): WorldPt | null {
	void [shots, elapsed];
	throw new Error("not built: lookAt");
}
