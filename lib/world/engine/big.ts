// The big world's engine (free-will spec sections 3 and 4; I1 of docs/superpowers/plans/2026-10-11-osmo-free-will.md):
// the DOM and network glue around the pure modules. It holds the state (the map, the castle, him, the camera, Gur's
// gesture) and calls flow.ts for every choice. Like the small world's engine in components/osmo/world.tsx it runs
// outside React, reads the latest props through `live`, and never throws into React: a failure stops the world and
// logs one warning. Canvas px are CSS px times the device pixel ratio; everything handed back to the DOM (the bubble's
// place, the room buttons, pointer positions) is in CSS px.
import { facingViewer, look, newActor, nextLookIn, pose, PRESENT_MS, step, type Actor, type ActorEvent, type ActorKind, type ActorWorld } from "../actor";
import { REST_X, START_X } from "../blueprints";
import { CASTLE_ROOMS, TILE, type Block } from "../blueprints/types";
import { easing, GLIDE_MS, toScreen, ZOOM_MS, zoomAt, zoomTo, type Camera, type View } from "../camera";
import { canvasPainter, loadSheets, type Overrides } from "../canvas-painter";
import { bearing } from "../face";
import { CHUNK_KEEP, deviceRatio } from "../lod";
import { chimneyLaid, HOME_CHIMNEY, HOME_SMOKE_FROM, lifeAt, lifeWants, smokeSeen, type Landing } from "../life";
import { generateWorld } from "../map/generate";
import { HOME_TOP, homePx } from "../map/home";
import { HOME_DX, HOME_DY, GEN, START_ISLANDS, type Deck, type Leg, type WorldMap } from "../map/types";
import { createWorld, loadWorld } from "../map/world-data";
import { FRAME_H } from "../osmo-sprite";
import { AMBIENT_MS, FRAME_MS, framePace, shouldDraw, SLOW_MS, type DrawKey } from "../pace";
import type { VillageNews } from "../progress";
import { artFor, drawSky, drawWorld } from "../render";
import { clickable, hitAreas, placeOf, roomContext, spotX } from "../rooms";
import { daylight, hourOf, phaseOf, skyAt, starField, sunAt } from "../sky";
import { floorAt, islandOfPx, nextLeg, standFor } from "../travel/travel";
import { openRooms, SETTINGS_SEEN, type VillageCounts } from "../unlock";
import { BIG_BOUNDS, drift, followBig, homeTo, newBigCamera, offScreen, panBy, zoomAbout, zoomSteps } from "../view/camera-big";
import { interacting, NO_GESTURE, onKey, onPointer, onWheel, worldMayTake, type Gesture, type Intent, type PointerIn } from "../view/input";
import { admit, adoptRead, dueSaves, finishedRooms, layNext, markRoomSaved, pinnedVillage, resumeVillage, type Village } from "../village";
import { readVillageCounts } from "../village-counts";
import { CLEARED_KEY, loadVillage, saveRoom, VILLAGE_CLEARED } from "../village-data";
import { createSeenStore } from "../../shell/rail";
import { TALK } from "../../shell/route";
import { cameraAfter, followZoom, shiftedVillage, showHome, startOf, type CameraEvent, type CameraMode, type PathEl } from "./flow";
import type { Engine, Hooks, WorldProps } from "./types";

type Live = { current: WorldProps };
type Guard = { dead: boolean; undo: (() => void)[] };
const DEV_SEED = 7; // the dev page's world when it pins no seed
const TAP_HIM_PX = 24; // a tap this close to his sprite (CSS px) brings the camera back to him
const WHEEL_FRAMES_MS = 150; // frames come from requestAnimationFrame this long after a wheel event
const HITS_EVERY_MS = 100; // the room buttons are placed at most this often while the camera is still
const HOME_SHIFT = { x: HOME_DX * TILE, y: HOME_DY * TILE }; // the castle's offset in the big world, world px

// localStorage, or null where it is blocked (as components/osmo/use-rail-dots.ts reads it).
function storage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function startBigWorld(
	root: HTMLElement, sky: HTMLCanvasElement, canvas: HTMLCanvasElement, input: HTMLElement, live: Live, hooks: Hooks, mode: "big" | "builds",
): Engine | null {
	const g: Guard = { dead: false, undo: [] };
	try {
		return buildBigWorld(root, sky, canvas, input, live, hooks, mode, g);
	} catch (err) {
		g.dead = true;
		for (const u of g.undo) u();
		console.warn("[world] The big world could not start and has stopped.", err);
		return null;
	}
}

