// The room's side of one build: stream, compile, repair once, save. Spec 3. No React, no DOM: the hook (B9) drives it.
import { buildProgress, sketchBlocks } from "./build-progress";
import { LINES, lineFor } from "./lines";
import { createLineReader, type BuildError } from "./protocol";
import { partialTitle } from "./title";

export type ThingView =
	| { phase: "building"; title: string | null; blocks: number; progress: number }
	| { phase: "ready"; id: string; title: string; source: string }
	| { phase: "failed"; line: string };

// clean is cleanOutput from compile.ts and compile is compileSource: the hook gets both from a dynamic import so Sucrase stays out of the main chunk.
export type RunDeps = {
	fetch: typeof fetch;
	token(): Promise<string | null>;
	clean(text: string): string;
	compile(source: string): Promise<{ ok: true; code: string } | { ok: false; error: string }>;
};
export type RunTicket = { brief: string; actionId: number | null };
type Attempt = { ok: true; source: string } | { ok: false; code: BuildError };

const EXPECTED = 4000;
const REPAIR_ERROR_CHARS = 300;
// LIMITS.sourceBytes from compile.ts, repeated here because compile.ts imports Sucrase and this file stays in the main chunk (build-run.test.ts pins the two together).
export const MAX_SOURCE_BYTES = 12_288;

// What the panel has shown so far: a repair attempt starts its own count, but the panel never goes backwards.
type Shown = { progress: number; blocks: number; called: boolean };

async function attempt(body: object, d: RunDeps, onView: (v: ThingView) => void, signal: AbortSignal, expected: number, shown: Shown): Promise<Attempt> {
	const token = await d.token();
	if (!token) return { ok: false, code: "failed" };
	let res: Response;
	shown.called = true;
	try {
		res = await d.fetch("/api/build", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal });
	} catch {
		return { ok: false, code: "failed" };
	}
	if (!res.ok || !res.body) return { ok: false, code: res.status === 404 ? "off" : "failed" };
	let source = "",
		bytes = 0,
		failure: BuildError | null = null,
		done = false;
	const encoder = new TextEncoder();
	const reader = createLineReader((l) => {
		if (failure !== null) return;
		if (l.t === "delta") {
			source += l.s;
			bytes += encoder.encode(l.s).length;
			if (bytes > MAX_SOURCE_BYTES) {
				failure = "too_big"; // no source this long is ever kept, so stop reading
				return;
			}
			shown.progress = Math.max(shown.progress, buildProgress(source.length, expected));
			shown.blocks = Math.max(shown.blocks, sketchBlocks(source));
			onView({ phase: "building", title: partialTitle(source), blocks: shown.blocks, progress: shown.progress });
		} else if (l.t === "done") done = true;
		else failure = l.code;
	});
	const decoder = new TextDecoder(),
		stream = res.body.getReader();
	try {
		while (failure === null) {
			const { value, done: end } = await stream.read();
			if (end) break;
			reader.push(decoder.decode(value, { stream: true }));
		}
		if (failure !== null) await stream.cancel().catch(() => undefined);
	} catch {
		return { ok: false, code: "failed" };
	}
	return failure ? { ok: false, code: failure } : done ? { ok: true, source: d.clean(source) } : { ok: false, code: "failed" };
}

export async function runBuild(ticket: RunTicket, d: RunDeps, onView: (v: ThingView) => void, signal: AbortSignal): Promise<void> {
	const shown: Shown = { progress: 0, blocks: 0, called: false };
	const post = async (body: object, sig?: AbortSignal): Promise<Response | null> => {
		const token = await d.token();
		if (!token) return null;
		try {
			return await d.fetch("/api/artifacts", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), ...(sig ? { signal: sig } : {}) });
		} catch {
			return null;
		}
	};
	const mark = async () => {
		if (ticket.actionId !== null) await post({ failed: true, actionId: ticket.actionId }); // no signal: it must outlive the abort
	};
	// A failed build settles its log row as failed, so the daily count and the log tell the truth.
	const fail = async (line: string) => {
		if (signal.aborted) return aborted();
		onView({ phase: "failed", line });
		await mark();
	};
	// An abort shows nothing, but a build that was called has a "started" row that must not stay open.
	const aborted = async () => {
		if (shown.called) await mark();
	};

	const first = await attempt({ brief: ticket.brief }, d, onView, signal, EXPECTED, shown);
	if (signal.aborted) return aborted();
	if (!first.ok) return fail(lineFor(first.code));

	let source = first.source;
	let compiled = await d.compile(source);
	if (signal.aborted) return aborted();
	if (!compiled.ok) {
		const again = await attempt({ repair: { source, error: compiled.error.slice(0, REPAIR_ERROR_CHARS) } }, d, onView, signal, Math.max(source.length, 1000), shown);
		if (signal.aborted) return aborted();
		if (!again.ok) return fail(lineFor(again.code));
		source = again.source;
		compiled = await d.compile(source);
		if (signal.aborted) return aborted();
		if (!compiled.ok) return fail(LINES.compile);
	}

	const res = await post({ source, ...(ticket.actionId !== null ? { actionId: ticket.actionId } : {}) }, signal);
	if (signal.aborted) return aborted();
	if (res === null) return fail(LINES.saveFailed);
	if (res.status === 409) return fail(LINES.full);
	if (!res.ok) return fail(LINES.saveFailed);
	let saved: { id?: unknown; title?: unknown } = {};
	try {
		saved = (await res.json()) as typeof saved;
	} catch {
		return fail(LINES.saveFailed);
	}
	if (typeof saved.id !== "string") return fail(LINES.saveFailed);
	onView({ phase: "ready", id: saved.id, title: typeof saved.title === "string" ? saved.title : "Something small", source });
}

// One build at a time (spec 3, "Another build running"). tryStart returns a release function, or null while one is running.
export function singleFlight(): { tryStart(): (() => void) | null } {
	let busy = false;
	return {
		tryStart() {
			if (busy) return null;
			busy = true;
			let released = false;
			return () => {
				if (released) return;
				released = true;
				busy = false;
			};
		},
	};
}
