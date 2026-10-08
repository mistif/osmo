// The one waiting confirmation (spec 4.2, 4.3). At most one row is pending; answering it is atomic, and the
// level and the pause switch are checked again when the yes arrives, not when the action was proposed.
import type { OwnerDb } from "../server/admin";
import { execute, logger, type Logger } from "./execute";
import { type ActionStatus, resolveLog, writeAction } from "./log";
import { levelOf, loadProfile } from "./profile";
import { decide } from "./tiers";
import type { Def, Deps, Surface } from "./types";

export const TTL_MS = 10 * 60_000;
// waiting: true means the row is still pending after this answer (a spoken yes on a typing-only action), so the room keeps its flag.
export type Answer = { handled: false } | { handled: true; reply: string; waiting?: true };
export const EXPIRED = "That request has expired. Ask me again if you still want it.";
export const NEEDS_TYPING = "For that one I need you to type yes.";
export const DID_NOTHING = "I did nothing, because Osmo is paused or that setting changed.";

// Settle the waiting log rows that belong to pending rows which were just cancelled or expired.
async function settleLogs(db: OwnerDb, res: { data: unknown }, status: ActionStatus) {
	for (const r of (res.data ?? []) as { action_id: number | null }[]) if (r.action_id != null) await resolveLog(db, r.action_id, status);
}

export async function holdPending(db: OwnerDb, h: { def: Def; args: unknown; summary: string; logSummary?: string; surface: Surface; now: number }): Promise<string | null> {
	await settleLogs(db, await db.from("pending_actions").update({ status: "cancelled" }).eq("status", "pending").select("action_id"), "cancelled");
	const { data, error } = await db
		.from("pending_actions")
		.insert({ name: h.def.name, args: h.args, summary: h.summary.slice(0, 400), surface: h.surface, status: "pending", expires_at: new Date(h.now + TTL_MS).toISOString() })
		.select("id")
		.single();
	if (error || !data) return null;
	const id = (data as { id: string }).id;
	// The waiting log row and the pending row point at each other (the log row by pending_id, this one by action_id).
	const actionId = await writeAction(db, { surface: h.surface, connector: h.def.connector, name: h.def.name, tier: h.def.tier, status: "waiting", summary: h.logSummary ?? h.summary, error: null, pending_id: id });
	if (actionId !== null) await db.from("pending_actions").update({ action_id: actionId }).eq("id", id);
	return id;
}

export const cancelAllPending = async (db: OwnerDb) => {
	await settleLogs(db, await db.from("pending_actions").update({ status: "cancelled" }).eq("status", "pending").select("action_id"), "cancelled");
};

// pendingId, when given, names the row the answer is for (the id runAction returned): any other row is left alone and not handled.
export async function answerPending(deps: Deps, decision: "yes" | "no", via: "typed" | "voice", now: number, pendingId?: string): Promise<Answer> {
	const db = deps.db(),
		iso = new Date(now).toISOString();
	const peek = await db.from("pending_actions").select("id,name").eq("status", "pending").gt("expires_at", iso).maybeSingle();
	if (!peek.data) {
		const sweep = db.from("pending_actions").update({ status: "expired" }).eq("status", "pending").lte("expires_at", iso);
		const gone = await (pendingId === undefined ? sweep : sweep.eq("id", pendingId)).select("id,action_id");
		await settleLogs(db, gone, "expired");
		return (gone.data as unknown[] | null)?.length ? { handled: true, reply: EXPIRED } : { handled: false };
	}
	const seen = peek.data as { id: unknown; name: string };
	if (pendingId !== undefined && String(seen.id) !== pendingId) return { handled: false }; // the room means another row: change nothing
	const peeked = deps.registry.find((d) => d.name === seen.name);
	if (decision === "yes" && via === "voice" && peeked && !peeked.voiceOk) return { handled: true, waiting: true, reply: NEEDS_TYPING };
	// Claim the very row that was peeked: if it was cancelled and another one held in between, this finds nothing.
	const claim = await db
		.from("pending_actions")
		.update({ status: decision === "no" ? "cancelled" : "running" })
		.eq("id", seen.id)
		.eq("status", "pending")
		.gt("expires_at", iso)
		.select("id,name,args,action_id")
		.maybeSingle();
	if (!claim.data) return { handled: false }; // another surface answered first
	const row = claim.data as { id: string; name: string; args: unknown; action_id: number | null };
	if (decision === "no") {
		if (row.action_id != null) await resolveLog(db, row.action_id, "cancelled");
		return { handled: true, reply: "Cancelled." };
	}
	// Settle the pending row, and the waiting log row with it. The pending update is tried twice; if it still fails
	// the daily sweep handles it. Never throws.
	const finish = async (status: "done" | "failed" | "cancelled", error?: string, summary?: string) => {
		for (let i = 0; i < 2; i++) {
			try {
				const res = await db.from("pending_actions").update({ status }).eq("id", row.id);
				if (!res.error) break;
			} catch {
				// try once more
			}
		}
		if (row.action_id != null) await resolveLog(db, row.action_id, status, error, summary);
	};
	try {
		// The def, and the voice gate, come from the row that was actually claimed.
		const def = deps.registry.find((d) => d.name === row.name);
		if (def && via === "voice" && !def.voiceOk) {
			await finish("cancelled");
			return { handled: true, reply: NEEDS_TYPING };
		}
		const profile = await loadProfile(db);
		if (!def || profile.paused || decide(levelOf(profile, def.connector), def.tier) === "refuse") {
			await finish("cancelled");
			if (def) await logger(db, def, "confirm", row.id)("refused", def.describe(row.args), "level");
			return { handled: true, reply: DID_NOTHING };
		}
		// One row per confirmed action: the waiting row is settled with what the run logged. Only when it has no
		// waiting row (its insert failed) does the run write a row of its own.
		const ran: { summary?: string; error?: string } = {};
		const log: Logger =
			row.action_id != null
				? async (_status, summary, error) => {
						ran.summary = summary;
						ran.error = error ?? undefined;
					}
				: logger(db, def, "confirm", row.id);
		const out = await execute(def, row.args, { now, timezone: profile.timezone, db, profile, fetch: deps.fetch, env: deps.env }, log);
		await finish(out.kind === "done" ? "done" : "failed", ran.error, ran.summary);
		return { handled: true, reply: "line" in out ? out.line : DID_NOTHING };
	} catch {
		// never leave the row running
		await finish("failed", "exception");
		if (row.action_id == null) {
			const def = deps.registry.find((d) => d.name === row.name);
			if (def) await writeAction(db, { surface: "confirm", connector: def.connector, name: def.name, tier: def.tier, status: "failed", summary: def.describe(row.args), error: "exception", pending_id: row.id });
		}
		return { handled: true, reply: DID_NOTHING };
	}
}