function buildBigWorld(
	root: HTMLElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, input: HTMLElement, live: Live, hooks: Hooks, mode: "big" | "builds", g: Guard,
): Engine | null {
	void mode; // Step 4 of the plan: the builds; until then both modes build today's village
	const ctx = canvas.getContext("2d");
	const skyCtx = skyCanvas.getContext("2d");
	if (!ctx || !skyCtx) return null;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const persist = live.current.persist !== false;
	const stars = starField();
	const clock = () => performance.now();
	const iso = () => new Date().toISOString();
	const fixed = () => live.current.fixed;
	const hourNow = () => fixed()?.hour ?? hourOf(new Date());
	const place = () => placeOf(live.current.route ?? TALK);

	// The world: in the room, home alone until the visit's one read of the world row answers; on the dev page, its seed.
	let map: WorldMap = persist ? generateWorld(0, GEN, 1) : generateWorld(fixed()?.seed ?? DEV_SEED, GEN, fixed()?.islands ?? START_ISLANDS);
	const decks: readonly Deck[] = []; // phase 1: he stays on the home island
	// The sizes: CSS px of the world's box, the device pixel ratio, and the canvas px the drawing and the camera use.
	let css = { w: 0, h: 0 };
	let dpr: number = deviceRatio(window.devicePixelRatio);
	let view: View = { w: 0, h: 0 };
	const phone = () => css.w <= 640;

	let actor: Actor = newActor(homePx(START_X), clock(), hourNow(), { y: HOME_TOP * TILE, island: 0 });
	const him = () => ({ x: actor.x, y: actor.y });
	let camera: Camera = newBigCamera(him(), { w: 1, h: 1 }, 1, BIG_BOUNDS);
	let cameraMode: CameraMode = "following";
	let gesture: Gesture = NO_GESTURE;
	let intents: Intent[] = [];
	let lastWheel = Number.NEGATIVE_INFINITY;

	// The castle (big mode): today's village, its blocks moved by the home offset where they are drawn. The dev page:
	// the whole castle from nothing, room by room (or its pinned rooms).
	let village: Village | null = persist ? null : resumeVillage([], CASTLE_ROOMS, iso());
	let counts: VillageCounts | null = null;
	let settingsOpened = createSeenStore(storage(), iso).peek(SETTINGS_SEEN) !== null;
	let gen = 0; // a clear bumps it: a read or a save begun before the clear is dropped
	let canSave = false;
	let saving = false;
	let news: VillageNews[] = [];
	let landing: Landing | null = null;
	let pinKey = "";
	let pinned: Village | null = null;

	let overrides: Overrides = {};
	let scarf = live.current.colorA;
	const darkAt = (hour: number) => Math.round((1 - daylight(hour)) * 8) / 8;
	let dark = darkAt(hourNow());
	const keepFor = () => (phone() ? CHUNK_KEEP.phone : CHUNK_KEEP.desk);
	let keep: number = CHUNK_KEEP.desk;
	let painter = canvasPainter(ctx, artFor(scarf, dark), overrides, keep);
	const skyPainter = canvasPainter(skyCtx, artFor(scarf));
	let skyKey = "";
	let drawn: DrawKey | null = null;
	let pending = 0;
	let chimneyFrom: readonly Block[] | null = null;
	let chimneyKept = false;
	let posed: { kind: ActorKind; since: number } | null = null;
	let lastHour = Math.floor(hourNow());
	let last = clock();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let raf: number | null = null;
	let hitKey = "-"; // not a list of rooms: the first placement always tells React
	let hitsAt = Number.NEGATIVE_INFINITY;
	let hitCam = "";
	let away = false;

	// A new painter (the scarf, a darkness step, the phone's smaller chunk cache): the old one gives its bitmaps back first.
	const repaint = () => {
		painter.release?.();
		painter = canvasPainter(ctx, artFor(scarf, dark), overrides, keep);
		drawn = null;
	};

	// The village drawn: the dev page's pinned one (kept while its pins are the same, so the lists the renderer keys its
	// caches on hold), or the real one (null until the visit's read answers).
	const shown = (): Village | null => {
		const pin = fixed()?.rooms;
		if (!pin) return village;
		const key = JSON.stringify(pin);
		if (key !== pinKey || !pinned) {
			pinKey = key;
			pinned = pinnedVillage(pin, iso());
		}
		return pinned;
	};
	// The block he works on next, in the big world: none while the dev page pins the rooms, before the read answers, or
	// when every open room is done.
	const workBlock = (): Block | null => (fixed()?.rooms || !village ? null : shiftedVillage(village).ghost);
	const resting = (now: number) => actor.night && !(actor.lastMessage !== null && now - actor.lastMessage < PRESENT_MS);
	// Where he goes this step, in the order actor.ts wants them (the open panel's room, the night's rest, a waypoint
	// toward another island, the next block, the yard), as the ActorWorld, and the balloon trip to take when he stands
	// at the boarding spot of the leg toward the first of them.
	const routeNow = (now: number): { world: ActorWorld; board: Extract<Leg, { kind: "board" }> | null } => {
		const sig = live.current.signals;
		const base: ActorWorld = {
			next: null,
			restX: actor.island === 0 ? homePx(REST_X) : actor.x,
			speed: bearing(live.current.agent, Date.now(), hourNow()).speed,
			held: sig.inTalk || sig.thinking || sig.speaking,
			visit: null,
			yard: homePx(START_X),
			floor: floorAt(map, decks),
			islandOf: islandOfPx(map),
			via: null,
		};
		const toward = (to: { island: number; x: number }) => nextLeg(map, decks, { island: actor.island, x: actor.x }, to);
		const at = place();
		if (at !== "yard") {
			const leg = toward({ island: 0, x: spotX(at, HOME_SHIFT.x) });
			return leg.kind === "walk" ? { world: { ...base, visit: leg.x }, board: null } : { world: { ...base, visit: actor.x }, board: leg };
		}
		if (resting(now)) return { world: base, board: null };
		const block = workBlock();
		if (block) {
			const s = standFor(block, map);
			const leg = toward(s);
			if (leg.kind === "board") return { world: { ...base, via: actor.x }, board: leg };
			return { world: leg.x === s.x ? { ...base, next: s.x } : { ...base, via: leg.x }, board: null };
		}
		return { world: base, board: null };
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
		void save(reason).catch((err: unknown) => console.warn("[world] Could not save the village.", err));
	};
	const onLaid = () => {
		if (!village || fixed()?.rooms) return;
		const laidNow = shiftedVillage(village).ghost;
		if (laidNow) landing = { block: laidNow, at: clock() };
		const r = layNext(village, iso());
		village = r.village;
		if (r.news) news = [...news, r.news].slice(-4);
		saveSoon("block");
	};
	const apply = (e: ActorEvent, w?: ActorWorld) => {
		const r = step(actor, e, w ?? routeNow(clock()).world);
		actor = r.actor;
		if (r.laid) onLaid();
	};

	// The visit's reads: the world row (made on the first visit; a failed read draws seed 0 for the visit), and the
	// village's rows with, the first time, the counts the unlock rules and the context line use.
	const loadMap = async (): Promise<void> => {
		let r = await loadWorld();
		if (r.ok && r.row === null) r = await createWorld();
		if (g.dead) return;
		let next: WorldMap | null = null;
		if (r.ok && r.row) {
			try {
				next = generateWorld(r.row.seed, r.row.gen, r.row.islands);
			} catch (err) {
				console.warn("[world] The world row names a generator this page does not know.", err);
			}
		}
		if (!next) console.warn("[world] Could not read the world, so it is drawn from seed 0 this visit.");
		map = next ?? generateWorld(0, GEN, START_ISLANDS);
		drawn = null;
		schedule(0);
	};
	const loadCastle = () => {
		const mine = gen;
		void Promise.all([loadVillage(), counts ? Promise.resolve(counts) : readVillageCounts()])
			.then(([{ rows, ok }, c]) => {
				if (g.dead || mine !== gen) return;
				counts = c;
				if (!ok) {
					console.warn("[world] Could not read the village, so he will not build this visit.");
					return;
				}
				village = resumeVillage(rows, openRooms({ counts: c, settingsOpened: settingsOpened || place() === "observatory" }), iso());
				canSave = true;
				schedule(0);
			})
			.catch((err: unknown) => console.warn("[world] Could not read the village, so he will not build this visit.", err));
	};

	// The finished rooms get a button each (React draws them, from hooks.finished); the loop places them over the canvas,
	// in CSS px, hidden below CSS zoom 1.
	const placeHits = (v: Village | null, now: number) => {
		const rooms = v ? clickable(finishedRooms(v)) : [];
		const names = rooms.join(",");
		const cam = `${camera.x},${camera.y},${zoomAt(camera, now)},${view.w},${view.h}`;
		if (names === hitKey && cam === hitCam && now - hitsAt < HITS_EVERY_MS) return;
		if (names !== hitKey) {
			hitKey = names;
			hooks.finished(rooms);
		}
		hitCam = cam;
		hitsAt = now;
		const panelOpen = (live.current.route?.panel ?? null) !== null;
		const box = root.getBoundingClientRect();
		for (const hit of hitAreas(rooms, camera, view, now, HOME_SHIFT, dpr)) {
			const el = root.querySelector<HTMLElement>(`[data-hit="${hit.room}"]`);
			if (!el) continue;
			const x = hit.x / dpr;
			const y = hit.y / dpr;
			const w = hit.w / dpr;
			const h = hit.h / dpr;
			el.style.left = `${x}px`;
			el.style.top = `${y}px`;
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;
			el.hidden = !hit.seen;
			let covered = panelOpen;
			if (!covered && hit.seen) {
				const cx = (Math.max(0, x) + Math.min(css.w, x + w)) / 2;
				const cy = (Math.max(0, y) + Math.min(css.h, y + h)) / 2;
				const top = document.elementFromPoint(box.left + cx, box.top + cy);
				covered = top !== null && top !== el;
			}
			el.tabIndex = covered ? -1 : 0;
			if (covered) el.setAttribute("aria-hidden", "true");
			else el.removeAttribute("aria-hidden");
		}
	};

	// One frame source at a time: a timer never faster than FRAME_MS (30 frames a second), or, while Gur drags, pinches
	// or wheels, the next animation frame.
	const cancel = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		if (raf !== null) cancelAnimationFrame(raf);
		raf = null;
	};
	const schedule = (ms: number | null) => {
		cancel();
		if (g.dead || ms === null) return;
		timer = setTimeout(frame, ms <= FRAME_MS ? Math.max(0, FRAME_MS - (clock() - last)) : ms);
	};
	const nextAnimationFrame = () => {
		if (g.dead || raf !== null) return;
		if (timer !== null) clearTimeout(timer);
		timer = null;
		raf = requestAnimationFrame(() => frame());
	};
	const steeringNow = (now: number) => interacting(gesture) || now - lastWheel < WHEEL_FRAMES_MS;
	// Something came in (a gesture, a key, a dev button): the next frame now.
	const wake = () => {
		if (document.hidden) return;
		if (steeringNow(clock())) nextAnimationFrame();
		else schedule(0);
	};
	const fail = (err: unknown) => {
		if (g.dead) return;
		g.dead = true;
		cancel();
		console.warn("[world] The big world has stopped.", err);
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

	// The canvases' backing stores follow the box and the device pixel ratio. The sky canvas stays at CSS px: it is a
	// gradient and single-pixel stars, which a retina backing store would only shrink.
	const measure = (): boolean => {
		const box = root.getBoundingClientRect();
		const w = Math.max(0, Math.round(box.width));
		const h = Math.max(0, Math.round(box.height));
		const r = deviceRatio(window.devicePixelRatio);
		if (w === css.w && h === css.h && r === dpr) return false;
		if (r !== dpr) camera = { ...camera, from: (camera.from * r) / dpr, to: (camera.to * r) / dpr };
		const first = css.w === 0 || css.h === 0;
		css = { w, h };
		dpr = r;
		view = { w: w * r, h: h * r };
		canvas.width = view.w;
		canvas.height = view.h;
		skyCanvas.width = w;
		skyCanvas.height = h;
		if (keepFor() !== keep) {
			keep = keepFor();
			repaint();
		}
		// The first real size: the camera starts on him, framed as following frames him.
		if (first) camera = newBigCamera(him(), view, followZoom(w, h, false, r), BIG_BOUNDS);
		skyKey = "";
		drawn = null;
		hitCam = "";
		return true;
	};
	const paintSky = (hour: number) => {
		const { colorA, colorB } = live.current;
		const sky = skyAt(colorA, colorB, hour);
		const tick = !reduced && sky.stars > 0 ? Math.floor(Date.now() / SLOW_MS) : undefined;
		const key = `${css.w}x${css.h}|${colorA}|${colorB}|${Math.floor(hour * 12)}|${tick ?? ""}`;
		if (key === skyKey) return;
		skyKey = key;
		drawSky(skyPainter, { sky, stars, tick });
		const sun = sunAt(hour);
		root.style.setProperty("--sun-x", `${(sun.fx * 100).toFixed(2)}%`);
		root.style.setProperty("--sun-y", `${(sun.fy * 100).toFixed(2)}%`);
		root.dataset.sun = sun.up ? "up" : "down";
	};

	// The camera (spec 3.2). Gur's intents arrive in CSS px and are scaled to canvas px; each one moves the camera and
	// says who moves it next (flow.ts cameraAfter). Back to him: Home, a tap on him, a message, the dev page's button.
	const moveCamera = (e: CameraEvent) => {
		cameraMode = cameraAfter(cameraMode, e);
	};
	const goHome = (now: number) => {
		camera = homeTo(camera, him(), followZoom(css.w, css.h, facingViewer(actor), dpr), view, BIG_BOUNDS, now, reduced);
		moveCamera("home");
	};
	const tappedHim = (x: number, y: number, now: number): boolean => {
		const a = toScreen(camera, view, now, actor.x - 8, actor.y - FRAME_H);
		const b = toScreen(camera, view, now, actor.x + 8, actor.y);
		const dx = Math.max(a.x / dpr - x, 0, x - b.x / dpr);
		const dy = Math.max(a.y / dpr - y, 0, y - b.y / dpr);
		return Math.hypot(dx, dy) <= TAP_HIM_PX;
	};
	const steer = (now: number) => {
		if (intents.length === 0) return;
		const list = intents;
		intents = [];
		const steps = zoomSteps(css.w, BIG_BOUNDS).map((s) => s * dpr);
		for (const it of list) {
			if (it.kind === "home") goHome(now);
			else if (it.kind === "tap") {
				if (tappedHim(it.x, it.y, now)) goHome(now);
			} else if (it.kind === "pan") {
				camera = panBy(camera, it.dx * dpr, it.dy * dpr, view, BIG_BOUNDS, now);
				moveCamera("steer");
			} else {
				camera = zoomAbout(camera, steps, it.dir, { x: it.x * dpr, y: it.y * dpr }, view, BIG_BOUNDS, now, reduced);
				moveCamera("steer");
			}
		}
	};

	const frame = guarded((): void => {
		timer = null;
		raf = null;
		const now = clock();
		const dt = now - last;
		last = now;
		const hour = hourNow();
		if (Math.floor(hour) !== lastHour) {
			lastHour = Math.floor(hour);
			apply({ type: "hour", now, hour });
		}
		// 1. Gur's gestures and keys move the camera
		steer(now);
		// 2. him: a pose the dev page pins, or a step; at the boarding spot of a leg to another island, the balloon
		const posePin = fixed()?.pose;
		if (posePin) {
			if (posed?.kind !== posePin) posed = { kind: posePin, since: now };
			actor = { ...pose(posePin, actor.x, posed.since, hour), y: actor.y, island: actor.island };
		} else {
			posed = null;
			const r = routeNow(now);
			if (r.board && (actor.kind === "idle" || actor.kind === "walking")) apply({ type: "ride", now, path: r.board.path, island: r.board.island }, r.world);
			apply({ type: "tick", now, dt }, r.world);
		}
		// Settings opened during the visit: the observatory joins the queue (village spec 4).
		if (!settingsOpened && place() === "observatory") {
			settingsOpened = true;
			if (village && counts) village = admit(village, openRooms({ counts, settingsOpened }), iso());
		}
		if (live.current.colorA !== scarf || darkAt(hour) !== dark) {
			scarf = live.current.colorA;
			dark = darkAt(hour);
			repaint();
		}
		// 6. the camera: following him, drifting where Gur left it
		const close = facingViewer(actor);
		if (cameraMode === "following") {
			camera = zoomTo(camera, followZoom(css.w, css.h, close, dpr), now, reduced);
			camera = followBig(camera, him(), view, BIG_BOUNDS, now, dt, close, reduced, phone());
		} else {
			camera = drift(camera, view, BIG_BOUNDS, now);
		}
		paintSky(hour);
		// 7. the drawing
		const v = shown();
		const lists = v ? shiftedVillage(v) : { laid: [] as Block[], ghost: null };
		const laid = lists.laid;
		if (laid !== chimneyFrom) {
			chimneyFrom = laid;
			chimneyKept = chimneyLaid(laid, HOME_CHIMNEY);
		}
		root.toggleAttribute("data-show-hits", fixed()?.hits === true);
		const z = zoomAt(camera, now);
		const life = lifeAt({
			wallMs: Date.now(), now, view, scale: z, day: daylight(hour) >= 1, night: dark >= 0.5,
			chimney: !reduced && chimneyKept && smokeSeen(camera, view, now, HOME_SMOKE_FROM), landing, motion: !reduced, force: fixed()?.life, smokeFrom: HOME_SMOKE_FROM,
		});
		const key: DrawKey = {
			laid: laid.length, kind: actor.kind, phase: phaseOf(hour), zoom: z, tx: Math.floor(actor.x / TILE), cx: Math.round(camera.x), cy: Math.round(camera.y),
		};
		if (shouldDraw(reduced, drawn, key) || pending > 0) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			const t0 = clock();
			pending = drawWorld(painter, {
				camera, view, now, clock: now, ground: map.ground, laid, ghost: lists.ghost,
				outline: [], // the room never shows what he is building towards (Gur, 2026-10-11, ff1b324)
				him: { x: actor.x, y: actor.y, look: look(actor, now, face, !reduced) }, sky, dark, life,
				anchor: { x: homePx(START_X), groundY: HOME_TOP * TILE }, dpr,
			}).pending;
			live.current.onFrame?.(clock() - t0);
			const head = toScreen(camera, view, now, actor.x, actor.y - FRAME_H);
			root.style.setProperty("--him-x", `${head.x / dpr}px`);
			root.style.setProperty("--him-y", `${head.y / dpr}px`);
		}
		placeHits(v, now);
		const off = showHome(cameraMode, offScreen(camera, him(), view, now));
		if (off !== away) {
			away = off;
			hooks.away?.(off);
		}
		// 8. the pace: animation frames while Gur steers; otherwise one timer, FRAME_MS while chunks wait to be baked
		const moving = easing(camera, now) || now - camera.glideAt < Math.max(GLIDE_MS, ZOOM_MS);
		const wants = lifeWants(life);
		const pace = framePace({
			actor, now, easing: moving, hasWork: workBlock() !== null && place() === "yard", reducedMotion: reduced,
			lookIn: nextLookIn(actor, now, !reduced), ambient: wants === "frames" ? FRAME_MS : wants === "ambient" ? AMBIENT_MS : null,
			interacting: steeringNow(now),
		});
		if (pace === "raf") nextAnimationFrame();
		else schedule(pace === null ? null : pending > 0 ? FRAME_MS : pace);
	});

	// Gur's pointer, wheel and keys (spec 3.2). Every pointer's down, up and cancel is heard on the window, wherever it
	// lands, so the gesture mapper knows about a finger on the conversation; a pointer that went down on the world's own
	// input layer is captured there, and its moves come from it.
	const pathOf = (e: Event): PathEl[] =>
		e.composedPath().flatMap((t) => (t instanceof Element ? [{ tag: t.tagName.toLowerCase(), role: t.getAttribute("role"), world: t === input }] : []));
	const at = (e: { clientX: number; clientY: number }) => {
		const box = input.getBoundingClientRect();
		return { x: e.clientX - box.left, y: e.clientY - box.top };
	};
	const feed = (r: { g: Gesture; out: Intent[] }) => {
		gesture = r.g;
		if (r.out.length > 0) intents.push(...r.out);
		root.toggleAttribute("data-drag", gesture.moved && gesture.pointers.length > 0);
		wake();
	};
	const pointer = (kind: PointerIn["kind"], e: PointerEvent, onWorld: boolean) => {
		const p = at(e);
		feed(onPointer(gesture, { kind, id: e.pointerId, x: p.x, y: p.y, t: clock(), onWorld }));
	};
	const onDown = guarded((e: PointerEvent) => {
		const onWorld = worldMayTake(startOf(pathOf(e)));
		if (onWorld) {
			try {
				input.setPointerCapture(e.pointerId); // a drag that crosses the conversation stays the world's
			} catch {
				// the pointer is already gone
			}
		}
		pointer("down", e, onWorld);
	});
	const onUp = guarded((e: PointerEvent) => pointer(e.type === "pointercancel" ? "cancel" : "up", e, false));
	const onMove = guarded((e: PointerEvent) => pointer("move", e, true));
	const onWheelEvent = guarded((e: WheelEvent) => {
		const onWorld = worldMayTake(startOf(pathOf(e)));
		if (!onWorld) return;
		// The world's own wheel: nothing of the page scrolls or zooms under it, even before it adds up to a step.
		e.preventDefault();
		lastWheel = clock();
		const p = at(e);
		const mode = e.deltaMode === 1 || e.deltaMode === 2 ? e.deltaMode : 0;
		feed(onWheel(gesture, { dx: e.deltaX, dy: e.deltaY, mode, ctrl: e.ctrlKey, x: p.x, y: p.y, t: lastWheel, onWorld }));
	});
	const onKeyDown = guarded((e: KeyboardEvent) => {
		if (e.altKey || e.ctrlKey || e.metaKey) return;
		const out = onKey({ key: e.key, w: css.w, h: css.h });
		if (out.length === 0) return;
		e.preventDefault();
		intents.push(...out);
		wake();
	});
	const capture = { capture: true, passive: true } as const;
	window.addEventListener("pointerdown", onDown, capture);
	window.addEventListener("pointerup", onUp, capture);
	window.addEventListener("pointercancel", onUp, capture);
	input.addEventListener("pointermove", onMove, { passive: true });
	input.addEventListener("wheel", onWheelEvent, { passive: false });
	input.addEventListener("keydown", onKeyDown);
	g.undo.push(() => {
		window.removeEventListener("pointerdown", onDown, capture);
		window.removeEventListener("pointerup", onUp, capture);
		window.removeEventListener("pointercancel", onUp, capture);
		input.removeEventListener("pointermove", onMove);
		input.removeEventListener("wheel", onWheelEvent);
		input.removeEventListener("keydown", onKeyDown);
	});

	// Back after a hide, a sleep or the back/forward cache: the village may have been cleared elsewhere, so nothing is
	// saved until the rows are read again; when one went backwards or is gone the read wins (adoptRead).
	const recheck = () => {
		if (!persist || fixed()?.rooms || !village || !counts || !canSave) return;
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
				console.warn("[world] Could not read the village again.", err);
			});
	};
	const onVisibility = guarded(() => {
		const now = clock();
		if (document.hidden) {
			apply({ type: "hidden", now });
			saveSoon("hidden");
			gesture = NO_GESTURE;
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
	const onResize = guarded(() => {
		if (measure() && !document.hidden) schedule(0);
	});
	const resize = new ResizeObserver(onResize);
	resize.observe(root);
	window.addEventListener("resize", onResize); // a change of the device pixel ratio (another screen, the browser's zoom)
	g.undo.push(() => {
		resize.disconnect();
		window.removeEventListener("resize", onResize);
	});
	if (persist) {
		void loadMap().catch((err: unknown) => console.warn("[world] Could not read the world.", err));
		loadCastle();
		// Settings cleared the village (village-data.ts), here or in another tab: drop everything held and read it again.
		const onCleared = guarded(() => {
			gen++;
			village = null;
			canSave = false;
			news = [];
			drawn = null;
			loadCastle();
			schedule(0);
		});
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
		repaint();
		schedule(0);
	});
	measure();
	if (document.hidden) apply({ type: "hidden", now: clock() });
	schedule(document.hidden ? null : 0);

	return {
		send: guarded((e: ActorEvent) => {
			apply(e);
			if (e.type === "message") goHome(clock()); // a message brings the camera back to him (spec 3.2)
			wake();
		}),
		refresh: guarded(() => {
			drawn = null;
			skyKey = "";
			hitCam = "";
			wake();
		}),
		takeNews() {
			const n = news[0] ?? null;
			news = news.slice(1);
			return n;
		},
		context: () => (counts === null ? null : roomContext(place(), counts)),
		zoom: guarded((dir: 1 | -1) => {
			intents.push({ kind: "zoom", dir, x: css.w / 2, y: css.h / 2 });
			wake();
		}),
		home: guarded(() => {
			intents.push({ kind: "home" });
			wake();
		}),
		dispose() {
			g.dead = true;
			cancel();
			for (const u of g.undo) u();
			painter.release?.();
			saveSoon("hidden");
		},
	};
}
