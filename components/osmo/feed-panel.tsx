"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { localDay } from "@/lib/agent/bond/bond";
import { spokenDate } from "@/lib/agent/bond/lines";
import { dayName, strongestPhrase, weekSeries, type MoodDay } from "@/lib/agent/mood-days";
import type { ThingRow } from "@/lib/artifacts/things";
import { forgetRow, openThingSource, readActions, readMoods, readMoodWeek, readReminders, readThings } from "@/lib/shell/data";
import { buildFeed, resolveZone, type FeedInput, type ForgetTarget } from "@/lib/shell/feed";
import { loadProfileRow } from "@/lib/shell/profile-client";
import { dueLine } from "@/lib/shell/reminders-notes";
import { ForgetButtons } from "./forget-buttons";
import feed from "./feed.module.css";
import insights from "./insights.module.css";
import panels from "./panels.module.css";
import shell from "./shell.module.css";

const UNREACHABLE = "I cannot reach my memory right now. Try again in a moment.";
const FORGET_FAILED = "I could not forget that. Try again.";
const OPEN_FAILED = "I could not open that. Try again.";
const PAGE = 30;
const DAY = 24 * 60 * 60 * 1000;

type Loaded = FeedInput & { week: MoodDay[]; firstDay: string | null; zone: string };

// What leaves the page when a row is forgotten, by the table it lives in.
function without(data: Loaded, target: ForgetTarget): Loaded {
	switch (target.table) {
		case "actions":
			return { ...data, actions: data.actions.filter((a) => a.id !== target.key) };
		case "reminders":
			return { ...data, reminders: data.reminders.filter((r) => r.id !== target.key) };
		case "mood_days":
			return { ...data, moods: data.moods.filter((m) => m.day !== target.key), week: data.week.filter((m) => m.day !== target.key) };
		case "artifacts":
			return { ...data, things: data.things.filter((t) => t.id !== target.key) };
	}
}

