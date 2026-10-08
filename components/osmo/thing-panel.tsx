"use client";
import { type CSSProperties, useEffect, useState } from "react";
import { ArtifactFrame, type FrameEvent } from "./artifact-frame";
import type { BuildHandle } from "./use-build";
import type { Aura } from "@/lib/artifacts/frame";
import { LINES } from "@/lib/artifacts/lines";
import styles from "./thing.module.css";

// Twelve strokes of a small page: a frame, a heading, rows, a button, a footer. Slot i draws in when --build-blocks passes i.
const SLOTS = [
	"M12 6h216a8 8 0 0 1 8 8v132a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8z",
	"M20 24h92",
	"M20 36h138",
	"M20 48h200",
	"M20 62h176",
	"M20 74h148",
	"M20 86h164",
	"M20 98h104v14H20z",
	"M138 98h82v14h-82z",
	"M20 122h54a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H20z",
	"M84 122h40v14H84z",
	"M20 144h110",
];

// Reads --build-blocks and --build-progress from the panel and the stage above it.
function Sketch() {
	return (
		<div className={styles.sketch} aria-hidden="true">
			<svg viewBox="0 0 240 160">
				{SLOTS.map((d, i) => (
					<path key={i} d={d} pathLength={1} className={styles.slot} style={{ "--i": i } as CSSProperties} />
				))}
			</svg>
			<div className={styles.wash} />
			<div className={styles.sweep} />
		</div>
	);
}

type Props = {
	build: BuildHandle;
	aura: Aura;
	// True while Memory, Insights or Settings is open: the thing steps aside to a chip with its title.
	hidden: boolean;
};

export function ThingPanel({ build, aura, hidden }: Props) {
	const { view, origin, notice, built } = build;
	const [problem, setProblem] = useState<{ id: string; line: string } | null>(null);
	const [keptId, setKeptId] = useState<string | null>(null);
	const [fullId, setFullId] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const readyId = view?.phase === "ready" ? view.id : null;
	const full = readyId !== null && fullId === readyId && !hidden;
	useEffect(() => {
		if (!full) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setFullId(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [full]);

	// What a screen reader hears, from the start of the build to its end. The region stays mounted so the change is announced.
	const spoken = view === null ? "" : view.phase === "building" ? "Building" : view.phase === "ready" ? (built ? `Finished: ${view.title}` : "") : view.line;
	const status = (
		<p className={styles.sr} role="status">
			{spoken}
		</p>
	);

	if (view === null) {
		return (
			<>
				{status}
				{notice && <p className={styles.floating}>{notice}</p>}
			</>
		);
	}

	const title = view.phase === "building" ? (view.title ?? "Building") : view.phase === "ready" ? view.title : "Not finished";
	if (hidden) {
		return (
			<div className={styles.chipSlot} data-thing-state={view.phase}>
				{status}
				<span className={styles.chip}>{title}</span>
			</div>
		);
	}

	const showProblem = view.phase === "ready" && problem !== null && problem.id === view.id ? problem.line : null;
	const onEvent = (e: FrameEvent) => {
		if (view.phase !== "ready") return;
		if (e.type === "error" || e.type === "left-frame") setProblem({ id: view.id, line: LINES.runtime });
		else if (e.type === "compile-error") setProblem({ id: view.id, line: LINES.compile });
	};
	const blocks = view.phase === "building" ? view.blocks : built ? SLOTS.length : 0;
	const kept = view.phase === "ready" && keptId === view.id;
	const canDecide = view.phase === "ready" && origin === "built" && !kept;
	const canDelete = view.phase === "ready" && origin === "opened";

	const actions = view.phase === "ready" && (
		<div className={styles.bar}>
			{canDecide && (
				<>
					<button type="button" className={styles.tool} onClick={() => setKeptId(view.id)}>
						Keep
					</button>
					<button type="button" className={styles.tool} onClick={() => void build.discard()}>
						Discard
					</button>
				</>
			)}
			{canDelete &&
				(confirmId === view.id ? (
					<>
						<button type="button" className={styles.tool} autoFocus onClick={() => void build.discard()}>
							Delete it
						</button>
						<button type="button" className={styles.tool} onClick={() => setConfirmId(null)}>
							Cancel
						</button>
					</>
				) : (
					<button type="button" className={styles.tool} onClick={() => setConfirmId(view.id)}>
						Delete
					</button>
				))}
		</div>
	);

	return (
		<>
			{status}
			<section
				className={styles.panel}
				data-thing-state={view.phase}
				aria-busy={view.phase === "building"}
				aria-label={view.phase === "building" ? "Something Osmo is making" : "Something Osmo made"}
				style={{ "--build-blocks": blocks } as CSSProperties}
			>
				<div className={styles.head}>
					<h2 className={styles.title}>{title}</h2>
					{view.phase === "ready" && !showProblem && (
						<button type="button" className={styles.tool} aria-label="Open full screen" onClick={() => setFullId(view.id)}>
							Full screen
						</button>
					)}
					{view.phase !== "building" && (
						<button type="button" className={styles.tool} onClick={build.close}>
							Close
						</button>
					)}
				</div>

				{view.phase === "building" && (
					<>
						<Sketch />
						<progress className={styles.progress} value={view.progress} max={1} aria-label="Progress" />
					</>
				)}
				{view.phase === "failed" && <p className={styles.note}>{view.line}</p>}
				{view.phase === "ready" && (
					<div className={styles.frameWrap}>
						{showProblem ? <p className={styles.note}>{showProblem}</p> : <ArtifactFrame source={view.source} aura={aura} onEvent={onEvent} />}
						{built && !showProblem && (
							<div className={styles.dissolve} aria-hidden="true">
								<Sketch />
							</div>
						)}
						{!showProblem && <button type="button" className={styles.tap} aria-label="Open full screen" onClick={() => setFullId(view.id)} />}
					</div>
				)}
				{actions}
				{notice && <p className={styles.note}>{notice}</p>}
			</section>

			{full && view.phase === "ready" && (
				<div className={styles.overlay} role="dialog" aria-modal="true" aria-label={view.title}>
					<div className={styles.head}>
						<h2 className={styles.title}>{view.title}</h2>
						<button type="button" className={styles.tool} autoFocus onClick={() => setFullId(null)}>
							Close
						</button>
					</div>
					<div className={styles.overlayBody}>
						{showProblem ? <p className={styles.note}>{showProblem}</p> : <ArtifactFrame source={view.source} aura={aura} onEvent={onEvent} />}
					</div>
					{actions}
				</div>
			)}
		</>
	);
}
