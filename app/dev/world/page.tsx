"use client";

// A dev-only view of the village: every state he can be in, every hour of the sky, the hall at 0, 50 and 100 percent
// or building live, each mood, and the phone camera. Nothing is read or saved. Not served in production.
import { type CSSProperties, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "../../assistant.module.css";
import dev from "./dev.module.css";
import { WorldStage } from "@/components/osmo/world";
import { moodTheme } from "@/lib/agent/mood-theme";
import { BASELINE, type Activations, type Emotion } from "@/lib/agent/state";
import type { ActorKind } from "@/lib/world/actor";
import { blocksOf } from "@/lib/world/blueprints";
import { HALL } from "@/lib/world/blueprints/hall";

const font = Bricolage_Grotesque({ subsets: ["latin"] });
const MOODS: (Emotion | "calm")[] = ["calm", "joy", "sadness", "fear", "anger", "love", "loneliness", "hope", "boredom"];
const POSES: (ActorKind | "live")[] = ["live", "idle", "walking", "building", "turning", "facing", "resting"];
const TOTAL = blocksOf(HALL).length;
const FILLS: { label: string; laid: number | undefined }[] = [
	{ label: "Building live", laid: undefined },
	{ label: "Hall 0%", laid: 0 },
	{ label: "Hall 50%", laid: Math.round(TOTAL / 2) },
	{ label: "Hall 100%", laid: TOTAL },
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
	const [fill, setFill] = useState(0);
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
			fixed={{ hour: hour ?? undefined, rooms: FILLS[fill].laid === undefined ? undefined : { hall: FILLS[fill].laid }, pose: poseKind === "live" ? undefined : poseKind }}
		/>
	);
	return (
		<div className={`${styles.stage} ${font.className}`} style={stageStyle} data-tone={theme.tone} data-speaking={speaking ? "" : undefined}>
			<div className={dev.scroller}>
				<div className={dev.toolbar}>{POSES.map((p) => button(p, poseKind === p, () => setPoseKind(p)))}</div>
				<div className={dev.toolbar}>{FILLS.map((f, i) => button(f.label, fill === i, () => setFill(i)))}</div>
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
					Live: he builds a local hall from nothing (nothing is saved). Message and Speaking turn him to you; he turns back six
					seconds after Speaking is off. Set prefers-reduced-motion in devtools for still frames. The world is drawn at pixel
					scale 1 from 900 px wide and 2 below; the Phone box (375 by 700) shows scale 2, coming in to 3 and 4 when he turns.
				</p>
				{phone && <div className={dev.phone}>{world}</div>}
			</div>
			{!phone && world}
		</div>
	);
}
