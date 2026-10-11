// The big world's engine (free-will spec sections 3 and 4; I1 of docs/superpowers/plans/2026-10-11-osmo-free-will.md):
// the DOM and network glue around the pure modules. It holds the state (the map, the castle or the builds, him, the
// camera, Gur's gesture, the work budget, the decision gate, the time-lapse) and calls flow.ts for every choice. Like
// the small world's engine in components/osmo/world.tsx it runs outside React, reads the latest props through `live`,
// and never throws into React: a failure stops the world and logs one warning. Canvas px are CSS px times the device
// pixel ratio; everything handed back to the DOM (the bubble's place, the room buttons, pointer positions) is CSS px.
//
// Two modes. big (phase 1): the castle is today's village table, its blocks moved by the home offset where they are
// drawn, and he stays on the home island. builds (phase 2): the castle's rooms and his own builds are rows of the builds
// table; the castle comes first and outside the budget; free blocks spend the work budget; he decides what to build
// when one is due, travels by the balloon and his bridges, and catches up on return with a time-lapse. With OSMO_WILL on
// the server, the model picks one of the three candidates and writes his line (phase 3); otherwise code does.
import { facingViewer, look, newActor, nextLookIn, pose, PRESENT_MS, step, type Actor, type ActorEvent, type ActorKind, type ActorWorld } from "../actor";
import { cellsOf, REST_X, START_X } from "../blueprints";
import { CASTLE_BLOCKS } from "../blueprints/castle";
import { CASTLE_ROOMS, TILE, type Block, type CastleRoom } from "../blueprints/types";
import { accrued, MS_PER_BLOCK, spendBudget, splitReturn } from "../build/budget";
import { insertBuild, loadBuilds, saveBuild } from "../build/builds-data";
import { CASTLE_RECTS, castleAt, castleFootprint, castleRecipeId, roomOfRecipe } from "../build/castle-sites";
import { compile } from "../build/compile";
import { PARTS } from "../build/parts";
import { RECIPES } from "../build/recipes";
import { checkBuild, ruleWorldOf } from "../build/rules";
import {
	admitRooms, adoptBuilds, builtRects, castleCarry, castleWaiting, currentBuild, dueBuildSaves, finishedCastle, freeInProgress, layBuild, markBuildSaved,
	newCastleRow, nextBuildBlock, resumeBuilds, startBuild,
} from "../build/state";
import type { BuildNews, BuildRow, Builds, Candidate } from "../build/types";
import { chooseVariation, vary } from "../build/variation";
import { easing, GLIDE_MS, toScreen, ZOOM_MS, zoomAt, zoomTo, type Camera, type View } from "../camera";
import { canvasPainter, loadSheets, type Overrides } from "../canvas-painter";
import { bearing } from "../face";
import { CHUNK_KEEP, deviceRatio } from "../lod";
import { chimneyLaid, HOME_CHIMNEY, HOME_SMOKE_FROM, lifeAt, lifeWants, smokeSeen, type Landing } from "../life";
import { generateWorld, maxIslands } from "../map/generate";
import { shouldRise } from "../map/growth";
import { DOCK_BLOCKS, DOCK_DECK, HOME_ISLAND, HOME_TOP, homePx, RIDE_FEET } from "../map/home";
import { columnOf, islandById } from "../map/lookup";
import { uncovered } from "../map/scenery";
import { GEN, HOME_DX, HOME_DY, START_ISLANDS, type Deck, type WorldMap, type WorldPt, type WorldRow } from "../map/types";
import { createWorld, loadWorld, saveWorld } from "../map/world-data";
import { FRAME_H } from "../osmo-sprite";
import { AMBIENT_MS, FRAME_MS, framePace, shouldDraw, SLOW_MS, type DrawKey } from "../pace";
import { decidedToday, decisionDue, fallbackLine, moodOf, newRow, pickByCode, plan, returnDecisions, willBody, type PlanDeps } from "../plan/planner";
import type { VillageNews, VillageRow } from "../progress";
import { artFor, drawSky, drawWorld } from "../render";
import { clickable, hitAreas, placeOf, roomContext, spotX } from "../rooms";
import { daylight, hourOf, phaseOf, skyAt, starField, sunAt } from "../sky";
import { lapseSchedule, lookAt, shotsDue, type Shot } from "../travel/timelapse";
import { boardingOf, floorAt, islandOfPx } from "../travel/travel";
import { openRooms, SETTINGS_SEEN, type VillageCounts } from "../unlock";
import { BIG_BOUNDS, drift, followBig, homeTo, newBigCamera, offScreen, panBy, zoomAbout, zoomSteps } from "../view/camera-big";
import { interacting, NO_GESTURE, onKey, onPointer, onWheel, worldMayTake, type Gesture, type Intent, type PointerIn } from "../view/input";
import { admit, adoptRead, dueSaves, finishedRooms, layNext, markRoomSaved, pinnedVillage, resumeVillage, type Village } from "../village";
import { readVillageCounts } from "../village-counts";
import { CLEARED_KEY, loadVillage, saveRoom, VILLAGE_CLEARED } from "../village-data";
import { askWill } from "../will/ask";
import { moodWords } from "../../agent/slow-mood";
import { createSeenStore } from "../../shell/rail";
import { supabase } from "../../supabase";
import { TALK } from "../../shell/route";
import {
	beginDecision, cameraAfter, catchUpStep, decisionStarted, decksOf, drawLists, endDecision, followZoom, goalsOf, lapseRuns, mayDecide, OPEN_GATE, rowsOf,
	shiftedVillage, showHome, startOf, WILL_LINE_MS, yardOf, type CameraEvent, type CameraMode, type CatchUp, type Gate, type PathEl,
} from "./flow";
import type { Engine, Hooks, WorldProps } from "./types";

