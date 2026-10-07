// The one waiting confirmation (spec 4.2, 4.3). At most one row is pending; answering it is atomic, and the
// level and the pause switch are checked again when the yes arrives, not when the action was proposed.
import type { OwnerDb } from "../server/admin";
import { execute, logger } from "./execute";
import { writeAction } from "./log";
import { levelOf, loadProfile } from "./profile";
import { decide } from "./tiers";
import type { Def, Deps, Surface } from "./types";

export const TTL_MS = 10 * 60_000;
export type Answer = { handled: false } | { handled: true; reply: string };
export const EXPIRED = "That request has expired. Ask me again if you still want it.";
export const NEEDS_TYPING = "For that one I need you to type yes.";
export const DID_NOTHING = "I did nothing, because Osmo is paused or that setting changed.";

export async function holdPending(db: OwnerDb, h: { def: Def; args: unknown; summary: string; surface: Surface; now: number }): Promise<string | null> {
	await db.from("pending_actions").update({ status: "cancelled" }).eq("status", "pending");
	const { data, error } = await db
		.from("pending_actions")
		.insert({ name: h.def.name, args: h.args, summary: h.summary.slice(0, 400), surface: h.surface, status: "pending", expires_at: new Date(h.now + TTL_MS).toISOString() })
		.select("id")
		.single();
	if (error || !data) return null;
	const id = (data as { id: string }).id;
	// The waiting log row and the pending row point at each other (the log row by pending_id, this one by action_id).
	const actionId = await writeAction(db, { surface: h.surface, connector: h.def.connector, name: h.def.name, tier: h.def.tier, status: "waiting", summary: h.summary, error: null, pending_id: id });
	if (actionId !== null) await db.from("pending_actions").update({ action_id: actionId }).eq("id", id);
	return id;
}

export const cancelAllPending = async (db: OwnerDb) => {
	await db.from("pending_actions").update({ status: "cancelled" }).eq("status", "pending");
};

export async function answerPending(deps: Deps, decision: "yes" | "no", via: "typed" | "voice", now: number): Promise<Answer> {
	const db = deps.db(),
		iso = new Date(now).toISOString();
	const peek = await db.from("pending_actions").select("id,name").eq("status", "pending").gt("expires_at", iso).maybeSingle();
	if (!peek.data) {
		const gone = await db.from("pending_actions").update({ status: "expired" }).eq("status", "pending").lte("expires_at", iso).select("id");
		return (gone.data as unknown[] | null)?.length ? { handled: true, reply: EXPIRED } : { handled: false };
	}
	const seen = peek.data as { id: unknown; name: string };
	const peeked = deps.registry.find((d) => d.name === seen.name);
	if (decision === "yes" && via === "voice" && peeked && !peeked.voiceOk) return { handled: true, reply: NEEDS_TYPING };
	// Claim the very row that was peeked: if it was cancelled and another one held in between, this finds nothing.
	const claim = await db
		.from("pending_actions")
		.update({ status: decision === "no" ? "cancelled" : "running" })
		.eq("id", seen.id)
		.eq("status", "pending")
		.gt("expires_at", iso)
		.select("id,name,args")
		.maybeSingle();
	if (!claim.data) return { handled: false }; // another surface answered first
	if (decision === "no") return { handled: true, reply: "Cancelled." };
	const row = claim.data as { id: string; name: string; args: unknown };
	const finish = (status: string) => db.from("pending_actions").update({ status }).eq("id", row.id);
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
		const out = await execute(def, row.args, { now, timezone: profile.timezone, db, profile, fetch: deps.fetch, env: deps.env }, logger(db, def, "confirm", row.id));
		await finish(out.kind === "done" ? "done" : "failed");
		return { handled: true, reply: "line" in out ? out.line : DID_NOTHING };
	} catch {
		// never leave the row running
		try {
			await finish("failed");
		} catch {
			// the row will be swept by the daily clean-up
		}
		return { handled: true, reply: DID_NOTHING };
	}
}
