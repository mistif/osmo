// The stream between /api/build and the room: one JSON object per line (NDJSON). Spec 3.3.
export const BUILD_ERRORS = ["off", "allowance", "cap", "too_big", "failed"] as const;
export type BuildError = (typeof BUILD_ERRORS)[number];
export type BuildLine = { t: "delta"; s: string } | { t: "done"; tokens: number } | { t: "error"; code: BuildError };

export const encodeLine = (l: BuildLine): string => JSON.stringify(l) + "\n";

function parseLine(text: string): BuildLine | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	if (o.t === "delta" && typeof o.s === "string") return { t: "delta", s: o.s };
	if (o.t === "done" && typeof o.tokens === "number" && Number.isFinite(o.tokens)) return { t: "done", tokens: o.tokens };
	if (o.t === "error" && (BUILD_ERRORS as readonly unknown[]).includes(o.code)) return { t: "error", code: o.code as BuildError };
	return null;
}

// The most a line with no newline yet may hold. A real line is a delta of a few hundred bytes; past this the stream is broken.
export const MAX_HELD = 64 * 1024;

// Feed it chunks as they arrive. A line is handed over only when its newline has arrived; a last line with no newline is held (and dropped).
// If the held text passes MAX_HELD with no newline, it is cleared, one failed error line is handed over, and the reader ignores all that follows.
export function createLineReader(onLine: (l: BuildLine) => void): { push(chunk: string): void } {
	let held = "",
		broken = false;
	return {
		push(chunk) {
			if (broken) return;
			held += chunk;
			let at: number;
			while ((at = held.indexOf("\n")) >= 0) {
				const line = held.slice(0, at).replace(/\r$/, "");
				held = held.slice(at + 1);
				if (line === "") continue;
				const parsed = parseLine(line);
				if (parsed) onLine(parsed);
			}
			if (held.length > MAX_HELD) {
				held = "";
				broken = true;
				onLine({ t: "error", code: "failed" });
			}
		},
	};
}
