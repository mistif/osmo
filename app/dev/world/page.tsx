"use client";

// A dev-only view of the village: every state he can be in, every hour of the sky, each room locked or at 0, 50 and
// 100 percent (the faint outlines show at 0 and 50), the castle building live, the room hit areas, walking to each
// panel's room, each mood, the phone camera, and (polish pass) the life in the world: snow, smoke and birds by the
// clock, all of it now, or none; and (free-will plan, I2) the big world: Small, Big or Builds, its seed and islands, the
// zoom and the frame timer, the castle live or done, a grant of blocks to his budget, the planner's mood, the recipe
// preview and the planner panel. Nothing is read or saved. Not served in production.
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "../../assistant.module.css";
import dev from "./dev.module.css";
import { WorldStage, type WorldControl, type WorldFixed } from "@/components/osmo/world";
import { moodTheme } from "@/lib/agent/mood-theme";
import { BASELINE, type Activations, type Emotion } from "@/lib/agent/state";
import { routeHash, type Route } from "@/lib/shell/route";
import type { ActorKind } from "@/lib/world/actor";
import { CASTLE_BLOCKS } from "@/lib/world/blueprints/castle";
import { CASTLE_ROOMS, type CastleRoom } from "@/lib/world/blueprints/types";
import type { MoodKind } from "@/lib/world/build/types";
import { placeOf } from "@/lib/world/rooms";
import { PlannerPanel } from "./planner-panel";
import { RecipePreview } from "./recipe-preview";

const font = Bricolage_Grotesque({ subsets: ["latin"] });
const MOODS: (Emotion | "calm")[] = ["calm", "joy", "sadness", "fear", "anger", "love", "loneliness", "hope", "boredom"];
const POSES: (ActorKind | "live")[] = ["live", "idle", "walking", "building", "turning", "facing", "resting"];
type Fill = "locked" | 0 | 0.5 | 1;
const FILLS: { label: string; fill: Fill }[] = [
	{ label: "Locked", fill: "locked" },
	{ label: "0%", fill: 0 },
	{ label: "50%", fill: 0.5 },
	{ label: "100%", fill: 1 },
];
type Pins = Record<CastleRoom, Fill>;
const pinsOf = (hall: Fill, rest: Fill): Pins =>
	Object.fromEntries(CASTLE_ROOMS.map((room) => [room, room === "hall" ? hall : rest])) as Pins;
const PRESETS: { label: string; pins: Pins | null }[] = [
	{ label: "Building live", pins: null },
	{ label: "Hall only", pins: pinsOf(1, "locked") },
	{ label: "Outlines", pins: pinsOf(1, 0) },
	{ label: "Half built", pins: pinsOf(1, 0.5) },
	{ label: "Whole castle", pins: pinsOf(1, 1) },
];
// Each room's laid blocks for the world's pins; a locked room is left out.
const roomsFrom = (pins: Pins): Partial<Record<CastleRoom, number>> =>
	Object.fromEntries(
		CASTLE_ROOMS.filter((room) => pins[room] !== "locked").map((room) => [room, Math.round(Number(pins[room]) * CASTLE_BLOCKS[room].length)]),
	);
const PLACES: { label: string; route: Route }[] = [
	{ label: "Talk", route: { panel: null } },
	{ label: "Library", route: { panel: "library" } },
	{ label: "Things", route: { panel: "library", page: "things" } },
	{ label: "Feed", route: { panel: "feed" } },
	{ label: "Ideas", route: { panel: "ideas" } },
	{ label: "Settings", route: { panel: "settings" } },
];
const HOURS: { label: string; hour: number }[] = [
	{ label: "Night", hour: 0 },
	{ label: "Dawn", hour: 6 },
	{ label: "Day", hour: 13 },
	{ label: "Dusk", hour: 20 },
];
const SAID = "Good evening, Gur. I have laid the east wall of the hall.";
type LifeMode = "clock" | "all" | "none";
const LIFE: { label: string; mode: LifeMode }[] = [
	{ label: "Life by the clock", mode: "clock" },
	{ label: "All life now", mode: "all" },
	{ label: "No life", mode: "none" },
];

// The big world's pins (free-will plan, I2). The page starts on the small world, as it always has; a pin wins over the switches.
type WorldPin = NonNullable<WorldFixed["world"]>;
const WORLDS: { label: string; world: WorldPin }[] = [
	{ label: "Small", world: "small" },
	{ label: "Big", world: "big" },
	{ label: "Builds", world: "builds" },
];
const DEV_SEED = 7;
const SEED_MAX = 2_147_483_647;
const ISLAND_COUNTS = [4, 5, 6, 7, 8];
const PLANNER_MOODS: MoodKind[] = ["low", "bright", "tired", "curious", "missing", "calm"];
const FRAMES_KEPT = 60;
const seedOf = (text: string): number => {
	const n = Math.floor(Number(text));
	return Number.isFinite(n) ? Math.min(SEED_MAX, Math.max(0, n)) : 0;
};
function frameText(times: readonly number[]): string {
	if (times.length === 0) return "frame: no frames yet";
	const average = times.reduce((sum, t) => sum + t, 0) / times.length;
	return `frame ${average.toFixed(1)} ms average, ${Math.max(...times).toFixed(1)} ms slowest`;
}
// The timer reads the last FRAMES_KEPT draw times from a ref twice a second, so a frame never re-renders the page.
function FrameReadout({ times }: { times: { current: number[] } }) {
	const [text, setText] = useState(() => frameText([]));
	useEffect(() => {
		const timer = setInterval(() => setText(frameText(times.current)), 500);
		return () => clearInterval(timer);
	}, [times]);
	return <span className={dev.readout}>{text}</span>;
}

