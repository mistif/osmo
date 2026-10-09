"use client";

// Osmo's village (spec docs/superpowers/specs/2026-10-09-osmo-village-design.md, phase 1): the sky, the sun that is
// his heart, the island, the hall he builds, and him with his line above his head. app/assistant.tsx loads it after
// first paint, and only when NEXT_PUBLIC_OSMO_SHELL2 and NEXT_PUBLIC_OSMO_WORLD are both on.
import { type RefObject, useEffect, useRef } from "react";
import { Figure } from "@/components/osmo/figure";
import type { AgentState } from "@/lib/agent/state";
import { facingViewer, look, newActor, pose, step, type Actor, type ActorEvent, type ActorKind, type ActorWorld } from "@/lib/world/actor";
import { blocksOf, REST_X, standX, START_X } from "@/lib/world/blueprints";
import { HALL } from "@/lib/world/blueprints/hall";
import { ISLAND } from "@/lib/world/blueprints/island";
import { GROUND_Y, TILE } from "@/lib/world/blueprints/types";
import { baseZoom, easing, follow, newCamera, settling, toScreen, zoomAt, zoomTo, ZOOM_IN, type Camera, type View } from "@/lib/world/camera";
import { canvasPainter, loadSheets, type Overrides } from "@/lib/world/canvas-painter";
import { bearing } from "@/lib/world/face";
import { FRAME_H } from "@/lib/world/osmo-sprite";
import { FRAME_MS, nextTickIn, shouldDraw, type DrawKey } from "@/lib/world/pace";
import { lay, markSaved, needsSave, nextIndex, resume, type RoomProgress, type VillageNews } from "@/lib/world/progress";
import { artFor, drawSky, drawWorld } from "@/lib/world/render";
import { roomEvents, type RoomSignals } from "@/lib/world/signals";
import { daylight, hourOf, phaseOf, skyAt, starField, sunAt } from "@/lib/world/sky";
import { loadVillage, saveRoom } from "@/lib/world/village-data";
import s from "./world.module.css";

export type WorldControl = { attend(): void; takeNews(): VillageNews | null };
export type WorldFixed = { hour?: number; laid?: number; pose?: ActorKind };
export type WorldProps = {
	agent: Pick<AgentState, "activations" | "mood">;
	colorA: string;
	colorB: string;
	signals: RoomSignals;
	said: string | null;
	heard: string | null;
	controlRef?: RefObject<WorldControl | null>;
	persist?: boolean;
	fixed?: WorldFixed;
};
type Engine = { send(e: ActorEvent): void; refresh(): void; takeNews(): VillageNews | null; dispose(): void };

// The loop, outside React: it reads the latest props through `live` and writes the canvases and a few CSS variables.
// Nothing in it may throw into React (a throw inside useEffect would unmount the room): a failure stops the world and
// logs one warning. `g` is shared with the wrapper so that a throw while starting can undo what was already set up.
type Guard = { dead: boolean; undo: (() => void)[] };
function startWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }): Engine | null {
	const g: Guard = { dead: false, undo: [] };
	try {
		return buildWorld(root, skyCanvas, canvas, live, g);
	} catch (err) {
		g.dead = true;
		for (const u of g.undo) u();
		console.warn("[village] The world could not start and has stopped.", err);
		return null;
	}
}

function buildWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }, g: Guard): Engine | null {
	const ctx = canvas.getContext("2d");
	const skyCtx = skyCanvas.getContext("2d");
	if (!ctx || !skyCtx) return null;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const persist = live.current.persist !== false;
	const ground = blocksOf(ISLAND);
	const hall = blocksOf(HALL);
	const stars = starField();
	const clock = () => performance.now();
	const hourNow = () => live.current.fixed?.hour ?? hourOf(new Date());
	const fixedLaid = () => live.current.fixed?.laid;

	let view: View = { w: 0, h: 0 };
	let actor: Actor = newActor(START_X, clock(), hourNow());
	let camera: Camera = newCamera(actor.x, view, 2);
	// The room: unknown until the one read of the visit answers. The dev page: a local hall from nothing.
	let progress: RoomProgress | null = persist ? null : resume([], "hall", hall.length, new Date().toISOString());
	let canSave = false;
	let saving = false;
	let news: VillageNews | null = null;
	let overrides: Overrides = {};
	let scarf = live.current.colorA;
	// How dark it is, in eighths: the world's art is graded toward night by it (artFor), so a step rebuilds the atlases.
	const darkAt = (hour: number) => Math.round((1 - daylight(hour)) * 8) / 8;
	let dark = darkAt(hourNow());
	let painter = canvasPainter(ctx, artFor(scarf, dark), overrides);
	const skyPainter = canvasPainter(skyCtx, artFor(scarf));
	let skyKey = "";
	let drawn: DrawKey | null = null;
	let posed: { kind: ActorKind; since: number } | null = null;
	let lastHour = Math.floor(hourNow());
	let last = clock();
	let timer: ReturnType<typeof setTimeout> | null = null;

	const laidCount = () => fixedLaid() ?? progress?.laid ?? 0;
	// The block he works on next: none while the count is pinned, before the read answers, or once the hall is done.
	const nextBlock = () => {
		if (fixedLaid() !== undefined || !progress) return null;
		const i = nextIndex(progress);
		return i === null ? null : hall[i];
	};
	const world = (): ActorWorld => {
		const sig = live.current.signals;
		const next = nextBlock();
		return {
			next: next ? standX(next) : null,
			restX: REST_X,
			speed: bearing(live.current.agent, Date.now(), hourNow()).speed,
			held: sig.inTalk || sig.thinking || sig.speaking,
		};
	};
	const save = async () => {
		if (!progress || !canSave || saving) return;
		saving = true;
		const snap = progress;
		try {
			const ok = await saveRoom(snap);
			if (ok && progress) progress = markSaved(progress, snap.laid);
		} finally {
			saving = false;
		}
	};
	const onLaid = () => {
		if (!progress || fixedLaid() !== undefined) return;
		const r = lay(progress, new Date().toISOString());
		progress = r.progress;
		if (r.news) news = r.news;
		if (needsSave(progress, "block")) void save();
	};
	const apply = (e: ActorEvent) => {
		const r = step(actor, e, world());
		actor = r.actor;
		if (r.laid) onLaid();
	};
	// One timer, never faster than FRAME_MS (30 frames a second): a request for "the next frame" waits out what is
	// left of the frame since the last draw, and a longer request waits as asked.
	const schedule = (ms: number | null) => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		if (g.dead || ms === null) return;
		timer = setTimeout(frame, ms <= FRAME_MS ? Math.max(0, FRAME_MS - (clock() - last)) : ms);
	};
	// A throw stops the world for good: the loop is cancelled and one warning says why.
	const fail = (err: unknown) => {
		if (g.dead) return;
		g.dead = true;
		schedule(null);
		console.warn("[village] The world has stopped.", err);
	};
	const guarded =
		<A extends unknown[]>(fn: (...args: A) => void) =>
		(...args: A): void => {
			if (g.dead) return;
			try {
				fn(...args);
			} catch (err) {
				fail(err);
			}
		};
	const measure = (): boolean => {
		const box = root.getBoundingClientRect();
		const w = Math.max(0, Math.round(box.width));
		const h = Math.max(0, Math.round(box.height));
		if (w === view.w && h === view.h) return false;
		view = { w, h };
		for (const c of [canvas, skyCanvas]) {
			c.width = w;
			c.height = h;
		}
		skyKey = "";
		drawn = null;
		return true;
	};
	// The sky changes slowly: redrawn when the size, the mood colours or the five-minute slot changes.
	const paintSky = (hour: number) => {
		const { colorA, colorB } = live.current;
		const key = `${view.w}x${view.h}|${colorA}|${colorB}|${Math.floor(hour * 12)}`;
		if (key === skyKey) return;
		skyKey = key;
		drawSky(skyPainter, { sky: skyAt(colorA, colorB, hour), stars });
		const sun = sunAt(hour);
		root.style.setProperty("--sun-x", `${(sun.fx * 100).toFixed(2)}%`);
		root.style.setProperty("--sun-y", `${(sun.fy * 100).toFixed(2)}%`);
		root.dataset.sun = sun.up ? "up" : "down";
	};
	const frame = guarded((): void => {
		timer = null;
		const now = clock();
		const dt = now - last;
		last = now;
		const hour = hourNow();
		if (Math.floor(hour) !== lastHour) {
			lastHour = Math.floor(hour);
			apply({ type: "hour", now, hour });
		}
		const pinned = live.current.fixed?.pose;
		if (pinned) {
			if (posed?.kind !== pinned) posed = { kind: pinned, since: now };
			actor = pose(pinned, actor.x, posed.since, hour);
		} else {
			posed = null;
			apply({ type: "tick", now, dt });
		}
		if (live.current.colorA !== scarf || darkAt(hour) !== dark) {
			scarf = live.current.colorA;
			dark = darkAt(hour);
			painter = canvasPainter(ctx, artFor(scarf, dark), overrides);
			drawn = null;
		}
		const close = facingViewer(actor);
		const base = baseZoom(view.w, view.h);
		camera = zoomTo(camera, close ? base + ZOOM_IN : base, now, reduced);
		camera = follow(camera, actor.x, view, now, dt, close);
		paintSky(hour);
		const laid = laidCount();
		const next = nextBlock();
		const ghost = fixedLaid() !== undefined ? (hall[laid] ?? null) : next;
		const key: DrawKey = { laid, kind: actor.kind, phase: phaseOf(hour), zoom: zoomAt(camera, now), tx: Math.floor(actor.x / TILE) };
		if (shouldDraw(reduced, drawn, key)) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			drawWorld(painter, { camera, view, now, clock: now, ground, laid: hall.slice(0, laid), ghost, him: { x: actor.x, look: look(actor, now, face) }, sky, dark });
			const head = toScreen(camera, view, now, actor.x, GROUND_Y * TILE - FRAME_H);
			root.style.setProperty("--him-x", `${head.x}px`);
			root.style.setProperty("--him-y", `${head.y}px`);
		}
		const moving = easing(camera, now) || settling(camera, actor.x, view, now, close);
		schedule(nextTickIn({ actor, now, easing: moving, hasWork: next !== null || actor.night, reducedMotion: reduced }));
	});

	const onVisibility = guarded(() => {
		const now = clock();
		if (document.hidden) {
			apply({ type: "hidden", now });
			if (progress && needsSave(progress, "hidden")) void save();
			schedule(null);
		} else {
			last = now;
			measure();
			apply({ type: "visible", now });
			schedule(0);
		}
	});
	document.addEventListener("visibilitychange", onVisibility);
	g.undo.push(() => document.removeEventListener("visibilitychange", onVisibility));
	// The size is read on mount and when the box changes, not every frame.
	const resize = new ResizeObserver(
		guarded(() => {
			if (measure() && !document.hidden) schedule(0);
		}),
	);
	resize.observe(root);
	g.undo.push(() => resize.disconnect());
	if (persist) {
		void loadVillage().then(({ rows, ok }) => {
			if (g.dead) return;
			if (!ok) {
				console.warn("[village] Could not read the village, so he will not build this visit.");
				return;
			}
			progress = resume(rows, "hall", hall.length, new Date().toISOString());
			canSave = true;
			schedule(0);
		});
	}
	void loadSheets().then((found) => {
		if (g.dead) return;
		overrides = found;
		painter = canvasPainter(ctx, artFor(scarf, dark), overrides);
		drawn = null;
		schedule(0);
	});
	measure();
	camera = newCamera(actor.x, view, baseZoom(view.w, view.h));
	if (document.hidden) apply({ type: "hidden", now: clock() });
	schedule(document.hidden ? null : 0);

	return {
		send: guarded((e: ActorEvent) => {
			apply(e);
			if (!document.hidden) schedule(0);
		}),
		refresh: guarded(() => {
			drawn = null;
			skyKey = "";
			if (!document.hidden) schedule(0);
		}),
		takeNews() {
			const n = news;
			news = null;
			return n;
		},
		dispose() {
			g.dead = true;
			schedule(null);
			for (const u of g.undo) u();
			if (progress && needsSave(progress, "hidden")) void save();
		},
	};
}

