"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { localDay } from "@/lib/agent/bond/bond";
import { characterLines } from "@/lib/agent/character";
import { spokenDate } from "@/lib/agent/bond/lines";
import { dayName, sanitizeMoodDay, strongestPhrase, weekSeries, type MoodDay } from "@/lib/agent/mood-days";
import type { AgentState } from "@/lib/agent/state";
import { storyLines } from "@/lib/shell/story";
import { ThingsMade } from "./things-made";
import { describeAction, sanitizeActionRow, type ActionRow } from "@/lib/shell/what-i-did";
import panel from "./panels.module.css";
import styles from "./insights.module.css";

const UNREACHABLE = "I cannot reach my memory right now. Try again in a moment.";
const FORGET_FAILED = "I could not forget that. Try again.";

export function InsightsPanel({ agent, onOpenThing }: { agent: AgentState; onOpenThing(id: string, title: string, source: string): void }) {
	const [rows, setRows] = useState<MoodDay[] | null>(null);
	const [firstDay, setFirstDay] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [did, setDid] = useState<ActionRow[] | null>(null);
	const [didError, setDidError] = useState<string | null>(null);
	// A row id, or "all": the one-step inline confirm, as in the memory panel.
	const [confirming, setConfirming] = useState<number | "all" | null>(null);
	// Read once at mount, not live at render, so render stays pure (no Date.now() call there).
	const [now] = useState(() => Date.now());
	const today = localDay(now);

	useEffect(() => {
		(async () => {
			const log = await supabase.from("actions").select("id,at,surface,status,summary").order("at", { ascending: false }).limit(30);
			if (log.error) {
				setDidError(UNREACHABLE);
				setDid([]);
			} else setDid((log.data ?? []).map(sanitizeActionRow).filter((r): r is ActionRow => r !== null));
		})();
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
				? "I will start keeping track of how I feel from today."
				: firstDay > series[0].day
					? `I started keeping track on ${spokenDate(`${firstDay}T12:00:00`, now)}.`
					: null;
	const story = storyLines(agent.bond, now);

	async function forget(id: number) {
		const removed = did?.find((r) => r.id === id);
		setConfirming(null);
		setDid((cur) => (cur ? cur.filter((r) => r.id !== id) : cur));
		const { error: failed } = await supabase.from("actions").delete().eq("id", id);
		if (failed) {
			if (removed) setDid((cur) => (cur && !cur.some((r) => r.id === id) ? [...cur, removed].sort((a, b) => b.at.localeCompare(a.at)) : cur));
			setDidError(FORGET_FAILED);
		} else setDidError(null);
	}

	async function forgetAll() {
		const removed = did ?? [];
		setConfirming(null);
		setDid([]);
		// RLS limits this to the signed-in user's rows.
		const { error: failed } = await supabase.from("actions").delete().gt("id", 0);
		if (failed) {
			setDid(removed);
			setDidError(FORGET_FAILED);
		} else setDidError(null);
	}

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
						// A zero-length round-capped line stays a true circle under preserveAspectRatio="none"; a <circle> would stretch into an oval.
						d.valence === null ? null : (
							<line key={d.day} x1={x(i)} y1={y(d.valence)} x2={x(i)} y2={y(d.valence)}
								stroke="var(--aura-b)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
						),
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
							: `${dayName(chosen.day)}: we did not talk.`}
					</p>
				)}
				{started && <p className={panel.note}>{started}</p>}
				{error && <p className={panel.error} role="alert">{error}</p>}
			</section>

			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>What I did</h3>
				{did !== null && did.length === 0 ? (
					!didError && <p className={panel.note}>Nothing yet.</p>
				) : (
					<ul className={styles.did}>
						{(did ?? []).map((r) => (
							<li key={r.id} className={panel.line}>
								<span>{describeAction(r, now)}</span>
								<div className={panel.actions}>
									{confirming === r.id ? (
										<>
											<button type="button" className={panel.action} autoFocus onClick={() => void forget(r.id)}>
												Forget this
											</button>
											<button type="button" className={panel.action} onClick={() => setConfirming(null)}>
												Keep
											</button>
										</>
									) : (
										<button type="button" className={panel.action} aria-label={`Forget: ${describeAction(r, now)}`}
											onClick={() => setConfirming(r.id)}>
											Forget
										</button>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
				{did !== null && did.length > 0 && (
					<>
						<div className={panel.actions}>
							{confirming === "all" ? (
								<>
									<button type="button" className={panel.action} autoFocus onClick={() => void forgetAll()}>
										Forget all of it
									</button>
									<button type="button" className={panel.action} onClick={() => setConfirming(null)}>
										Keep
									</button>
								</>
							) : (
								<button type="button" className={panel.action} onClick={() => setConfirming("all")}>
									Forget all
								</button>
							)}
						</div>
						<p className={panel.note}>Forgetting a line does not undo what was done.</p>
					</>
				)}
				{didError && <p className={panel.error} role="alert">{didError}</p>}
			</section>

			<ThingsMade onOpen={onOpenThing} />

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
				<h3 className={panel.sectionTitle}>Who I am</h3>
				{characterLines().map((text) => (
					<p key={text} className={panel.line}>{text}</p>
				))}
			</section>
		</>
	);
}