function feeling(mood: Emotion | "calm"): Activations {
	const a = { ...BASELINE };
	if (mood !== "calm") a[mood] = Math.min(1, BASELINE[mood] + 0.6);
	return a;
}

export default function WorldPage() {
	if (process.env.NODE_ENV === "production") notFound();
	const [mood, setMood] = useState<Emotion | "calm">("calm");
	const [hour, setHour] = useState<number | null>(13); // null: the real clock
	const [poseKind, setPoseKind] = useState<ActorKind | "live">("live");
	const [pins, setPins] = useState<Pins | null>(null); // null: building live
	const [route, setRoute] = useState<Route>({ panel: null });
	const [opened, setOpened] = useState<string | null>(null);
	const [hits, setHits] = useState(false);
	const [phone, setPhone] = useState(false);
	const [speaking, setSpeaking] = useState(false);
	const [lines, setLines] = useState(0);
	const [life, setLife] = useState<LifeMode>("clock");
	const [worldPin, setWorldPin] = useState<WorldPin>("small");
	const [seed, setSeed] = useState(DEV_SEED);
	const [islands, setIslands] = useState(ISLAND_COUNTS[0]);
	const [castle, setCastle] = useState<"live" | "done">("live");
	const [grant, setGrant] = useState<{ blocks: number; at: number } | undefined>(undefined);
	const [plannerMood, setPlannerMood] = useState<MoodKind | undefined>(undefined);
	const controlRef = useRef<WorldControl | null>(null);
	const frames = useRef<number[]>([]);
	const onFrame = useCallback((ms: number) => {
		const kept = frames.current;
		kept.push(ms);
		if (kept.length > FRAMES_KEPT) kept.shift();
	}, []);
	const big = worldPin !== "small";
	const activations = feeling(mood);
	const theme = moodTheme(activations);
	const stageStyle = {
		"--aura-a": theme.colorA,
		"--aura-b": theme.colorB,
		"--base": theme.base,
		"--pulse": `${theme.pulseSeconds.toFixed(2)}s`,
		"--strength": theme.strength.toFixed(2),
	} as CSSProperties;
	const button = (label: string, pressed: boolean, onClick: () => void) => (
		<button key={label} type="button" className={`${styles.mic} ${dev.btn}`} aria-pressed={pressed} onClick={onClick}>
			{label}
		</button>
	);
	const world = (
		<WorldStage
			agent={{ activations, mood: null }}
			colorA={theme.colorA}
			colorB={theme.colorB}
			signals={{ lines, inTalk: false, speaking, thinking: false }}
			said={speaking ? SAID : null}
			heard={null}
			persist={false}
			fixed={{
				hour: hour ?? undefined, rooms: pins ? roomsFrom(pins) : undefined, pose: poseKind === "live" ? undefined : poseKind, hits,
				life: life === "clock" ? undefined : life,
				world: worldPin, seed: big ? seed : undefined, islands: big ? islands : undefined, castle: big ? castle : undefined, grant, mood: plannerMood,
			}}
			controlRef={controlRef}
			onFrame={onFrame}
			route={route}
			onOpen={(to) => {
				setRoute(to);
				setOpened(routeHash(to));
			}}
		/>
	);
	return (
		<div className={`${styles.stage} ${font.className}`} style={stageStyle} data-tone={theme.tone} data-speaking={speaking ? "" : undefined}>
			<div className={dev.scroller}>
				<div className={dev.toolbar}>{POSES.map((p) => button(p, poseKind === p, () => setPoseKind(p)))}</div>
				<div className={dev.toolbar}>
					{PRESETS.map((p) => button(p.label, JSON.stringify(pins) === JSON.stringify(p.pins), () => setPins(p.pins)))}
					{button("Hit areas", hits, () => setHits((v) => !v))}
				</div>
				{CASTLE_ROOMS.map((room) => (
					<div key={room} className={dev.toolbar}>
						<span className={dev.room}>{room}</span>
						{FILLS.map((f) =>
							button(`${room} ${f.label}`, pins?.[room] === f.fill, () => setPins({ ...(pins ?? pinsOf(1, "locked")), [room]: f.fill })),
						)}
					</div>
				))}
				<div className={dev.toolbar}>
					{PLACES.map((p) => button(p.label, routeHash(p.route) === routeHash(route), () => setRoute(p.route)))}
					<span>
						he goes to: {placeOf(route)}
						{opened !== null && `; last opened by a click: ${opened || "Talk"}`}
					</span>
				</div>
				<div className={dev.toolbar}>
					{HOURS.map((h) => button(h.label, hour === h.hour, () => setHour(h.hour)))}
					{button("Real clock", hour === null, () => setHour(null))}
					<input
						className={dev.range}
						type="range"
						min={0}
						max={23.75}
						step={0.25}
						value={hour ?? 12}
						aria-label="Hour of the day"
						onChange={(e) => setHour(Number(e.target.value))}
					/>
					<span>{hour === null ? "real clock" : `${Math.floor(hour)}:${String((hour % 1) * 60).padStart(2, "0")}`}</span>
				</div>
				<div className={dev.toolbar}>
					{MOODS.map((m) => button(m, mood === m, () => setMood(m)))}
					{button("Message", false, () => setLines((n) => n + 1))}
					{button("Speaking", speaking, () => setSpeaking((v) => !v))}
					{button("Phone", phone, () => setPhone((v) => !v))}
				</div>
				<div className={dev.toolbar}>{LIFE.map((l) => button(l.label, life === l.mode, () => setLife(l.mode)))}</div>
				<div className={dev.toolbar}>
					<span className={dev.room}>World</span>
					{WORLDS.map((w) => button(w.label, worldPin === w.world, () => setWorldPin(w.world)))}
					<label className={dev.field}>
						Seed
						<input className={dev.num} type="number" min={0} max={SEED_MAX} step={1} value={seed} onChange={(e) => setSeed(seedOf(e.target.value))} />
					</label>
					<label className={dev.field}>
						Islands
						<select className={dev.pick} value={islands} onChange={(e) => setIslands(Number(e.target.value))}>
							{ISLAND_COUNTS.map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className={dev.toolbar}>
					<span className={dev.room}>Camera</span>
					{button("Zoom in", false, () => controlRef.current?.zoom(1))}
					{button("Zoom out", false, () => controlRef.current?.zoom(-1))}
					{button("Back to Osmo", false, () => controlRef.current?.home())}
					{button("Clear timer", false, () => {
						frames.current = [];
					})}
					<FrameReadout times={frames} />
				</div>
				<div className={dev.toolbar}>
					<span className={dev.room}>Builds</span>
					{button("Castle live", castle === "live", () => setCastle("live"))}
					{button("Castle done", castle === "done", () => setCastle("done"))}
					{button("Grant 50", false, () => setGrant({ blocks: 50, at: Date.now() }))}
					{button("Grant 450 (a three-day return)", false, () => setGrant({ blocks: 450, at: Date.now() }))}
					<span>planner mood:</span>
					{PLANNER_MOODS.map((m) => button(m, plannerMood === m, () => setPlannerMood(plannerMood === m ? undefined : m)))}
				</div>
				<p className={`${dev.note} ${dev.takes}`}>
					Live: he builds the whole castle from nothing, room by room (nothing is saved). The room rows pin each room locked or
					at 0, 50 or 100 percent; an open room that is not finished shows as a faint outline, a locked one not at all. A
					finished room with a panel (library, workshop, gate, observatory) is a button: click it, or Tab to it, and he walks
					there. Message and Speaking turn him to you; he turns back six seconds after Speaking is off. Set
					prefers-reduced-motion in devtools for still frames (no life, no blinks). The world is drawn at pixel scale 1 from 900
					px wide and 2 below; the Phone box (375 by 700) shows scale 2, easing in to 4 when he turns. Life by the clock: snow
					at night in spells (45 s in every two minutes), smoke from the chimney of the workshop once it is built (9 s in every 30),
					a flight of birds by day about every 80 s; All life now keeps them all going; with Message he faces you, breathes and
					blinks every 3 to 6 s.
				</p>
				<p className={`${dev.note} ${dev.takes}`}>
					The big world: Small is today&apos;s village and where this page starts; Big is the world of floating islands (the
					castle on the home island, then four to eight islands); Builds adds the balloon dock, his work budget and the
					planner. A new seed or island count starts that world again. Zoom in and Zoom out step the zoom about the middle of
					the view, Back to Osmo takes the camera to him, and the frame timer shows the average and the slowest of the last 60
					draws (Clear timer starts it again, so each zoom step can be read by itself). Castle done begins with the whole
					castle built. Grant puts that many blocks into his work budget at once: Grant 450 plays the time-lapse of a
					three-day return, and he is left at work. The planner mood buttons pin the mood the planner follows; press the
					same one again to let the real mood decide. The recipe preview and the planner panel below work on their own:
					they compile and plan in this page and touch nothing else.
				</p>
				{phone && <div className={dev.phone}>{world}</div>}
				<RecipePreview />
				<PlannerPanel />
			</div>
			{!phone && world}
		</div>
	);
}