export function WorldStage(props: WorldProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const skyRef = useRef<HTMLCanvasElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const live = useRef(props);
	const engine = useRef<Engine | null>(null);
	const prevSignals = useRef<RoomSignals | null>(null);
	useEffect(() => {
		live.current = props;
	});
	useEffect(() => {
		const root = rootRef.current;
		const sky = skyRef.current;
		const canvas = canvasRef.current;
		if (!root || !sky || !canvas) return;
		const e = startWorld(root, sky, canvas, live);
		engine.current = e;
		return () => {
			e?.dispose();
			engine.current = null;
		};
	}, []);
	const { controlRef } = props;
	useEffect(() => {
		if (!controlRef) return;
		controlRef.current = {
			attend: () => engine.current?.send({ type: "message", now: performance.now() }),
			takeNews: () => engine.current?.takeNews() ?? null,
		};
		return () => {
			controlRef.current = null;
		};
	}, [controlRef]);
	const { lines, inTalk, speaking, thinking } = props.signals;
	useEffect(() => {
		const next = { lines, inTalk, speaking, thinking };
		for (const e of roomEvents(prevSignals.current, next, performance.now())) engine.current?.send(e);
		prevSignals.current = next;
	}, [lines, inTalk, speaking, thinking]);
	const { fixed, colorA, colorB } = props;
	useEffect(() => {
		engine.current?.refresh();
	}, [fixed?.hour, fixed?.laid, fixed?.pose, colorA, colorB]);

	return (
		<div ref={rootRef} className={s.world}>
			<canvas ref={skyRef} className={s.layer} aria-hidden="true" />
			<div className={s.sun} aria-hidden="true">
				<Figure />
			</div>
			<canvas ref={canvasRef} className={s.layer} aria-hidden="true" />
			<div className={s.bubble}>
				{props.heard !== null && <p className={s.heard}>{props.heard}</p>}
				<p className={s.said} aria-live="polite">
					{props.said ?? ""}
				</p>
			</div>
		</div>
	);
}
