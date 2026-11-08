import { describe, expect, it } from "vitest";
import { BUILT_MS, BUILD_TIMEOUT_MS, createBuildController, VIEW_GAP_MS, type ControllerDeps } from "./build-controller";
import { LINES } from "../artifacts/lines";
import type { RunTicket, ThingView } from "../artifacts/build-run";

// A hand-driven clock: timers run only when the test says so.
function clock() {
	let next = 1;
	const timers = new Map<number, { fn: () => void; ms: number }>();
	return {
		setTimer: (fn: () => void, ms: number) => {
			timers.set(next, { fn, ms });
			return next++;
		},
		clearTimer: (h: unknown) => void timers.delete(h as number),
		pending: () => [...timers.values()].map((t) => t.ms),
		fire(ms: number) {
			for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); }
		},
	};
}

const TICKET = { brief: "a tip splitter", actionId: 7 };
const building = (n: number): ThingView => ({ phase: "building", title: null, blocks: n, progress: n / 10 });
const ready: ThingView = { phase: "ready", id: "id-1", title: "Tip splitter", source: "// title: Tip splitter\n" };

// A run the test finishes by hand: feed(view) pushes a view to the controller, end() settles the promise.
function setup(overrides: Partial<ControllerDeps> = {}) {
	const c = clock();
	const runs: { ticket: RunTicket; feed(v: ThingView): void; end(): void; signal: AbortSignal }[] = [];
	const removed: string[] = [];
	const ctl = createBuildController({
		run: (ticket, onView, signal) =>
			new Promise<void>((resolve) => {
				runs.push({ ticket, feed: onView, end: resolve, signal });
				signal.addEventListener("abort", () => resolve());
			}),
		remove: async (id) => (removed.push(id), true),
		setTimer: c.setTimer,
		clearTimer: c.clearTimer,
		...overrides,
	});
	return { ctl, runs, removed, c };
}

