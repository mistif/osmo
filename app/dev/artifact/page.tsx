"use client";

// A dev-only room for artifacts: runs a source in the same sealed frame as the real room, logs every
// event the frame sends, and can run hostile things with the source checks off. Not served in production.
import { useState } from "react";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArtifactFrame, type FrameEvent } from "@/components/osmo/artifact-frame";
import { Figure } from "@/components/osmo/figure";
import { ThingPanel } from "@/components/osmo/thing-panel";
import { useBuild } from "@/components/osmo/use-build";
import { runBuild } from "@/lib/artifacts/build-run";
import { encodeLine, type BuildLine } from "@/lib/artifacts/protocol";
import styles from "@/app/assistant.module.css";
import { COMPILE_ERROR, GOOD, HOSTILE, TRIES_FETCH } from "./fixtures";

const AURA = { a: "hsl(172 38% 50%)", b: "hsl(212 38% 50%)", bg: "#0c111b", ink: "#f3efe8" };
const SAMPLES: [string, string][] = [["Good", GOOD], ["Compile error", COMPILE_ERROR], ["Tries fetch", TRIES_FETCH], ...Object.entries(HOSTILE).map(([name, src]): [string, string] => [`Hostile: ${name}`, src])];

// A fake /api/build and /api/artifacts: the fixture source goes through the real protocol reader and the real runner,
// a few characters at a time, so the outline draws in the way it will in the room.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let fakeSaves = 0;
function fakeFetch(lines: BuildLine[], gap: number, signal: AbortSignal): typeof fetch {
	return (async (url: string | URL | Request) => {
		if (String(url) === "/api/artifacts") return new Response(JSON.stringify({ id: `dev-${++fakeSaves}`, version: 1, title: "Tip splitter" }), { status: 200, headers: { "content-type": "application/json" } });
		const enc = new TextEncoder();
		let i = 0;
		return new Response(
			new ReadableStream<Uint8Array>({
				async pull(c) {
					await sleep(gap);
					if (signal.aborted) return c.error(new Error("aborted"));
					if (i < lines.length) c.enqueue(enc.encode(encodeLine(lines[i++])));
					else c.close();
				},
			}),
			{ status: 200 },
		);
	}) as typeof fetch;
}
const pieces = (source: string, size: number): BuildLine[] => {
	const out: BuildLine[] = [];
	for (let at = 0; at < source.length; at += size) out.push({ t: "delta", s: source.slice(at, at + size) });
	return out;
};
let script: { lines: BuildLine[]; gap: number } = { lines: [], gap: 100 };
async function fakeRun(ticket: { brief: string; actionId: number | null }, onView: Parameters<typeof runBuild>[2], signal: AbortSignal) {
	const compile = await import("@/lib/artifacts/compile");
	await runBuild(ticket, { fetch: fakeFetch(script.lines, script.gap, signal), token: async () => "dev", clean: compile.cleanOutput, compile: (src) => compile.compileSource(src) }, onView, signal);
}

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
	const build = useBuild({ run: fakeRun, remove: async () => true });
	const [aside, setAside] = useState(false);
	const stageVars = {
		"--aura-a": AURA.a,
		"--aura-b": AURA.b,
		"--base": AURA.bg,
		"--pulse": "3.2s",
		"--strength": "0.5",
		...(build.view?.phase === "building" ? { "--build-progress": build.view.progress.toFixed(3) } : build.built ? { "--build-progress": "1" } : {}),
	} as CSSProperties;
	const buildFake = (lines: BuildLine[], gap = 100) => {
		script = { lines, gap };
		build.start({ brief: "a tip splitter", actionId: null });
	};

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
			<h2 style={{ fontSize: 16, marginTop: 24 }}>The thing panel, on the room&apos;s own stage</h2>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0", alignItems: "center" }}>
				<button onClick={() => buildFake([...pieces(GOOD, 24), { t: "done", tokens: 400 }])}>Build (fake stream)</button>
				<button onClick={() => buildFake([...pieces(GOOD, 24), { t: "done", tokens: 400 }], 20)}>Build (fast)</button>
				<button onClick={() => buildFake([{ t: "delta", s: "// title: Broken\n" }, { t: "error", code: "too_big" }], 200)}>Build (too big)</button>
				<button onClick={() => buildFake([...pieces(COMPILE_ERROR, 20), { t: "done", tokens: 10 }], 150)}>Build (does not compile)</button>
				<button onClick={build.cancel}>Cancel</button>
				<button onClick={() => build.show("dev-open", "Tip splitter", GOOD)}>Open a saved one</button>
				<label>
					<input type="checkbox" checked={aside} onChange={(e) => setAside(e.target.checked)} /> A panel is open
				</label>
			</div>
			<div
				className={styles.stage}
				style={{ ...stageVars, height: "34rem", borderRadius: 16, margin: "0 -16px" }}
				data-building={build.view?.phase === "building" ? "" : undefined}
				data-built={build.built ? "" : undefined}
			>
				<div className={styles.aura} aria-hidden="true">
					<span className={`${styles.orb} ${styles.orbA}`} />
					<span className={`${styles.orb} ${styles.orbB}`} />
					<Figure className={styles.figure} said={null} heard={null} />
				</div>
				<main className={styles.column} style={{ justifyContent: "flex-end", paddingBottom: "1rem" }}>
					<ThingPanel build={build} aura={AURA} hidden={aside} />
				</main>
			</div>
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