export function FeedPanel({ onOpenThing }: { onOpenThing(id: string, title: string, source: string): void }) {
	const [data, setData] = useState<Loaded | null>(null);
	const [failed, setFailed] = useState(false);
	const [limit, setLimit] = useState(PAGE);
	const [selected, setSelected] = useState<string | null>(null);
	// A row key, "up-<id>" for a coming-up reminder, or "all": one row asks at a time.
	const [confirming, setConfirming] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	// Read once at mount, not live at render, so render stays pure (no Date.now() call there).
	const [now] = useState(() => Date.now());
	const today = localDay(now);

	useEffect(() => {
		let alive = true;
		async function load() {
			const since = weekSeries([], localDay(Date.now()))[0].day;
			const [actions, reminders, moods, things, week, profile] = await Promise.all([
				readActions(new Date(Date.now() - 30 * DAY).toISOString()),
				readReminders(),
				readMoods("2000-01-01"),
				readThings(),
				readMoodWeek(since),
				loadProfileRow(supabase),
			]);
			if (!alive) return;
			setFailed(actions.failed || reminders.failed || moods.failed || things.failed || week.failed);
			setData({
				actions: actions.rows,
				reminders: reminders.rows,
				moods: moods.rows,
				things: things.rows,
				week: week.rows,
				firstDay: week.firstDay,
				zone: resolveZone(profile !== "error" ? profile.timezone : null, Intl.DateTimeFormat().resolvedOptions().timeZone),
			});
		}
		void load();
		return () => {
			alive = false;
		};
	}, []);

	const built = useMemo(
		() => (data ? buildFeed({ actions: data.actions, reminders: data.reminders, moods: data.moods, things: data.things }, { zone: data.zone, now, limit }) : null),
		[data, now, limit],
	);

	async function forget(target: ForgetTarget) {
		setConfirming(null);
		if (!data) return;
		const before = data;
		setData(without(data, target));
		if (await forgetRow(target.table, target.key)) setProblem(null);
		else {
			setData(before);
			setProblem(FORGET_FAILED);
		}
	}

	async function forgetAll() {
		setConfirming(null);
		if (!data) return;
		const before = data;
		setData({ ...data, actions: [] });
		// RLS limits this to the signed-in user's rows.
		const { error } = await supabase.from("actions").delete().gt("id", 0);
		if (error) {
			setData(before);
			setProblem(FORGET_FAILED);
		} else setProblem(null);
	}

	async function openThing(thing: ThingRow | undefined) {
		if (!thing) return;
		const source = await openThingSource(thing.id);
		if (source === null) setProblem(OPEN_FAILED);
		else {
			setProblem(null);
			onOpenThing(thing.id, thing.title, source);
		}
	}

	const series = weekSeries(data?.week ?? [], today);
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
		data === null || failed
			? null
			: data.firstDay === null
				? "I will start keeping track of how I feel from today."
				: data.firstDay > series[0].day
					? `I started keeping track on ${spokenDate(`${data.firstDay}T12:00:00`, now)}.`
					: null;

	return (
		<>
			<section className={panels.section}>
				<h3 className={panels.sectionTitle}>My mood, the last 7 days</h3>
				<svg className={insights.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="How positive I felt each day this week">
					<line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="2 4" />
					{segments.map((points) => (
						<polyline
							key={points}
							className={feed.draw}
							pathLength={1}
							points={points}
							fill="none"
							stroke="var(--aura-a)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							vectorEffect="non-scaling-stroke"
						/>
					))}
					{series.map((d, i) =>
						// A zero-length round-capped line stays a true circle under preserveAspectRatio="none"; a <circle> would stretch into an oval.
						d.valence === null ? null : <line key={d.day} x1={x(i)} y1={y(d.valence)} x2={x(i)} y2={y(d.valence)} stroke="var(--aura-b)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />,
					)}
				</svg>
				<div className={insights.days}>
					{series.map((d) => (
						<button key={d.day} type="button" className={insights.day} aria-pressed={selected === d.day} onClick={() => setSelected(selected === d.day ? null : d.day)}>
							{dayName(d.day).slice(0, 3)}
						</button>
					))}
				</div>
				{chosen && (
					<p className={panels.note} role="status">
						{chosen.strongest ? `${dayName(chosen.day)}: ${strongestPhrase(chosen.strongest)}.` : `${dayName(chosen.day)}: we did not talk.`}
					</p>
				)}
				{started && <p className={panels.note}>{started}</p>}
			</section>

			{built && built.comingUp.length > 0 && (
				<section className={panels.section}>
					<h3 className={panels.sectionTitle}>Coming up</h3>
					{built.comingUp.map((r) => (
						<div key={r.id} className={panels.line}>
							<div>
								<span>{r.text}</span>
								<span className={`${shell.meta} ${shell.state}`}>{dueLine(r.due, now)}</span>
							</div>
							<div className={panels.actions}>
								<ForgetButtons label={r.text} confirming={confirming === `up-${r.id}`} onAsk={() => setConfirming(`up-${r.id}`)} onKeep={() => setConfirming(null)} onForget={() => void forget(r.forget)} />
							</div>
						</div>
					))}
				</section>
			)}

			{built?.days.map((day) => (
				<section key={day.day} className={feed.day}>
					<h3 className={shell.h3}>{day.heading}</h3>
					<ul className={feed.days}>
						{day.rows.map((row) => {
							const thing = row.thingId ? data?.things.find((t) => t.id === row.thingId) : undefined;
							return (
								<li key={row.key} className={feed.row}>
									<div className={panels.line}>
										<span>{row.text}</span>
										<div className={panels.actions}>
											{row.source === "build" && thing && (
												<button type="button" className={panels.action} aria-label={`Open ${thing.title}`} onClick={() => void openThing(thing)}>
													Open
												</button>
											)}
											<ForgetButtons label={row.text} confirming={confirming === row.key} onAsk={() => setConfirming(row.key)} onKeep={() => setConfirming(null)} onForget={() => void forget(row.forget)} />
										</div>
									</div>
									{confirming === row.key && row.forget.warn && <p className={panels.note}>{row.forget.warn}</p>}
								</li>
							);
						})}
					</ul>
				</section>
			))}

			{built && built.days.length === 0 && !failed && (
				<p className={panels.empty}>Nothing has happened yet that I can show. When I do something for you, it will appear here.</p>
			)}
			{built?.more && (
				<button type="button" className={panels.action} onClick={() => setLimit((n) => n + PAGE)}>
					Show more
				</button>
			)}
			{data === null && !failed && <p className={panels.note}>Checking what happened...</p>}

			{data !== null && (data.actions.length > 0 || built?.days.length) ? <p className={panels.note}>Forgetting a line does not undo what was done.</p> : null}
			{data !== null && data.actions.length > 0 && (
				<div className={panels.actions}>
					{confirming === "all" ? (
						<>
							<button type="button" className={panels.action} autoFocus onClick={() => void forgetAll()}>
								Forget all of what I did
							</button>
							<button type="button" className={panels.action} onClick={() => setConfirming(null)}>
								Keep
							</button>
						</>
					) : (
						<button type="button" className={panels.action} aria-label="Forget all of what I did" onClick={() => setConfirming("all")}>
							Forget all
						</button>
					)}
				</div>
			)}
			{failed && <p className={panels.error} role="alert">{UNREACHABLE}</p>}
			{problem && <p className={panels.error} role="alert">{problem}</p>}
		</>
	);
}
