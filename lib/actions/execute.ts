// One run, no retry; the log row is written either way.
import type { OwnerDb } from "../server/admin";
import { type ActionStatus, writeAction } from "./log";
import type { ActionOutcome, Def, RunCtx, RunResult, Surface } from "./types";

export type Logger = (status: ActionStatus, summary: string, error?: string | null) => Promise<unknown>;

export const logger =
	(db: OwnerDb, def: Def, surface: Surface, pendingId: string | null = null): Logger =>
	(status, summary, error = null) =>
		writeAction(db, { surface, connector: def.connector, name: def.name, tier: def.tier, status, summary, error, pending_id: pendingId });

// What the log says about a done run: the def's own line, else what was said. A throwing logLine falls back to describe.
function logLine(def: Def, args: unknown, r: RunResult, rc: RunCtx): string {
	if (!def.logLine) return r.say;
	try {
		return def.logLine(args, r, rc);
	} catch {
		return def.describe(args);
	}
}

export async function execute(def: Def, args: unknown, rc: RunCtx, log: Logger): Promise<ActionOutcome> {
	try {
		const r = await def.run(args, rc);
		await log(r.ok ? "done" : "failed", r.ok ? logLine(def, args, r, rc) : r.say, r.ok ? null : "run");
		return r.ok ? { kind: "done", line: r.say, result: r.result } : { kind: "failed", line: r.say };
	} catch {
		await log("failed", def.describe(args), "exception");
		return { kind: "failed", line: "That did not work just now." };
	}
}
