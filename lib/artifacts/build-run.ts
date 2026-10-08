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

async function attempt(body: object, d: RunDeps, onView: (v: ThingView) => void, signal: AbortSignal, expected: number): Promise<Attempt> {
	const token = await d.token();
	if (!token) return { ok: false, code: "failed" };
	let res: Response;
	try {
		res = await d.fetch("/api/build", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal });
	} catch {
		return { ok: false, code: "failed" };
	}
	if (!res.ok || !res.body) return { ok: false, code: res.status === 404 ? "off" : "failed" };
	let source = "",
		failure: BuildError | null = null,
		done = false;
	const reader = createLineReader((l) => {
		if (l.t === "delta") {
			source += l.s;
			onView({ phase: "building", title: partialTitle(source), blocks: sketchBlocks(source), progress: buildProgress(source.length, expected) });
		} else if (l.t === "done") done = true;
		else failure = l.code;
	});
	const decoder = new TextDecoder(),
		stream = res.body.getReader();
	try {
		for (;;) {
			const { value, done: end } = await stream.read();
			if (end) break;
			reader.push(decoder.decode(value, { stream: true }));
		}
	} catch {
		return { ok: false, code: "failed" };
	}
	return failure ? { ok: false, code: failure } : done ? { ok: true, source: d.clean(source) } : { ok: false, code: "failed" };
}

export async function runBuild(ticket: RunTicket, d: RunDeps, onView: (v: ThingView) => void, signal: AbortSignal): Promise<void> {
	const post = async (body: object): Promise<Response | null> => {
		const token = await d.token();
		if (!token) return null;
		try {
			return await d.fetch("/api/artifacts", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
		} catch {
			return null;
		}
	};
	// A failed build settles its log row as failed, so the daily count and the log tell the truth. Never after an abort.
	const fail = async (line: string) => {
		if (signal.aborted) return;
		onView({ phase: "failed", line });
		if (ticket.actionId !== null) await post({ failed: true, actionId: ticket.actionId });
	};

	const first = await attempt({ brief: ticket.brief }, d, onView, signal, EXPECTED);
	if (signal.aborted) return;
	if (!first.ok) return fail(lineFor(first.code));

	let source = first.source;
	let compiled = await d.compile(source);
	if (signal.aborted) return;
	if (!compiled.ok) {
		const again = await attempt({ repair: { source, error: compiled.error.slice(0, REPAIR_ERROR_CHARS) } }, d, onView, signal, Math.max(source.length, 1000));
		if (signal.aborted) return;
		if (!again.ok) return fail(lineFor(again.code));
		source = again.source;
		compiled = await d.compile(source);
		if (signal.aborted) return;
		if (!compiled.ok) return fail(LINES.compile);
	}

	const res = await post({ source, ...(ticket.actionId !== null ? { actionId: ticket.actionId } : {}) });
	if (signal.aborted) return;
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
