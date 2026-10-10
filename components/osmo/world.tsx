"use client";

// Osmo's village (spec docs/superpowers/specs/2026-10-09-osmo-village-design.md, phase 1): the sky, the sun that is
// his heart, the island, the hall he builds, and him with his line above his head. app/assistant.tsx loads it after
// first paint, and only when NEXT_PUBLIC_OSMO_SHELL2 and NEXT_PUBLIC_OSMO_WORLD are both on.
import { type RefObject, useEffect, useRef, useState } from "react";
import { Figure } from "@/components/osmo/figure";
import type { AgentState } from "@/lib/agent/state";
import { facingViewer, look, newActor, pose, step, type Actor, type ActorEvent, type ActorKind, type ActorWorld } from "@/lib/world/actor";
import { blocksOf, REST_X, standX, START_X } from "@/lib/world/blueprints";
import { ISLAND } from "@/lib/world/blueprints/island";
import { CASTLE_ROOMS, GROUND_Y, TILE, type CastleRoom } from "@/lib/world/blueprints/types";
import { createSeenStore } from "@/lib/shell/rail";
import { TALK, type Route } from "@/lib/shell/route";
import { safeLocalStorage } from "@/components/osmo/use-rail-dots";
import { baseZoom, easing, follow, newCamera, settling, toScreen, zoomAt, zoomTo, ZOOM_IN, type Camera, type View } from "@/lib/world/camera";
import { canvasPainter, loadSheets, type Overrides } from "@/lib/world/canvas-painter";
import { bearing } from "@/lib/world/face";
import { FRAME_H } from "@/lib/world/osmo-sprite";
import { FRAME_MS, nextTickIn, shouldDraw, type DrawKey } from "@/lib/world/pace";
import type { VillageNews } from "@/lib/world/progress";
import { artFor, drawSky, drawWorld } from "@/lib/world/render";
import { clickable, hitAreas, placeOf, ROOM_LABELS, roomContext, routeOf, spotX } from "@/lib/world/rooms";
import { roomEvents, type RoomSignals } from "@/lib/world/signals";
import { daylight, hourOf, phaseOf, skyAt, starField, sunAt } from "@/lib/world/sky";
import { openRooms, SETTINGS_SEEN, type VillageCounts } from "@/lib/world/unlock";
import {
	admit, adoptRead, dueSaves, finishedRooms, laidBlocks, laidCount, layNext, markRoomSaved, nextBlock, outlineBlocks, pinnedVillage, resumeVillage,
	type Village,
} from "@/lib/world/village";
import { readVillageCounts } from "@/lib/world/village-counts";
import { CLEARED_KEY, loadVillage, saveRoom, VILLAGE_CLEARED } from "@/lib/world/village-data";
import s from "./world.module.css";

// attend: Gur is typing or focused the composer. takeNews: the oldest room started or finished since the last call (for
// TurnFacts.village). context: the line for the open panel's room (lib/world/rooms.ts roomContext), null in Talk or
// before the visit's counts are read. The last two are the language lane's to call.
export type WorldControl = { attend(): void; takeNews(): VillageNews | null; context(): string | null };
// The dev page's pins: the hour, each room's laid blocks (a room left out is locked), his pose, and the hit areas drawn.
export type WorldFixed = { hour?: number; rooms?: Partial<Record<CastleRoom, number>>; pose?: ActorKind; hits?: boolean };
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
	route?: Route; // the open panel (shell v2); he walks to its room
	onOpen?(to: Route): void; // a finished room was clicked
};
type Engine = { send(e: ActorEvent): void; refresh(): void; takeNews(): VillageNews | null; context(): string | null; dispose(): void };
// How the loop tells React which rooms have a hit area now.
type Hooks = { finished(rooms: CastleRoom[]): void };

// The loop, outside React: it reads the latest props through `live` and writes the canvases and a few CSS variables.
// Nothing in it may throw into React (a throw inside useEffect would unmount the room): a failure stops the world and
// logs one warning. `g` is shared with the wrapper so that a throw while starting can undo what was already set up.
type Guard = { dead: boolean; undo: (() => void)[] };
function startWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }, hooks: Hooks): Engine | null {
	const g: Guard = { dead: false, undo: [] };
	try {
		return buildWorld(root, skyCanvas, canvas, live, hooks, g);
	} catch (err) {
		g.dead = true;
		for (const u of g.undo) u();
		console.warn("[village] The world could not start and has stopped.", err);
		return null;
	}
}

function buildWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }, hooks: Hooks, g: Guard): Engine | null {
	const ctx = canvas.getContext("2d");
	const skyCtx = skyCanvas.getContext("2d");
	if (!ctx || !skyCtx) return null;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const persist = live.current.persist !== false;
	const ground = blocksOf(ISLAND);
	const stars = starField();
	const clock = () => performance.now();
	const iso = () => new Date().toISOString();
	const hourNow = () => live.current.fixed?.hour ?? hourOf(new Date());
	const pinned = () => live.current.fixed?.rooms;
	const place = () => placeOf(live.current.route ?? TALK);

	let view: View = { w: 0, h: 0 };
	let actor: Actor = newActor(START_X, clock(), hourNow());
	let camera: Camera = newCamera(actor.x, view, 2);
	// The room: unknown until the one read of the visit answers. The dev page: the whole castle from nothing, room by room.
	let village: Village | null = persist ? null : resumeVillage([], CASTLE_ROOMS, iso());
	let counts: VillageCounts | null = null; // read once per visit, with the village
	// Settings opened in the new shell on this device (the shell marks it, use-rail-dots.ts), or during this visit.
	let settingsOpened = createSeenStore(safeLocalStorage(), iso).peek(SETTINGS_SEEN) !== null;
	let gen = 0; // a clear bumps it: a read or a save begun before the clear is dropped
	let canSave = false;
	let saving = false;
	let news: VillageNews[] = [];
	let hitKey = "";
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

	// The village drawn: the dev page's pinned one, or the real one (null until the visit's read answers).
	const shown = (): Village | null => {
		const pin = pinned();
		return pin ? pinnedVillage(pin, iso()) : village;
	};
	// The block he works on next: none while the dev page pins the rooms, before the read answers, or when all is done.
	const workBlock = () => (pinned() || !village ? null : nextBlock(village));
	const world = (): ActorWorld => {
		const sig = live.current.signals;
		const next = workBlock();
		const at = place();
		return {
			next: next ? standX(next) : null,
			restX: REST_X,
			speed: bearing(live.current.agent, Date.now(), hourNow()).speed,
			held: sig.inTalk || sig.thinking || sig.speaking,
			visit: at === "yard" ? null : spotX(at),
			yard: START_X,
		};
	};
	// Saves every room that is due, one at a time; a clear in between stops it.
	const save = async (reason: "block" | "hidden") => {
		if (!village || !canSave || saving) return;
		saving = true;
		const mine = gen;
		try {
			for (const p of dueSaves(village, reason)) {
				if (gen !== mine) break;
				const ok = await saveRoom(p);
				if (ok && village && gen === mine) village = markRoomSaved(village, p.room, p.laid);
			}
		} finally {
			saving = false;
		}
	};
	const saveSoon = (reason: "block" | "hidden") => {
		void save(reason).catch((err: unknown) => console.warn("[village] Could not save the village.", err));
	};
	const onLaid = () => {
		if (!village || pinned()) return;
		const r = layNext(village, iso());
		village = r.village;
		if (r.news) news = [...news, r.news].slice(-4);
		saveSoon("block");
	};
	// The visit's one read: the rows and, the first time, the counts the unlock rules and the context line use.
	const load = () => {
		const mine = gen;
		void Promise.all([loadVillage(), counts ? Promise.resolve(counts) : readVillageCounts()])
			.then(([{ rows, ok }, c]) => {
				if (g.dead || mine !== gen) return;
				counts = c;
				if (!ok) {
					console.warn("[village] Could not read the village, so he will not build this visit.");
					return;
				}
				village = resumeVillage(rows, openRooms({ counts: c, settingsOpened: settingsOpened || place() === "observatory" }), iso());
				canSave = true;
				schedule(0);
			})
			.catch((err: unknown) => console.warn("[village] Could not read the village, so he will not build this visit.", err));
	};
	// The finished rooms get a button each (React draws them, from hooks.finished); the loop places them over the canvas.
	const placeHits = (v: Village | null, now: number) => {
		const rooms = v ? clickable(finishedRooms(v)) : [];
		const names = rooms.join(",");
		if (names !== hitKey) {
			hitKey = names;
			hooks.finished(rooms);
		}
		const panelOpen = (live.current.route?.panel ?? null) !== null;
		const box = root.getBoundingClientRect();
		for (const hit of hitAreas(rooms, camera, view, now)) {
			const el = root.querySelector<HTMLElement>(`[data-hit="${hit.room}"]`);
			if (!el) continue;
			el.style.left = `${hit.x}px`;
			el.style.top = `${hit.y}px`;
			el.style.width = `${hit.w}px`;
			el.style.height = `${hit.h}px`;
			el.hidden = !hit.seen;
			// Covered: a panel is open, or something of the conversation (its header, a long log) lies over the middle of
			// the part in view. The keyboard and screen readers skip it then, as the pointer cannot reach it either.
			let covered = panelOpen;
			if (!covered && hit.seen) {
				const cx = (Math.max(0, hit.x) + Math.min(view.w, hit.x + hit.w)) / 2;
				const cy = (Math.max(0, hit.y) + Math.min(view.h, hit.y + hit.h)) / 2;
				const top = document.elementFromPoint(box.left + cx, box.top + cy);
				covered = top !== null && top !== el;
			}
			el.tabIndex = covered ? -1 : 0;
			if (covered) el.setAttribute("aria-hidden", "true");
			else el.removeAttribute("aria-hidden");
		}
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
		// Settings opened during the visit: the observatory joins the queue (spec 4).
		if (!settingsOpened && place() === "observatory") {
			settingsOpened = true;
			if (village && counts) village = admit(village, openRooms({ counts, settingsOpened }), iso());
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
		const v = shown();
		const laid = v ? laidCount(v) : 0;
		const key: DrawKey = { laid, kind: actor.kind, phase: phaseOf(hour), zoom: zoomAt(camera, now), tx: Math.floor(actor.x / TILE) };
		root.toggleAttribute("data-show-hits", live.current.fixed?.hits === true);
		if (shouldDraw(reduced, drawn, key)) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			drawWorld(painter, {
				camera, view, now, clock: now, ground, laid: v ? laidBlocks(v) : [], ghost: v ? nextBlock(v) : null, outline: v ? outlineBlocks(v) : [],
				him: { x: actor.x, look: look(actor, now, face) }, sky, dark,
			});
			const head = toScreen(camera, view, now, actor.x, GROUND_Y * TILE - FRAME_H);
			root.style.setProperty("--him-x", `${head.x}px`);
			root.style.setProperty("--him-y", `${head.y}px`);
			placeHits(v, now);
		}
		const moving = easing(camera, now) || settling(camera, actor.x, view, now, close);
		// Work waits only in the yard: at a room he stands, so the loop slows to its 3 s tick (and at night with nothing
		// left to build, too: review M3).
		schedule(nextTickIn({ actor, now, easing: moving, hasWork: workBlock() !== null && place() === "yard", reducedMotion: reduced }));
	});

	// Back after a hide, a sleep or the back/forward cache: the village may have been cleared elsewhere (another device,
	// a tab that never heard of it), and this page's next save would put its old counts back. So nothing is saved until
	// the rows are read again; when one went backwards or is gone the read wins (adoptRead) and he starts from it.
	const recheck = () => {
		if (!persist || pinned() || !village || !counts || !canSave) return;
		const mine = ++gen;
		canSave = false;
		void loadVillage()
			.then(({ rows, ok }) => {
				if (g.dead || mine !== gen) return;
				canSave = true;
				if (ok && village && counts) {
					const r = adoptRead(village, rows, openRooms({ counts, settingsOpened: settingsOpened || place() === "observatory" }), iso());
					if (r.adopted) {
						village = r.village;
						news = [];
						drawn = null;
						// A block he was walking to or laying belongs to the old village: he chooses again.
						if (actor.kind === "building" || (actor.kind === "walking" && actor.purpose === "build")) {
							actor = { ...actor, kind: "idle", since: clock(), target: null, purpose: null, toward: "work" };
						}
					}
				}
				schedule(0);
			})
			.catch((err: unknown) => {
				if (g.dead || mine !== gen) return;
				canSave = true;
				console.warn("[village] Could not read the village again.", err);
			});
	};
	const onVisibility = guarded(() => {
		const now = clock();
		if (document.hidden) {
			apply({ type: "hidden", now });
			saveSoon("hidden");
			schedule(null);
		} else {
			last = now;
			measure();
			apply({ type: "visible", now });
			recheck();
			schedule(0);
		}
	});
	const onPageShow = guarded((e: PageTransitionEvent) => {
		if (e.persisted && !document.hidden) recheck();
	});
	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("pageshow", onPageShow);
	g.undo.push(() => {
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("pageshow", onPageShow);
	});
	// The size is read on mount and when the box changes, not every frame.
	const resize = new ResizeObserver(
		guarded(() => {
			if (measure() && !document.hidden) schedule(0);
		}),
	);
	resize.observe(root);
	g.undo.push(() => resize.disconnect());
	if (persist) {
		load();
		// Settings cleared the village (village-data.ts): drop everything held, read it again, and he begins the hall.
		const onCleared = guarded(() => {
			gen++;
			village = null;
			canSave = false;
			news = [];
			drawn = null;
			load();
			schedule(0);
		});
		// Another tab cleared it: the same (village-data.ts writes CLEARED_KEY, which fires "storage" in every other tab).
		const onStorage = (e: StorageEvent) => {
			if (e.key === CLEARED_KEY) onCleared();
		};
		window.addEventListener(VILLAGE_CLEARED, onCleared);
		window.addEventListener("storage", onStorage);
		g.undo.push(() => {
			window.removeEventListener(VILLAGE_CLEARED, onCleared);
			window.removeEventListener("storage", onStorage);
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
			const n = news[0] ?? null;
			news = news.slice(1);
			return n;
		},
		context: () => (counts === null ? null : roomContext(place(), counts)),
		dispose() {
			g.dead = true;
			schedule(null);
			for (const u of g.undo) u();
			saveSoon("hidden");
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
	// The finished rooms that have a hit area, as the loop last reported them.
	const [hits, setHits] = useState<CastleRoom[]>([]);
	useEffect(() => {
		live.current = props;
	});
	useEffect(() => {
		const root = rootRef.current;
		const sky = skyRef.current;
		const canvas = canvasRef.current;
		if (!root || !sky || !canvas) return;
		const e = startWorld(root, sky, canvas, live, { finished: setHits });
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
			context: () => engine.current?.context() ?? null,
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
	const pins = JSON.stringify(fixed?.rooms ?? null);
	const at = placeOf(props.route ?? TALK);
	const panelOpen = (props.route?.panel ?? null) !== null;
	// A new pin, a new place (he sets off at once, even from the 3 s tick), new buttons to place, a panel opening or the
	// conversation growing (which of the buttons are covered): draw now.
	useEffect(() => {
		engine.current?.refresh();
	}, [fixed?.hour, pins, fixed?.pose, fixed?.hits, colorA, colorB, at, hits, panelOpen, lines]);
	const { onOpen } = props;

	return (
		<div ref={rootRef} className={s.world}>
			<canvas ref={skyRef} className={s.layer} aria-hidden="true" />
			<div className={s.sun} aria-hidden="true">
				<Figure />
			</div>
			<canvas ref={canvasRef} className={s.layer} aria-hidden="true" />
			<div className={s.hits}>
				{hits.map((room) => (
					<button
						key={room}
						type="button"
						className={s.hit}
						data-hit={room}
						aria-label={ROOM_LABELS[room]}
						hidden
						onClick={() => {
							const to = routeOf(room);
							if (to) onOpen?.(to);
						}}
					/>
				))}
			</div>
			<div className={s.bubble}>
				{props.heard !== null && <p className={s.heard}>{props.heard}</p>}
				<p className={s.said} aria-live="polite">
					{props.said ?? ""}
				</p>
			</div>
		</div>
	);
}
