"use client";

// A dev-only view of the village: every state he can be in, every hour of the sky, each room locked or at 0, 50 and
// 100 percent (the faint outlines show at 0 and 50), the castle building live, the room hit areas, walking to each
// panel's room, each mood, and the phone camera. Nothing is read or saved. Not served in production.
import { type CSSProperties, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "../../assistant.module.css";
import dev from "./dev.module.css";
import { WorldStage } from "@/components/osmo/world";
import { moodTheme } from "@/lib/agent/mood-theme";
import { BASELINE, type Activations, type Emotion } from "@/lib/agent/state";
import { routeHash, type Route } from "@/lib/shell/route";
import type { ActorKind } from "@/lib/world/actor";
import { CASTLE_BLOCKS } from "@/lib/world/blueprints/castle";
import { CASTLE_ROOMS, type CastleRoom } from "@/lib/world/blueprints/types";
import { placeOf } from "@/lib/world/rooms";

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
			fixed={{ hour: hour ?? undefined, rooms: pins ? roomsFrom(pins) : undefined, pose: poseKind === "live" ? undefined : poseKind, hits }}
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
				<p className={dev.note}>
					Live: he builds the whole castle from nothing, room by room (nothing is saved). The room rows pin each room locked or
					at 0, 50 or 100 percent; an open room that is not finished shows as a faint outline, a locked one not at all. A
					finished room with a panel (library, workshop, gate, observatory) is a button: click it, or Tab to it, and he walks
					there. Message and Speaking turn him to you; he turns back six seconds after Speaking is off. Set
					prefers-reduced-motion in devtools for still frames. The world is drawn at pixel scale 1 from 900 px wide and 2 below;
					the Phone box (375 by 700) shows scale 2, coming in to 3 and 4 when he turns.
				</p>
				{phone && <div className={dev.phone}>{world}</div>}
			</div>
			{!phone && world}
		</div>
	);
}
