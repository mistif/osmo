// What the room knows about the thing being built or shown: one state, a few verbs. No React, no DOM, no clock of its
// own (the timers come in), so it can be tested with a hand-driven run. The hook (components/osmo/use-build.ts) wraps it.
import { LINES } from "../artifacts/lines";
import { singleFlight, type RunTicket, type ThingView } from "../artifacts/build-run";

// The room writes the build's progress at most 30 times a second, as it writes --voice (spec 6).
export const VIEW_GAP_MS = 33;
// data-built stays on for 1.6 seconds after the thing renders: the settle (spec 6).
export const BUILT_MS = 1600;
// A build that has not ended in 90 seconds is stopped through its signal and ends in the failed line.
export const BUILD_TIMEOUT_MS = 90_000;

export type BuildState = {
	view: ThingView | null;
	// "built" for a thing made just now (Keep and Discard), "opened" for a saved one (Delete).
	origin: "built" | "opened" | null;
	notice: string | null;
	// True for BUILT_MS after a build renders.
	built: boolean;
};

export type ControllerDeps = {
	run(ticket: RunTicket, onView: (v: ThingView) => void, signal: AbortSignal): Promise<void>;
	remove(id: string): Promise<boolean>;
	setTimer(fn: () => void, ms: number): unknown;
	clearTimer(handle: unknown): void;
};

const REST: BuildState = { view: null, origin: null, notice: null, built: false };

export function createBuildController(deps: ControllerDeps) {
	let state: BuildState = REST;
	const listeners = new Set<() => void>();
	const flight = singleFlight();
	let release: (() => void) | null = null;
	let abort: AbortController | null = null;
	let gate: unknown = null;
	let held: ThingView | null = null;
	let settle: unknown = null;
	let limit: unknown = null;

	const set = (next: Partial<BuildState>) => {
		state = { ...state, ...next };
		listeners.forEach((l) => l());
	};
	const stopTimers = () => {
		if (gate !== null) deps.clearTimer(gate);
		if (settle !== null) deps.clearTimer(settle);
		gate = settle = held = null;
	};
	const running = () => release !== null;
	const stopLimit = () => {
		if (limit !== null) deps.clearTimer(limit);
		limit = null;
	};
	const finish = () => {
		stopLimit();
		release?.();
		release = null;
		abort = null;
	};

	function onView(token: AbortController, v: ThingView) {
		if (abort !== token) return; // a cancelled or finished run speaks no more
		if (v.phase === "building") {
			if (gate === null) {
				set({ view: v });
				openGate();
			} else held = v;
			return;
		}
		if (gate !== null) deps.clearTimer(gate);
		gate = held = null;
		stopLimit();
		if (v.phase === "ready") {
			if (settle !== null) deps.clearTimer(settle);
			set({ view: v, origin: "built", notice: null, built: true });
			settle = deps.setTimer(() => {
				settle = null;
				set({ built: false });
			}, BUILT_MS);
		} else set({ view: v, notice: null, built: false });
	}
	function openGate() {
		gate = deps.setTimer(() => {
			gate = null;
			if (held) {
				const v = held;
				held = null;
				set({ view: v });
				openGate();
			}
		}, VIEW_GAP_MS);
	}

	return {
		getState: () => state,
		subscribe(l: () => void) {
			listeners.add(l);
			return () => void listeners.delete(l);
		},
		start(ticket: RunTicket): boolean {
			const got = flight.tryStart();
			if (!got) {
				set({ notice: LINES.busy });
				return false;
			}
			release = got;
			stopTimers();
			const token = (abort = new AbortController());
			set({ view: { phase: "building", title: null, blocks: 0, progress: 0 }, origin: "built", notice: null, built: false });
			limit = deps.setTimer(() => {
				limit = null;
				if (abort !== token) return;
				token.abort();
				finish();
				if (gate !== null) deps.clearTimer(gate);
				gate = held = null;
				set({ view: { phase: "failed", line: LINES.failed }, notice: null, built: false });
			}, BUILD_TIMEOUT_MS);
			// A throw before the first await is the same failure as a rejection.
			let ran: Promise<void>;
			try {
				ran = deps.run(ticket, (v) => onView(token, v), token.signal);
			} catch (e) {
				ran = Promise.reject(e);
			}
			ran
				.catch(() => onView(token, { phase: "failed", line: LINES.failed }))
				.finally(() => {
					if (abort === token) finish();
				});
			return true;
		},
		// A crisis, Lock or leaving the room: stop a streaming build at once, say nothing, free the next build.
		// An opened or finished thing stays: the spec only aborts a build in flight.
		cancel() {
			if (!running()) return;
			abort?.abort();
			finish();
			stopTimers();
			if (state !== REST) set(REST);
		},
		async discard() {
			const v = state.view;
			if (!v || v.phase !== "ready") return;
			let removed = false;
			try {
				removed = await deps.remove(v.id);
			} catch {
				removed = false;
			}
			if (removed) {
				if (state.view === v) set({ ...REST });
			} else set({ notice: LINES.deleteFailed });
		},
		close() {
			if (state.view?.phase === "building") return; // a build in flight is stopped with cancel, not closed
			stopTimers();
			set(REST);
		},
		show(id: string, title: string, source: string) {
			if (running()) {
				set({ notice: LINES.busy });
				return;
			}
			stopTimers();
			set({ view: { phase: "ready", id, title, source }, origin: "opened", notice: null, built: false });
		},
	};
}

export type BuildController = ReturnType<typeof createBuildController>;
