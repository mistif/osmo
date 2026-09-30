"use client";

// A dev-only room for Osmo's figure: every mood and state, and a reply spoken through the same
// driver as the real room (speechBeat → heart motion). Not served in production.
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "../../assistant.module.css";
import { Figure } from "@/components/osmo/figure";
import { useHeartMotion } from "@/components/osmo/use-heart-motion";
import { moodTheme } from "@/lib/agent/mood-theme";
import { charDelay, speechBeat } from "@/lib/agent/speech";
import { BASELINE, type Activations, type Emotion } from "@/lib/agent/state";
import { beatTargets, currentSentence } from "@/lib/room/heart-motion";

const font = Bricolage_Grotesque({ subsets: ["latin"] });
const LINE = "Good evening, Gur. The room is quiet, and I have been thinking about what you said yesterday.";
const MOODS: (Emotion | "calm")[] = ["calm", "joy", "sadness", "fear", "anger", "love", "loneliness", "hope"];

function feeling(mood: Emotion | "calm"): Activations {
	const a = { ...BASELINE };
	if (mood !== "calm") a[mood] = Math.min(1, BASELINE[mood] + 0.6);
	return a;
}

export default function FigurePage() {
	if (process.env.NODE_ENV === "production") notFound();
	const [mood, setMood] = useState<Emotion | "calm">("calm");
	const [listening, setListening] = useState(false);
	const [chars, setChars] = useState<number | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const heart = useHeartMotion(stageRef);
	const theme = moodTheme(feeling(mood));

	// The room's typing loop, in miniature.
	useEffect(() => {
		if (chars === null) return;
		if (chars >= LINE.length) {
			const done = setTimeout(() => {
				heart.rest();
				setChars(null);
			}, 160);
			return () => clearTimeout(done);
		}
		const beat = speechBeat(LINE[chars], LINE[chars - 1]);
		const breath = chars > 0 ? speechBeat(LINE[chars - 1], LINE[chars - 2]).pause : 0;
		const timer = setTimeout(() => {
			heart.aim(beatTargets(LINE[chars], beat, theme.strength));
			if (beat.wordStart) heart.roll();
			setChars(chars + 1);
		}, charDelay(LINE.length, theme.pulseSeconds) + breath + (chars === 0 ? 350 : 0));
		return () => clearTimeout(timer);
	}, [chars, heart, theme.strength, theme.pulseSeconds]);

	const stageStyle = {
		"--aura-a": theme.colorA,
		"--aura-b": theme.colorB,
		"--base": theme.base,
		"--pulse": `${theme.pulseSeconds.toFixed(2)}s`,
		"--strength": theme.strength.toFixed(2),
	} as CSSProperties;

	return (
		<div ref={stageRef} className={`${styles.stage} ${font.className}`} style={stageStyle}
			data-tone={theme.tone}
			data-speaking={chars !== null ? "" : undefined}
			data-listening={listening ? "" : undefined}
		>
			<div className={styles.aura} aria-hidden="true">
				<span className={`${styles.orb} ${styles.orbA}`} />
				<span className={`${styles.orb} ${styles.orbB}`} />
				<Figure className={styles.figure} said={chars === null ? currentSentence(LINE) : currentSentence(LINE.slice(0, chars))} />
			</div>
			<main className={styles.column}>
				<header className={styles.head}>
					<span className={styles.heart} aria-hidden="true" />
					<div>
						<h1 className={styles.name}>Osmo</h1>
						<p className={styles.mood}>Dev: every mood and state</p>
					</div>
				</header>
				<p style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "auto" }}>
					<select value={mood} onChange={(e) => setMood(e.target.value as Emotion | "calm")} data-testid="mood">
						{MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
					</select>
					<button type="button" className={styles.send} onClick={() => setListening((v) => !v)} aria-pressed={listening}>
						{listening ? "Stop listening" : "Listen"}
					</button>
					<button type="button" className={styles.send} onClick={() => setChars(0)} disabled={chars !== null}>
						Speak
					</button>
				</p>
			</main>
		</div>
	);
}