type Live = { current: WorldProps };
type Guard = { dead: boolean; undo: (() => void)[] };
type Lists = { laid: readonly Block[]; ghost: Block | null; lights: readonly { x: number; y: number }[] };
// The time-lapse playing (spec 4.7): its shots, when it began, how many have popped in, and the laid list drawn now
// (every laid block but the ones still to pop in), kept per list it was made from.
type Lapse = { shots: readonly Shot[]; start: number; due: number; from: readonly Block[] | null; list: readonly Block[]; aim: WorldPt | null };
const DEV_SEED = 7; // the dev page's world when it pins no seed
const TAP_HIM_PX = 24; // a tap this close to his sprite (CSS px) brings the camera back to him
const WHEEL_FRAMES_MS = 150; // frames come from requestAnimationFrame this long after a wheel event
const HITS_EVERY_MS = 100; // the room buttons are placed at most this often while the camera is still
const NEWS_KEEP = 4;
const HOME_SHIFT = { x: HOME_DX * TILE, y: HOME_DY * TILE }; // the castle's offset in the big world, world px
const NO_BUILDS: Builds = { castle: [], list: [] };
const NO_DECKS: readonly Deck[] = [];
const NO_LIGHTS: readonly { x: number; y: number }[] = [];
const NOTHING: Lists = { laid: [], ghost: null, lights: NO_LIGHTS };

// The dev page's finished castle: the six rooms' rows, every block laid (builds mode), or the village's (big mode).
const doneCastleRows = (nowIso: string): BuildRow[] =>
	CASTLE_ROOMS.map((room) => {
		const at = castleAt(room);
		const footprint = castleFootprint(room);
		const recipe = castleRecipeId(room);
		const total = cellsOf(footprint, at.x, at.y, recipe).length;
		return { id: `dev-${recipe}`, recipe, params: {}, island: 0, x: at.x, y: at.y, footprint, total, laid: total, reason: null, started_at: nowIso, finished_at: nowIso };
	});
