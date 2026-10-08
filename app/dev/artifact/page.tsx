"use client";

// A dev-only room for artifacts: runs a source in the same sealed frame as the real room, logs every
// event the frame sends, and can run hostile things with the source checks off. Not served in production.
import { useState } from "react";
import { notFound } from "next/navigation";
import { ArtifactFrame, type FrameEvent } from "@/components/osmo/artifact-frame";
import { COMPILE_ERROR, GOOD, HOSTILE, TRIES_FETCH } from "./fixtures";

const AURA = { a: "hsl(172 38% 50%)", b: "hsl(212 38% 50%)", bg: "#0c111b", ink: "#f3efe8" };
const SAMPLES: [string, string][] = [["Good", GOOD], ["Compile error", COMPILE_ERROR], ["Tries fetch", TRIES_FETCH], ...Object.entries(HOSTILE).map(([name, src]): [string, string] => [`Hostile: ${name}`, src])];

const line = (e: FrameEvent) => {
	switch (e.type) {
		case "ready":
			return "ready";
		case "height":
			return `height: ${e.px}`;
		case "left-frame":
			return "left-frame";
		default:
			return `${e.type}: ${e.text}`;
	}
};

export default function ArtifactPage() {
	if (process.env.NODE_ENV === "production") notFound();
	const [text, setText] = useState(GOOD);
	const [running, setRunning] = useState<{ source: string; run: number } | null>(null);
	const [skip, setSkip] = useState(false);
	const [events, setEvents] = useState<string[]>([]);

	const run = (source: string) => {
		setEvents([]);
		setRunning((r) => ({ source, run: (r?.run ?? 0) + 1 }));
	};
	const pick = (source: string) => {
		setText(source);
		run(source);
	};

	return (
		<main style={{ maxWidth: 720, margin: "0 auto", padding: 16, background: "#0c111b", color: "#f3efe8", minHeight: "100vh", font: "14px/1.4 system-ui, sans-serif" }}>
			<h1 style={{ fontSize: 18 }}>Artifact frame (dev only)</h1>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
				{SAMPLES.map(([name, src]) => (
					<button key={name} onClick={() => pick(src)}>{name}</button>
				))}
			</div>
			<textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={12} style={{ width: "100%", boxSizing: "border-box", font: "12px/1.4 ui-monospace, monospace" }} />
			<div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0" }}>
				<button onClick={() => run(text)}>Run</button>
				<label>
					<input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Skip checks (dev only)
				</label>
			</div>
			<pre style={{ minHeight: 120, maxHeight: 200, overflow: "auto", margin: "8px 0", padding: 8, border: "1px solid #345", fontSize: 12 }}>{events.length ? events.join("\n") : "No events yet."}</pre>
			{running && (
				<ArtifactFrame
					key={running.run}
					source={running.source}
					aura={AURA}
					skipChecks={skip}
					onEvent={(e) => setEvents((prev) => [...prev.slice(-19), line(e)])}
				/>
			)}
		</main>
	);
}
