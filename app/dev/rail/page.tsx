"use client";

// A dev-only room for the shell rail: every item and every state side by side. Not served in production.
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "../../assistant.module.css";
import dev from "./dev.module.css";
import { Rail } from "@/components/osmo/rail";
import { moodTheme } from "@/lib/agent/mood-theme";
import { BASELINE, type Activations, type Emotion } from "@/lib/agent/state";
import { railItems, type RailId } from "@/lib/shell/rail";

const font = Bricolage_Grotesque({ subsets: ["latin"] });
const MOODS: (Emotion | "calm")[] = ["calm", "joy", "sadness", "fear", "anger", "love", "loneliness", "hope"];
const ALL: RailId[] = ["talk", "ideas", "goals", "library", "feed", "search", "settings"];
const PANELS = ALL.filter((id) => id !== "talk") as Exclude<RailId, "talk">[];
const FILLS = [0, 70, 100];

function feeling(mood: Emotion | "calm"): Activations {
	const a = { ...BASELINE };
	if (mood !== "calm") a[mood] = Math.min(1, BASELINE[mood] + 0.6);
	return a;
}

const noRef = () => () => {};
const noNav = () => {};

function Sample({ title, items, fill, play }: { title: string; items: ReturnType<typeof railItems>; fill?: number; play?: boolean }) {
	return (
		<section className={dev.panel}>
			<h2>{title}</h2>
			<div className={dev.box}>
				<Rail items={items} fill={fill} play={play} onNavigate={noNav} linkRef={noRef} />
			</div>
		</section>
	);
}

export default function RailPage() {
	if (process.env.NODE_ENV === "production") notFound();
	const [mood, setMood] = useState<Emotion | "calm">("calm");
	const [voice, setVoice] = useState<"idle" | "speaking" | "quiet">("idle");
	const [play, setPlay] = useState(true);
	const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => { if (replayTimer.current) clearTimeout(replayTimer.current); }, []);
	const theme = moodTheme(feeling(mood));

	const replay = () => {
		setPlay(false);
		if (replayTimer.current) clearTimeout(replayTimer.current);
		replayTimer.current = setTimeout(() => setPlay(true), 60);
	};

	const stageStyle = {
		"--aura-a": theme.colorA,
		"--aura-b": theme.colorB,
		"--base": theme.base,
		"--pulse": `${theme.pulseSeconds.toFixed(2)}s`,
		"--strength": theme.strength.toFixed(2),
		...(voice === "speaking" ? { "--voice": 0.8 } : voice === "quiet" ? { "--voice": 0 } : {}),
	} as CSSProperties;

	return (
		<div className={`${styles.stage} ${font.className}`} style={stageStyle}
			data-shell=""
			data-tone={theme.tone}
			data-speaking={voice === "speaking" ? "" : undefined}
		>
			<div className={dev.scroller}>
				<h1 className={styles.name}>Osmo rail</h1>
				<div className={dev.toolbar}>
					<select value={mood} onChange={(e) => setMood(e.target.value as Emotion | "calm")} data-testid="mood" aria-label="Mood">
						{MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
					</select>
					<button type="button" className={`${styles.mic} ${dev.btn}`} aria-pressed={voice === "speaking"} onClick={() => setVoice((v) => (v === "speaking" ? "idle" : "speaking"))}>
						Speaking
					</button>
					<button type="button" className={`${styles.mic} ${dev.btn}`} aria-pressed={voice === "quiet"} onClick={() => setVoice((v) => (v === "quiet" ? "idle" : "quiet"))}>
						Quiet
					</button>
					<button type="button" className={`${styles.mic} ${dev.btn}`} onClick={replay}>
						Replay
					</button>
				</div>
				<div className={dev.panels}>
					<Sample title="Rest state, Talk active" items={railItems({ panel: null }, {}, ALL)} />
					{PANELS.map((id) => (
						<Sample key={id} title={`${id} active`} items={railItems({ panel: id }, {}, ALL)} />
					))}
					<Sample title="All dots on" items={railItems({ panel: null }, { library: true, goals: true }, ALL)} />
					<Sample title="Every motion at once" items={railItems({ panel: null }, {}, ALL)} play={play} />
					{FILLS.map((f) => (
						<Sample key={f} title={`Goals ring at ${f}`} items={railItems({ panel: "goals" }, {}, ALL)} fill={f} />
					))}
				</div>
				<p className={dev.note}>Resize to 375 px for the bar; set prefers-reduced-motion in devtools for the static end states.</p>
			</div>
		</div>
	);
}