const doneVillageRows = (nowIso: string): VillageRow[] =>
	CASTLE_ROOMS.map((room) => ({ room, laid: CASTLE_BLOCKS[room].length, started_at: nowIso, finished_at: nowIso }));

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
	const ctx = canvas.getContext("2d");
	const skyCtx = skyCanvas.getContext("2d");
	if (!ctx || !skyCtx) return null;
	const withBuilds = mode === "builds";
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const persist = live.current.persist !== false;
	const stars = starField();
	const clock = () => performance.now();
	const iso = () => new Date().toISOString();
	const fixed = () => live.current.fixed;
	const hourNow = () => fixed()?.hour ?? hourOf(new Date());
	const place = () => placeOf(live.current.route ?? TALK);

	// The world: in the room, home alone until the visit's one read of the world row answers (a failed read draws seed 0
	// for the visit, and nothing of his own is built or saved: worldOk); on the dev page, its seed, read and saved never.
	let map: WorldMap = persist ? generateWorld(0, GEN, 1) : generateWorld(fixed()?.seed ?? DEV_SEED, GEN, fixed()?.islands ?? START_ISLANDS);
	let worldOk = !persist;
	// The work budget (builds mode): spent up to budgetAt; savedAt is what the row holds as far as this page knows.
	// awayMs: how long the world had not run when the row was read (Gur away a long time: the planner's mood).
	let budgetAt = iso();
	let savedAt = budgetAt;
	let awayMs = 0;
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

	// The dev page's castle: every room open, built live from nothing, or (castle "done") all six finished, in memory.
	const castleDone = !persist && fixed()?.castle === "done";
	// big mode: today's village (the dev page's, or its pinned rooms).
	let village: Village | null = persist || withBuilds ? null : resumeVillage(castleDone ? doneVillageRows(iso()) : [], CASTLE_ROOMS, iso());
	// builds mode: the castle's rooms and his own builds.
	let builds: Builds | null = persist || !withBuilds ? null : resumeBuilds(castleDone ? doneCastleRows(iso()) : [], CASTLE_ROOMS, iso());
	let counts: VillageCounts | null = null;
	let settingsOpened = createSeenStore(storage(), iso).peek(SETTINGS_SEEN) !== null;
	let gen = 0; // a clear or a re-read bumps it: a read or a save begun before is dropped
	let canSave = false;
	let saving = false;
	let buildSave: Promise<void> | null = null; // the builds' save running now; the next waits for it
	let blockSaveWaiting = false;
	let news: VillageNews[] = [];
	let landing: Landing | null = null;
	let pinKey = "";
	let pinned: Village | null = null;
	// Decisions and the catch-up (builds mode).
	let gate: Gate = OPEN_GATE;
	let catching = false;
	let catchFrom: Builds | null = null; // drawn while the catch-up runs, so its blocks pop in with the time-lapse
	let lapse: Lapse | null = null;
	let lastLine: string | null = null;
	let lineAfterLapse: string | null = null;
	let lineTimer: ReturnType<typeof setTimeout> | null = null;
	let devN = 0;
	let willOff = false; // the will answered "off" this visit: code picks from then on
	let grantAt: number | null = null; // the dev page's last grant

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
	let groundKept: { map: WorldMap; key: string; list: readonly Block[] } | null = null;
	let decksFrom: Builds | null | undefined;
	let decksMap: WorldMap | null = null;
	let decksKey = "";
	let finishedKey = "";
	let decks: readonly Deck[] = withBuilds ? [DOCK_DECK] : NO_DECKS;
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
	const openNow = (): CastleRoom[] =>
		!persist ? [...CASTLE_ROOMS] : counts ? openRooms({ counts, settingsOpened: settingsOpened || place() === "observatory" }) : [];

	// The village drawn (big mode): the dev page's pinned one (kept while its pins are the same, so the lists the
	// renderer keys its caches on hold), or the real one (null until the visit's read answers).
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
	// Whether a block of his own may be laid or a build chosen: the world row was read and the builds can be saved (the
	// dev page: always), and no catch-up is running.
	const mayBuildFree = () => (persist ? canSave && worldOk : true);
	// The block he works on next: the castle's first (outside the budget), else his own build's while a block of the
	// budget has accrued. big mode: the village's, none while the dev page pins the rooms.
	const workBlock = (): Block | null => {
		if (!withBuilds) return fixed()?.rooms || !village ? null : shiftedVillage(village).ghost;
		if (!builds) return null;
		const b = nextBuildBlock(builds);
		if (!b || castleWaiting(builds)) return b;
		return mayBuildFree() && !catching && accrued(budgetAt, Date.now()) >= 1 ? b : null;
	};
	// The ground drawn: the map without the scenery under started builds, and the dock with builds on; made again only
	// when the builds' rects or the map change (the renderer keys its caches on the list).
	const groundNow = (): readonly Block[] => {
		const rects = withBuilds && builds ? builtRects(builds) : [];
		const key = rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(";");
		if (groundKept && groundKept.map === map && groundKept.key === key) return groundKept.list;
		const list = withBuilds ? [...uncovered(map, rects), ...DOCK_BLOCKS] : uncovered(map, rects);
		groundKept = { map, key, list };
		return list;
	};
	// What he walks on outside the islands' tops: the dock and every finished rope bridge (made again only when a build
	// finishes or the map changes).
	const decksNow = (): readonly Deck[] => {
		if (!withBuilds) return NO_DECKS;
		if (builds !== decksFrom) {
			decksFrom = builds;
			finishedKey = builds ? builds.list.filter((p) => p.laid >= p.total).map((p) => p.key).join(",") : "";
		}
		if (map !== decksMap || finishedKey !== decksKey) {
			decksMap = map;
			decksKey = finishedKey;
			decks = decksOf(builds ?? NO_BUILDS, map, true);
		}
		return decks;
	};
	const resting = (now: number) => actor.night && !(actor.lastMessage !== null && now - actor.lastMessage < PRESENT_MS);
	// Where he goes this step (flow.ts goalsOf and yardOf), as the ActorWorld, and the balloon trip to take when he
	// stands at the boarding spot of the leg toward the first of his goals.
	const routeNow = (now: number) => {
		const sig = live.current.signals;
		const d = decksNow();
		const at = place();
		const goals = goalsOf(map, d, { island: actor.island, x: actor.x }, {
			visit: at === "yard" ? null : { island: 0, x: spotX(at, HOME_SHIFT.x) },
			rest: resting(now),
			work: workBlock(),
		});
		const world: ActorWorld = {
			next: goals.next,
			restX: actor.island === 0 ? homePx(REST_X) : actor.x,
			speed: bearing(live.current.agent, Date.now(), hourNow()).speed,
			held: sig.inTalk || sig.thinking || sig.speaking,
			visit: goals.visit,
			yard: yardOf(withBuilds ? builds : null, map, actor.island, Date.now()),
			floor: floorAt(map, d),
			islandOf: islandOfPx(map),
			via: goals.via,
		};
		return { world, board: goals.board };
	};

	// The village's saves (big mode): every room that is due, one at a time; a clear in between stops it.
	const saveVillage = async (reason: "block" | "hidden") => {
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
	// The builds' saves (builds mode), one at a time as the village saves: a castle room's first save inserts its row
	// (taken by another tab: read again and adopt), the rest raise their counts; with them, the budget when it moved.
	const saveBuildsOnce = async (reason: "block" | "hidden", mine: number): Promise<void> => {
		if (!persist || !canSave || !builds) return;
		let saved = 0;
		for (const p of dueBuildSaves(builds, reason)) {
			if (gen !== mine || !builds) return; // (not g.dead: the last save runs as the world is put away)
			if (p.id === null) {
				const r = await insertBuild(newCastleRow(p));
				if (gen !== mine || !builds) return;
				if (r.row) {
					builds = markBuildSaved(builds, p.key, p.laid, r.row.id);
					saved++;
				} else if (r.taken) {
					await reread(mine);
					return;
				}
			} else {
				const ok = await saveBuild({ id: p.id, laid: p.laid, finished_at: p.finishedAt });
				if (ok && builds && gen === mine) {
					builds = markBuildSaved(builds, p.key, p.laid, null);
					saved++;
				}
			}
		}
		if (worldOk && budgetAt !== savedAt && (saved > 0 || reason === "hidden")) {
			const at = budgetAt;
			if ((await saveWorld({ budget_at: at })) && gen === mine) savedAt = at;
		}
	};
	const saveBuilds = async (reason: "block" | "hidden"): Promise<void> => {
		while (buildSave) await buildSave;
		if (reason === "block") blockSaveWaiting = false;
		const run = saveBuildsOnce(reason, gen).catch((err: unknown) => console.warn("[world] Could not save the builds.", err));
		buildSave = run;
		try {
			await run;
		} finally {
			if (buildSave === run) buildSave = null;
		}
	};
	const saveSoon = (reason: "block" | "hidden") => {
		if (!withBuilds) {
			void saveVillage(reason).catch((err: unknown) => console.warn("[world] Could not save the village.", err));
			return;
		}
		if (reason === "block") {
			if (blockSaveWaiting) return; // one block save waiting is enough: it saves whatever is due when it runs
			blockSaveWaiting = true;
		}
		void saveBuilds(reason);
	};
	// The builds read again (another tab took the build or the castle room first): the read wins, and a block he was
	// walking to or laying belongs to the old builds, so he chooses again.
	const settle = () => {
		news = [];
		drawn = null;
		if (actor.kind === "building" || (actor.kind === "walking" && actor.purpose === "build")) {
			actor = { ...actor, kind: "idle", since: clock(), target: null, purpose: null, toward: "work" };
		}
	};
	const reread = async (mine: number): Promise<Builds | null> => {
		const again = await loadBuilds();
		if (g.dead || gen !== mine || !again.ok) return null;
		builds = resumeBuilds(again.rows, openNow(), iso());
		settle();
		return builds;
	};

	// Another island rises when the islands present are mostly built (spec 3.1), checked when one of his builds finishes.
	const rise = () => {
		if (!builds) return;
		let max: number;
		try {
			max = maxIslands(map.seed, map.gen);
		} catch {
			return;
		}
		if (!shouldRise(map, builtRects(builds), max)) return;
		const n = map.islands.length + 1;
		map = generateWorld(map.seed, map.gen, n);
		drawn = null;
		if (persist && worldOk) void saveWorld({ islands: n }).catch((err: unknown) => console.warn("[world] Could not save the new island.", err));
	};
	// What a laid block tells: a castle room started or finished (for TurnFacts.village), or one of his builds finished.
	const told = (n: BuildNews | null) => {
		if (!n) return;
		const room = roomOfRecipe(n.recipe);
		if (room) news = [...news, { room, event: n.event }].slice(-NEWS_KEEP);
		else if (n.event === "finished") rise();
	};
	const onLaid = () => {
		if (!withBuilds) {
			if (!village || fixed()?.rooms) return;
			const laidNow = shiftedVillage(village).ghost;
			if (laidNow) landing = { block: laidNow, at: clock() };
			const r = layNext(village, iso());
			village = r.village;
			if (r.news) news = [...news, r.news].slice(-NEWS_KEEP);
			saveSoon("block");
			return;
		}
		if (!builds) return;
		const p = currentBuild(builds);
		if (!p) return;
		const free = roomOfRecipe(p.recipe) === null;
		if (free && (!mayBuildFree() || catching || accrued(budgetAt, Date.now()) < 1)) return;
		const block = p.blocks[p.laid];
		if (block) landing = { block, at: clock() };
		const r = layBuild(builds, iso());
		builds = r.builds;
		if (free) budgetAt = spendBudget(budgetAt, 1, Date.now());
		told(r.news);
		saveSoon("block");
	};
	const apply = (e: ActorEvent, w?: ActorWorld) => {
		const r = step(actor, e, w ?? routeNow(clock()).world);
		actor = r.actor;
		if (r.laid) onLaid();
	};

	// His line for a build he starts (spec 5.5): about six seconds in the bubble; after a time-lapse, once it is over.
	const showLine = (text: string) => {
		if (g.dead) return;
		if (lineTimer !== null) clearTimeout(lineTimer);
		hooks.line?.(text);
		lineTimer = setTimeout(() => {
			lineTimer = null;
			if (!g.dead) hooks.line?.(null);
		}, WILL_LINE_MS);
	};
	g.undo.push(() => {
		if (lineTimer !== null) clearTimeout(lineTimer);
	});
	const showLineAfterLapse = (text: string) => {
		if (lapse) lineAfterLapse = text;
		else showLine(text);
	};
	const moodNow = () => fixed()?.mood ?? moodOf({ mood: live.current.agent.mood, now: Date.now(), awayMs, hour: hourNow() });
	// The planner's seams (I0's seam test plans with the same): the real compiler, rules and variations; the dock's boards
	// are land, so a bridge east of home starts on its far board.
	const planDeps = (): PlanDeps => ({ compile, check: checkBuild, choose: chooseVariation, vary, world: (taken) => ruleWorldOf(map, taken, [DOCK_DECK]) });
	const devRow = (c: Candidate, line: string): BuildRow => ({ ...newRow(c, line), id: `dev-${++devN}`, started_at: iso(), finished_at: null });
	// Gur's access token for /api/will, or null without a session (code picks then).
	const accessToken = async (): Promise<string | null> => {
		try {
			return (await supabase.auth.getSession()).data.session?.access_token ?? null;
		} catch {
			return null;
		}
	};

	// One decision (spec 4.8): three candidates, code's pick and line, the row inserted. Whether a build started: ours, or
	// another tab's adopted (its reason shown instead).
	const decide = async (catchingUp: boolean): Promise<boolean> => {
		gate = beginDecision(gate);
		let started = false;
		const mine = gen;
		try {
			if (!builds) return false;
			const rows = rowsOf(builds);
			const n = rows.filter((r) => roomOfRecipe(r.recipe) === null).length;
			const cands = plan(
				{ seed: map.seed, n, map, rows, recipes: RECIPES, parts: PARTS, mood: moodNow(), him: { island: actor.island, x: columnOf(actor.x) }, blocked: CASTLE_RECTS },
				planDeps(),
			);
			if (cands.length === 0) return false;
			let pick = pickByCode(cands, map.seed, n);
			let line = fallbackLine(cands[pick]);
			// The will (spec 5): with three candidates, in the room, and the will not known to be off this visit, the model
			// picks one and says why. Its line failed the server's checks: code's line for its pick. Off: code picks for the
			// rest of the visit. Any other fallback (no session, the allowance spent, an error): code's pick and line.
			if (cands.length === 3 && persist && !willOff) {
				const token = await accessToken();
				if (g.dead || gen !== mine || !builds) return false;
				if (token) {
					const a = await askWill((...args: Parameters<typeof fetch>) => fetch(...args), token, willBody(cands, moodWords(live.current.agent.mood), rows, RECIPES));
					if (g.dead || gen !== mine || !builds) return false;
					if (a.source === "model") {
						pick = a.pick;
						line = a.line ?? fallbackLine(cands[a.pick]);
					} else if (a.reason === "off") {
						willOff = true;
					}
				}
			}
			// The build before it is saved finished first, so the table takes the new one (one unfinished at a time).
			if (persist) await saveBuilds("hidden");
			if (g.dead || gen !== mine || !builds) return false;
			const r = persist ? await insertBuild(newRow(cands[pick], line)) : { row: devRow(cands[pick], line), taken: false };
			if (g.dead || gen !== mine || !builds) return false;
			let again: Builds | null = null;
			let said = line;
			if (r.taken) {
				again = await reread(mine);
				if (again) said = freeInProgress(again)?.reason ?? line;
			} else if (r.row) {
				builds = startBuild(builds, r.row);
				drawn = null;
			}
			started = decisionStarted(r.row ? "row" : r.taken ? "taken" : "failed", again);
			if (started) {
				lastLine = said;
				if (!catchingUp) showLine(said);
			}
			return started;
		} finally {
			gate = endDecision(gate, started, Date.now());
		}
	};

	// The time-lapse (spec 4.7): the blocks of its runs are hidden and pop in at their shots' times, the camera visiting
	// each site while it may (flow.ts cameraAfter: only from following, and Gur's steering wins).
	const startLapse = (shots: readonly Shot[]) => {
		if (shots.length === 0) return;
		lapse = { shots, start: clock(), due: 0, from: null, list: [], aim: null };
		cameraMode = cameraAfter(cameraMode, "lapse");
		drawn = null;
		wake();
	};
	const lapseList = (laid: readonly Block[]): readonly Block[] => {
		if (!lapse) return laid;
		if (lapse.from !== laid) {
			const hidden = new Set(lapse.shots.slice(lapse.due).map((s) => s.block));
			lapse.from = laid;
			lapse.list = laid.filter((b) => !hidden.has(b));
		}
		return lapse.list;
	};
	const advanceLapse = (now: number) => {
		if (!lapse) return;
		const elapsed = now - lapse.start;
		const due = shotsDue(lapse.shots, elapsed);
		if (due !== lapse.due) {
			if (due > 0) landing = { block: lapse.shots[Math.min(due, lapse.shots.length) - 1].block, at: now };
			lapse.due = due;
			lapse.from = null;
		}
		if (due >= lapse.shots.length) {
			lapse = null;
			cameraMode = cameraAfter(cameraMode, "lapse-end");
			drawn = null;
			if (lineAfterLapse) showLine(lineAfterLapse);
			lineAfterLapse = null;
			return;
		}
		const look = cameraMode === "lapse" ? lookAt(lapse.shots, elapsed) : null;
		if (look && (!lapse.aim || look.x !== lapse.aim.x || look.y !== lapse.aim.y)) {
			lapse.aim = look;
			camera = { ...camera, aimX: look.x, aimY: look.y, ox: camera.x - look.x, oy: camera.y - look.y, glideAt: now };
		}
	};
	// The catch-up on return (spec 4.7): lay the free build in progress at once, decide when none is (at most the day's
	// missed decisions), until the time-lapse's share of the budget is spent or the castle waits; then the time-lapse of
	// what it laid, and the newest decision's line after it. The last LIVE_BLOCKS stay, so he is at work when Gur arrives.
	const catchUp = async (): Promise<void> => {
		if (!withBuilds || catching || !builds || !mayBuildFree()) return;
		catching = true;
		catchFrom = builds;
		lastLine = null;
		const mine = gen;
		const before = builds;
		try {
			let c: CatchUp = { left: splitReturn(accrued(budgetAt, Date.now())).lapse, decided: 0, allowed: returnDecisions(decidedToday(rowsOf(builds), Date.now())) };
			for (;;) {
				if (g.dead || gen !== mine || !builds) return;
				const s = catchUpStep(c, builds);
				if (s.kind === "done") break;
				if (s.kind === "decide") {
					if (!mayDecide(gate, true, Date.now()) || !(await decide(true))) break;
					c = { ...c, decided: c.decided + 1 };
					continue;
				}
				for (let k = 0; k < s.n; k++) {
					const r = layBuild(builds, iso());
					builds = r.builds;
					told(r.news);
				}
				budgetAt = spendBudget(budgetAt, s.n, Date.now());
				c = { ...c, left: c.left - s.n };
				if (persist) await saveBuilds("hidden"); // a finished build is saved before the next insert
			}
			if (g.dead || gen !== mine || !builds) return;
			const runs = lapseRuns(before, builds);
			if (runs.length > 0 && !reduced) startLapse(lapseSchedule(runs)); // under reduced motion: one redraw
			if (lastLine) showLineAfterLapse(lastLine);
		} finally {
			catching = false;
			catchFrom = null;
			drawn = null;
			if (!g.dead) wake();
		}
	};
	const catchUpSoon = () => {
		void catchUp().catch((err: unknown) => console.warn("[world] He could not catch up.", err));
	};

	// The visit's reads: the world row (made on the first visit), the village's rows with, the first time, the counts the
	// unlock rules and the context line use, and in builds mode the builds, with any castle progress the village table
	// holds that builds does not carried over first (spec 6.3, ruling 3).
	const readWorld = async (): Promise<WorldRow | null> => {
		let r = await loadWorld();
		if (r.ok && r.row === null) r = await createWorld();
		return r.ok ? r.row : null;
	};
	const applyWorld = (row: WorldRow | null) => {
		let next: WorldMap | null = null;
		if (row) {
			try {
				next = generateWorld(row.seed, row.gen, row.islands);
			} catch (err) {
				console.warn("[world] The world row names a generator this page does not know.", err);
			}
		}
		if (!row || !next) {
			console.warn("[world] Could not read the world, so it is drawn from seed 0 and nothing of his own is built this visit.");
			worldOk = false;
			map = generateWorld(0, GEN, START_ISLANDS);
		} else {
			worldOk = true;
			map = next;
			budgetAt = row.budget_at;
			savedAt = row.budget_at;
			const t = Date.parse(row.budget_at);
			awayMs = Number.isFinite(t) ? Math.max(0, Date.now() - t) : 0;
		}
		drawn = null;
	};
	const carry = async (rows: BuildRow[], villageRows: readonly VillageRow[], mine: number): Promise<BuildRow[]> => {
		const c = castleCarry(rows, villageRows);
		if (c.insert.length === 0 && c.raise.length === 0) return rows;
		for (const n of c.insert) await insertBuild(n);
		for (const up of c.raise) {
			const row = rows.find((r) => r.id === up.id);
			const was = villageRows.find((v) => row !== undefined && castleRecipeId(v.room as CastleRoom) === row.recipe);
			await saveBuild({ id: up.id, laid: up.laid, finished_at: row && up.laid >= row.total ? (was?.finished_at ?? iso()) : null });
		}
		if (g.dead || gen !== mine) return rows;
		const again = await loadBuilds();
		return again.ok ? again.rows : rows;
	};
	const loadAll = () => {
		const mine = gen;
		const work = async () => {
			const [row, v, c, b] = await Promise.all([
				readWorld().catch(() => null),
				loadVillage(),
				counts ? Promise.resolve(counts) : readVillageCounts(),
				withBuilds ? loadBuilds() : Promise.resolve(null),
			]);
			if (g.dead || mine !== gen) return;
			counts = c;
			applyWorld(row);
			if (!withBuilds) {
				if (!v.ok) {
					console.warn("[world] Could not read the village, so he will not build this visit.");
					return;
				}
				village = resumeVillage(v.rows, openNow(), iso());
				canSave = true;
				schedule(0);
				return;
			}
			if (!b || !b.ok) {
				console.warn("[world] Could not read the builds, so he will not build this visit.");
				return;
			}
			const rows = v.ok ? await carry(b.rows, v.rows, mine) : b.rows;
			if (g.dead || mine !== gen) return;
			builds = resumeBuilds(rows, openNow(), iso());
			canSave = true;
			drawn = null;
			schedule(0);
			await catchUp();
		};
		void work().catch((err: unknown) => console.warn("[world] Could not read the world.", err));
	};

	// The finished rooms get a button each (React draws them, from hooks.finished); the loop places them over the canvas,
	// in CSS px, hidden below CSS zoom 1.
	const placeHits = (finished: readonly CastleRoom[], now: number) => {
		const rooms = clickable(finished);
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
			// Covered: a panel is open, or something of the conversation lies over the middle of the part in view.
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
	// Something came in (a gesture, a key, a dev button, a decision): the next frame now.
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

	// The world canvas's backing store follows the box and the device pixel ratio. The sky canvas stays at CSS px: it is
	// a gradient and single-pixel stars, which a retina backing store would only shrink.
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
	// What is drawn of the castle and the builds this frame: while the catch-up runs, the builds as they were before it;
	// while the time-lapse plays, without the blocks still to pop in, and no ghost.
	const listsNow = (): Lists => {
		if (!withBuilds) {
			const v = shown();
			if (!v) return NOTHING;
			const s = shiftedVillage(v);
			return { laid: s.laid, ghost: s.ghost, lights: NO_LIGHTS };
		}
		if (!builds) return NOTHING;
		const d = drawLists(catchFrom ?? builds);
		return { laid: lapseList(d.laid), ghost: lapse || catchFrom ? null : workBlock(), lights: d.lights };
	};
	// The castle's finished rooms: each gets a button.
	const finishedNow = (): CastleRoom[] => {
		if (withBuilds) return builds ? finishedCastle(builds) : [];
		const v = shown();
		return v ? finishedRooms(v) : [];
	};
	// The balloon (builds mode): under him while he rides, else moored at the boarding spot of the island he is on.
	const balloonNow = (): { x: number; y: number } | null => {
		if (!withBuilds) return null;
		if (actor.kind === "riding") return { x: actor.x, y: actor.y - RIDE_FEET };
		return boardingOf(islandById(map, actor.island) ?? HOME_ISLAND, HOME_ISLAND);
	};

	const frame = guarded((): void => {
		timer = null;
		raf = null;
		const now = clock();
		const wall = Date.now();
		const dt = now - last;
		last = now;
		const hour = hourNow();
		if (Math.floor(hour) !== lastHour) {
			lastHour = Math.floor(hour);
			apply({ type: "hour", now, hour });
		}
		// 1. Gur's gestures and keys move the camera
		steer(now);
		// 2. him: a pose the dev page pins, or a step; at the boarding spot of a leg to another island, the balloon.
		// 3. a block laid (onLaid): the castle first, a free block only while the budget has one, which it then spends
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
			if (village && counts) village = admit(village, openNow(), iso());
			if (builds && counts) builds = admitRooms(builds, openNow(), iso());
		}
		// 4. a decision, when one is due (spec 4.8): the gate lets one run at a time and pauses after one that started nothing
		if (withBuilds && builds && !catching && mayBuildFree() && !freeInProgress(builds) && !castleWaiting(builds)) {
			const due = decisionDue({
				building: false, castleWaiting: false, budget: accrued(budgetAt, wall), quietMs: now - actor.quietSince, decidedToday: decidedToday(rowsOf(builds), wall),
			});
			if (mayDecide(gate, due, wall)) void decide(false).catch((err: unknown) => console.warn("[world] He could not choose a build.", err));
		}
		if (live.current.colorA !== scarf || darkAt(hour) !== dark) {
			scarf = live.current.colorA;
			dark = darkAt(hour);
			repaint();
		}
		// The dev page's grant (a new `at`): the budget set that many blocks back, then the catch-up, as on a return.
		const grant = fixed()?.grant;
		if (!persist && withBuilds && grant && grant.at !== grantAt) {
			grantAt = grant.at;
			budgetAt = new Date(wall - Math.max(0, grant.blocks) * MS_PER_BLOCK).toISOString();
			catchUpSoon();
		}
		advanceLapse(now);
		// 6. the camera: following him, drifting where Gur left it, or gliding to the time-lapse's sites
		const close = facingViewer(actor);
		if (cameraMode === "following") {
			camera = zoomTo(camera, followZoom(css.w, css.h, close, dpr), now, reduced);
			camera = followBig(camera, him(), view, BIG_BOUNDS, now, dt, close, reduced, phone());
		} else {
			camera = drift(camera, view, BIG_BOUNDS, now);
		}
		paintSky(hour);
		// 7. the drawing
		const lists = listsNow();
		if (lists.laid !== chimneyFrom) {
			chimneyFrom = lists.laid;
			chimneyKept = chimneyLaid(lists.laid, HOME_CHIMNEY);
		}
		root.toggleAttribute("data-show-hits", fixed()?.hits === true);
		const z = zoomAt(camera, now);
		const life = lifeAt({
			wallMs: wall, now, view, scale: z, day: daylight(hour) >= 1, night: dark >= 0.5,
			chimney: !reduced && chimneyKept && smokeSeen(camera, view, now, HOME_SMOKE_FROM), landing, motion: !reduced, force: fixed()?.life, smokeFrom: HOME_SMOKE_FROM,
		});
		const key: DrawKey = {
			laid: lists.laid.length, kind: actor.kind, phase: phaseOf(hour), zoom: z, tx: Math.floor(actor.x / TILE), cx: Math.round(camera.x), cy: Math.round(camera.y),
		};
		if (shouldDraw(reduced, drawn, key) || pending > 0) {
			drawn = key;
			const face = bearing(live.current.agent, wall, hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			const t0 = clock();
			pending = drawWorld(painter, {
				camera, view, now, clock: now, ground: groundNow(), laid: lists.laid, ghost: lists.ghost,
				outline: [], // the room never shows what he is building towards (Gur, 2026-10-11, ff1b324)
				him: { x: actor.x, y: actor.y, look: look(actor, now, face, !reduced) }, sky, dark, life,
				anchor: { x: homePx(START_X), groundY: HOME_TOP * TILE }, dpr, balloon: balloonNow(), lights: lists.lights,
			}).pending;
			live.current.onFrame?.(clock() - t0);
			const head = toScreen(camera, view, now, actor.x, actor.y - FRAME_H);
			root.style.setProperty("--him-x", `${head.x / dpr}px`);
			root.style.setProperty("--him-y", `${head.y / dpr}px`);
		}
		placeHits(finishedNow(), now);
		const off = showHome(cameraMode, offScreen(camera, him(), view, now));
		if (off !== away) {
			away = off;
			hooks.away?.(off);
		}
		// 8. the pace: animation frames while Gur steers; otherwise one timer, FRAME_MS while chunks wait to be baked
		const moving = easing(camera, now) || now - camera.glideAt < Math.max(GLIDE_MS, ZOOM_MS) || lapse !== null;
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
		const deltaMode = e.deltaMode === 1 || e.deltaMode === 2 ? e.deltaMode : 0;
		feed(onWheel(gesture, { dx: e.deltaX, dy: e.deltaY, mode: deltaMode, ctrl: e.ctrlKey, x: p.x, y: p.y, t: lastWheel, onWorld }));
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

	// Back after a hide, a sleep or the back/forward cache: the castle or the builds may have been cleared elsewhere, so
	// nothing is saved until the rows are read again; when one went backwards or is gone the read wins. In builds mode the
	// world row is read again too (another tab may have spent the budget or raised an island), then he catches up.
	const recheck = () => {
		if (!persist) {
			catchUpSoon();
			return;
		}
		if (!withBuilds) {
			if (fixed()?.rooms || !village || !counts || !canSave) return;
			const mine = ++gen;
			canSave = false;
			void loadVillage()
				.then(({ rows, ok }) => {
					if (g.dead || mine !== gen) return;
					canSave = true;
					if (ok && village && counts) {
						const r = adoptRead(village, rows, openNow(), iso());
						if (r.adopted) {
							village = r.village;
							settle();
						}
					}
					schedule(0);
				})
				.catch((err: unknown) => {
					if (g.dead || mine !== gen) return;
					canSave = true;
					console.warn("[world] Could not read the village again.", err);
				});
			return;
		}
		if (!builds || !canSave) return;
		const mine = ++gen;
		canSave = false;
		const work = async () => {
			const [b, w] = await Promise.all([loadBuilds(), worldOk ? loadWorld() : Promise.resolve(null)]);
			if (g.dead || mine !== gen) return;
			canSave = true;
			if (b.ok && builds) {
				const r = adoptBuilds(builds, b.rows, openNow(), iso());
				if (r.adopted) {
					builds = r.builds;
					settle();
				}
			}
			if (w?.ok && w.row) {
				if (Date.parse(w.row.budget_at) > Date.parse(budgetAt)) {
					budgetAt = w.row.budget_at;
					savedAt = w.row.budget_at;
				}
				if (w.row.islands > map.islands.length) map = generateWorld(map.seed, map.gen, w.row.islands);
			}
			schedule(0);
			await catchUp();
		};
		void work().catch((err: unknown) => {
			if (g.dead || mine !== gen) return;
			canSave = true;
			console.warn("[world] Could not read the builds again.", err);
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
		loadAll();
		// Settings cleared the village or the world (village-data.ts), here or in another tab: drop everything held and
		// read it again; he begins the hall. The islands stay.
		const onCleared = guarded(() => {
			gen++;
			village = null;
			builds = null;
			canSave = false;
			news = [];
			gate = OPEN_GATE;
			lapse = null;
			if (cameraMode === "lapse") cameraMode = cameraAfter(cameraMode, "lapse-end");
			settle();
			loadAll();
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
