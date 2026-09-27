"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { localDay } from "@/lib/agent/bond/bond";
import { spokenDate } from "@/lib/agent/bond/lines";
import { dayName, sanitizeMoodDay, strongestPhrase, weekSeries, type MoodDay } from "@/lib/agent/mood-days";
import { resolve } from "@/lib/agent/personality/assemble";
import type { AgentState } from "@/lib/agent/state";
import { madeFromLines, storyLines } from "@/lib/shell/story";
import panel from "./panels.module.css";
import styles from "./insights.module.css";

const UNREACHABLE = "I can't reach my memory right now. Try again in a moment.";

export function InsightsPanel({ agent }: { agent: AgentState }) {
	const [rows, setRows] = useState<MoodDay[] | null>(null);
	const [firstDay, setFirstDay] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	// Read once at mount, not live at render, so render stays pure (no Date.now() call there).
	const [now] = useState(() => Date.now());
	const today = localDay(now);

	useEffect(() => {
		(async () => {
			const since = weekSeries([], localDay(Date.now()))[0].day;
			const [week, first] = await Promise.all([
				supabase.from("mood_days").select("day,valence,strongest,tally,samples").gte("day", since).order("day"),
				supabase.from("mood_days").select("day").order("day").limit(1).maybeSingle(),
			]);
			if (week.error || first.error) {
				setError(UNREACHABLE);
				setRows([]);
				return;
			}
			setRows((week.data ?? []).map(sanitizeMoodDay).filter((r): r is MoodDay => r !== null));
			setFirstDay(typeof first.data?.day === "string" ? first.data.day : null);
		})();
	}, []);

	const series = weekSeries(rows ?? [], today);
	const width = 280;
	const height = 80;
	const x = (i: number) => (i / 6) * width;
	const y = (v: number) => ((1 - v) / 2) * height;
	// Days without data break the line instead of dropping to zero.
	const segments: string[] = [];
	let current: string[] = [];
	series.forEach((d, i) => {
		if (d.valence === null) {
			if (current.length) segments.push(current.join(" "));
			current = [];
		} else current.push(`${x(i).toFixed(1)},${y(d.valence).toFixed(1)}`);
	});
	if (current.length) segments.push(current.join(" "));

	const chosen = series.find((d) => d.day === selected);
	const started =
		rows === null || error
			? null
			: firstDay === null
				? "I'll start keeping track of how I feel from today."
				: firstDay > series[0].day
					? `I started keeping track on ${spokenDate(`${firstDay}T12:00:00`, now)}.`
					: null;
	const story = storyLines(agent.bond, now);

	return (
		<>
			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>My mood, the last 7 days</h3>
				<svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
					aria-label="How positive I felt each day this week">
					<line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="2 4" />
					{segments.map((points) => (
						<polyline key={points} points={points} fill="none" stroke="var(--aura-a)" strokeWidth="2"
							strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
					))}
					{series.map((d, i) =>
						d.valence === null ? null : <circle key={d.day} cx={x(i)} cy={y(d.valence)} r="2.5" fill="var(--aura-b)" />,
					)}
				</svg>
				<div className={styles.days}>
					{series.map((d) => (
						<button key={d.day} type="button" className={styles.day} aria-pressed={selected === d.day}
							onClick={() => setSelected(selected === d.day ? null : d.day)}>
							{dayName(d.day).slice(0, 3)}
						</button>
					))}
				</div>
				{chosen && (
					<p className={panel.note} role="status">
						{chosen.strongest
							? `${dayName(chosen.day)}: ${strongestPhrase(chosen.strongest)}.`
							: `${dayName(chosen.day)}: we didn't talk.`}
					</p>
				)}
				{started && <p className={panel.note}>{started}</p>}
				{error && <p className={panel.error} role="alert">{error}</p>}
			</section>

			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>Our story</h3>
				{story.length === 0 ? (
					<p className={panel.note}>Our story starts with your first message.</p>
				) : (
					<ol className={styles.story}>
						{story.map((m) => (
							<li key={m.id} className={styles.moment}>
								<span className={styles.when}>{m.date}</span>
								{m.text}
							</li>
						))}
					</ol>
				)}
			</section>

			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>What I&apos;m made from</h3>
				{madeFromLines(resolve(agent.genome).names).map((text) => (
					<p key={text} className={panel.line}>{text}</p>
				))}
			</section>
		</>
	);
}