describe("createBuildController", () => {
	it("starts dark and quiet", () => {
		const { ctl } = setup();
		expect(ctl.getState()).toEqual({ view: null, origin: null, notice: null, built: false });
	});

	it("start shows an empty building view at once and hands the ticket to the run", () => {
		const { ctl, runs } = setup();
		ctl.start(TICKET);
		expect(ctl.getState().view).toEqual({ phase: "building", title: null, blocks: 0, progress: 0 });
		expect(ctl.getState().origin).toBe("built");
		expect(runs[0].ticket).toEqual(TICKET);
	});

	it("a second ticket while one builds is declined with his line and starts nothing", () => {
		const { ctl, runs } = setup();
		ctl.start(TICKET);
		ctl.start({ brief: "another", actionId: 8 });
		expect(runs.length).toBe(1);
		expect(ctl.getState().notice).toBe(LINES.busy);
		expect(ctl.getState().view?.phase).toBe("building");
	});

	it("building views are coalesced to one per gap; the newest wins", () => {
		const { ctl, runs, c } = setup();
		ctl.start(TICKET);
		runs[0].feed(building(1)); // applied at once
		expect(ctl.getState().view).toEqual(building(1));
		runs[0].feed(building(2));
		runs[0].feed(building(3)); // held
		expect(ctl.getState().view).toEqual(building(1));
		expect(c.pending()).toContain(VIEW_GAP_MS);
		c.fire(VIEW_GAP_MS);
		expect(ctl.getState().view).toEqual(building(3));
	});

	it("a ready view lands at once even with a held building view, and sets built for 1.6 seconds", () => {
		const { ctl, runs, c } = setup();
		ctl.start(TICKET);
		runs[0].feed(building(1));
		runs[0].feed(building(2));
		runs[0].feed(ready);
		expect(ctl.getState().view).toEqual(ready);
		expect(ctl.getState().built).toBe(true);
		c.fire(VIEW_GAP_MS); // the held view must not overwrite the ready one
		expect(ctl.getState().view).toEqual(ready);
		expect(c.pending()).toContain(BUILT_MS);
		c.fire(BUILT_MS);
		expect(ctl.getState().built).toBe(false);
		expect(ctl.getState().view).toEqual(ready);
	});

	it("a failed view lands at once and is not built", () => {
		const { ctl, runs } = setup();
		ctl.start(TICKET);
		runs[0].feed({ phase: "failed", line: LINES.failed });
		expect(ctl.getState().view).toEqual({ phase: "failed", line: LINES.failed });
		expect(ctl.getState().built).toBe(false);
	});

	it("the next build can start once the run has ended", async () => {
		const { ctl, runs } = setup();
		ctl.start(TICKET);
		runs[0].feed(ready);
		runs[0].end();
		await Promise.resolve();
		await Promise.resolve();
		ctl.start({ brief: "next", actionId: null });
		expect(runs.length).toBe(2);
		expect(ctl.getState().notice).toBeNull();
	});

	it("cancel aborts the run, clears the panel, and frees the next build at once", () => {
		const { ctl, runs, c } = setup();
		ctl.start(TICKET);
		runs[0].feed(building(2));
		runs[0].feed(building(3));
		ctl.cancel();
		expect(runs[0].signal.aborted).toBe(true);
		expect(ctl.getState()).toEqual({ view: null, origin: null, notice: null, built: false });
		expect(c.pending()).toEqual([]);
		ctl.start({ brief: "next", actionId: null });
		expect(runs.length).toBe(2);
		// a late view from the cancelled run changes nothing
		runs[0].feed(ready);
		expect(ctl.getState().view?.phase).toBe("building");
	});

	it("cancel with nothing running is harmless", () => {
		const { ctl } = setup();
		ctl.cancel();
		expect(ctl.getState().view).toBeNull();
	});

	it("discard removes the row, then clears the panel", async () => {
		const { ctl, runs, removed } = setup();
		ctl.start(TICKET);
		runs[0].feed(ready);
		await ctl.discard();
		expect(removed).toEqual(["id-1"]);
		expect(ctl.getState().view).toBeNull();
	});

	it("discard that fails keeps the thing and says so", async () => {
		const { ctl, runs } = setup({ remove: async () => false });
		ctl.start(TICKET);
		runs[0].feed(ready);
		await ctl.discard();
		expect(ctl.getState().view).toEqual(ready);
		expect(ctl.getState().notice).toBe(LINES.deleteFailed);
	});

	it("discard with no ready thing removes nothing", async () => {
		const { ctl, removed } = setup();
		await ctl.discard();
		expect(removed).toEqual([]);
	});

	it("show opens a saved thing as opened, not built; close clears it", () => {
		const { ctl } = setup();
		ctl.show("id-9", "Timer", "// title: Timer\n");
		expect(ctl.getState()).toEqual({ view: { phase: "ready", id: "id-9", title: "Timer", source: "// title: Timer\n" }, origin: "opened", notice: null, built: false });
		ctl.close();
		expect(ctl.getState().view).toBeNull();
	});

	it("close clears a failed view but leaves a build in flight alone", () => {
		const { ctl, runs } = setup();
		ctl.start(TICKET);
		ctl.close();
		expect(ctl.getState().view?.phase).toBe("building");
		runs[0].feed({ phase: "failed", line: LINES.failed });
		ctl.close();
		expect(ctl.getState().view).toBeNull();
	});

	it("show while a build runs is declined", () => {
		const { ctl, runs } = setup();
		ctl.start(TICKET);
		ctl.show("id-9", "Timer", "x");
		expect(ctl.getState().notice).toBe(LINES.busy);
		expect(ctl.getState().view?.phase).toBe("building");
		runs[0].end();
	});

	it("a run that throws ends in his failed line and frees the next build", async () => {
		const { ctl } = setup({ run: async () => { throw new Error("boom"); } });
		ctl.start(TICKET);
		await Promise.resolve();
		await Promise.resolve();
		expect(ctl.getState().view).toEqual({ phase: "failed", line: LINES.failed });
		ctl.start(TICKET);
		expect(ctl.getState().view?.phase).toBe("building");
	});

	it("a refused second ticket's notice clears when the build reaches ready or failed", () => {
		for (const end of [ready, { phase: "failed", line: LINES.failed } as ThingView]) {
			const { ctl, runs } = setup();
			ctl.start(TICKET);
			ctl.start({ brief: "another", actionId: 8 });
			expect(ctl.getState().notice).toBe(LINES.busy);
			runs[0].feed(end);
			expect(ctl.getState().notice).toBeNull();
		}
	});

	it("a run that throws synchronously ends in his failed line instead of escaping start", async () => {
		const { ctl } = setup({
			run: () => {
				throw new Error("boom");
			},
		});
		expect(() => ctl.start(TICKET)).not.toThrow();
		await Promise.resolve();
		await Promise.resolve();
		expect(ctl.getState().view).toEqual({ phase: "failed", line: LINES.failed });
		ctl.start(TICKET);
		expect(ctl.getState().view?.phase).toBe("building");
	});

	it("a remove that throws leaves the thing and says so; discard never rejects", async () => {
		const { ctl, runs } = setup({
			remove: async () => {
				throw new Error("net");
			},
		});
		ctl.start(TICKET);
		runs[0].feed(ready);
		await expect(ctl.discard()).resolves.toBeUndefined();
		expect(ctl.getState().view).toEqual(ready);
		expect(ctl.getState().notice).toBe(LINES.deleteFailed);
	});

	it("cancel leaves an opened thing, and a finished one, alone", async () => {
		const { ctl, runs } = setup();
		ctl.show("id-9", "Timer", "x");
		ctl.cancel();
		expect(ctl.getState().view?.phase).toBe("ready");
		expect(ctl.getState().origin).toBe("opened");
		ctl.close();
		ctl.start(TICKET);
		runs[0].feed(ready);
		runs[0].end();
		await Promise.resolve();
		await Promise.resolve();
		ctl.cancel();
		expect(ctl.getState().view).toEqual(ready);
	});

	it("a build that runs past the timeout is aborted and ends in his failed line", () => {
		const { ctl, runs, c } = setup();
		ctl.start(TICKET);
		expect(BUILD_TIMEOUT_MS).toBe(90_000);
		expect(c.pending()).toContain(BUILD_TIMEOUT_MS);
		runs[0].feed(building(2));
		c.fire(BUILD_TIMEOUT_MS);
		expect(runs[0].signal.aborted).toBe(true);
		expect(ctl.getState().view).toEqual({ phase: "failed", line: LINES.failed });
		expect(ctl.getState().built).toBe(false);
		runs[0].feed(ready); // a late view from the aborted run changes nothing
		expect(ctl.getState().view?.phase).toBe("failed");
		ctl.start(TICKET);
		expect(runs.length).toBe(2);
	});

	it("a build that finishes in time leaves no timeout behind, and cancel clears it", () => {
		const a = setup();
		a.ctl.start(TICKET);
		a.runs[0].feed(ready);
		expect(a.c.pending()).not.toContain(BUILD_TIMEOUT_MS);
		const b = setup();
		b.ctl.start(TICKET);
		b.ctl.cancel();
		expect(b.c.pending()).toEqual([]);
	});

	it("subscribers hear every change and can leave", () => {
		const { ctl } = setup();
		let heard = 0;
		const off = ctl.subscribe(() => heard++);
		ctl.start(TICKET);
		expect(heard).toBeGreaterThan(0);
		const before = heard;
		off();
		ctl.cancel();
		expect(heard).toBe(before);
	});

	it("getState returns the same object until something changes", () => {
		const { ctl } = setup();
		const a = ctl.getState();
		expect(ctl.getState()).toBe(a);
		ctl.start(TICKET);
		expect(ctl.getState()).not.toBe(a);
	});
});
