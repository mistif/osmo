// POST /api/cron/due (spec 7.3, 7.4): called by the timer in Supabase, sends the reminders that came due, once.
// The only way in is the shared secret. Every answer carries cache-control: no-store.
import { createHash, timingSafeEqual } from "node:crypto";
import { sendPush, webPushSender, type Sender } from "../connectors/push";
import { ownerDb, type OwnerDb } from "../server/admin";
import { bearerToken } from "../server/auth";
import { actionsOn } from "./index";
import { resolveLog, writeAction } from "./log";
import { loadProfile } from "./profile";
import type { Env } from "./types";

export type DueDeps = { env: Env; db(): OwnerDb; send: Sender; now(): number };

export const dueDeps = (): DueDeps => ({ env: process.env, db: () => ownerDb(), send: webPushSender(process.env), now: () => Date.now() });

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Digests have one length, so the comparison cannot leak how long the secret is.
const digest = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (given: string, secret: string) => timingSafeEqual(digest(given), digest(secret));

const HOUR = 3_600_000;
const DAY = 86_400_000;
const CLEANUP_HOUR_UTC = 3;
const ACTION_KEEP_DAYS = 90;

type Settled = { id: unknown; action_id: number | null };

// Daily housekeeping. Each step is on its own, so one broken table does not stop the others. Never throws.
async function cleanUp(db: OwnerDb, now: number): Promise<void> {
	const iso = new Date(now).toISOString();
	const step = async (run: () => Promise<void>) => {
		try {
			await run();
		} catch {
			// the next day tries again
		}
	};
	await step(async () => {
		await db.from("oauth_states").delete().lt("expires_at", iso);
	});
	await step(async () => {
		await db.from("actions").delete().lt("at", new Date(now - ACTION_KEEP_DAYS * DAY).toISOString());
	});
	// A confirmation nobody answered is expired; one still running after an hour is stuck and failed. Their waiting log rows follow.
	await step(async () => {
		const expired = await db.from("pending_actions").update({ status: "expired" }).eq("status", "pending").lte("expires_at", iso).select("id,action_id");
		for (const r of (expired.data ?? []) as Settled[]) if (r.action_id != null) await resolveLog(db, r.action_id, "expired");
	});
	await step(async () => {
		const stuck = await db.from("pending_actions").update({ status: "failed" }).eq("status", "running").lt("created_at", new Date(now - HOUR).toISOString()).select("id,action_id");
		for (const r of (stuck.data ?? []) as Settled[]) if (r.action_id != null) await resolveLog(db, r.action_id, "failed", "stuck");
	});
	await step(async () => {
		await db.from("pending_actions").delete().lt("created_at", new Date(now - DAY).toISOString());
	});
}

export async function handleDue(request: Request, d: DueDeps): Promise<Response> {
	const secret = d.env.OSMO_CRON_SECRET;
	if (!secret) return json(404, { error: "not_found" });
	if (request.method !== "POST") return json(405, { error: "method" });
	if (!sameSecret(bearerToken(request) ?? "", secret)) return json(401, { error: "unauthorized" });
	if (!actionsOn(d.env)) return json(200, { sent: 0 });
	const now = d.now();
	let db: OwnerDb;
	try {
		db = d.db();
	} catch {
		return json(200, { sent: 0 });
	}
	try {
		const profile = await loadProfile(db); // a profile that cannot be read counts as paused
		let sent = 0,
			failed = 0;
		if (!profile.paused) {
			const iso = new Date(now).toISOString();
			// One conditional update is the whole claim: two overlapping runs cannot both get the same reminder.
			const claimed = await db.from("reminders").update({ status: "sent", sent_at: iso }).eq("status", "pending").lte("due_at", iso).select("id,text");
			if (claimed.error) return json(200, { sent: 0 });
			for (const r of (claimed.data ?? []) as { id: unknown; text: string }[]) {
				const body = profile.hideReminderText ? "A reminder from Osmo" : r.text;
				const out = await sendPush(db, { title: "Osmo", body }, d.send, now);
				if (out.sent > 0) sent++;
				else {
					failed++;
					// No text in the log: only that a reminder could not be delivered.
					await writeAction(db, {
						surface: "cron",
						connector: "reminders",
						name: "reminder_due",
						tier: 2,
						status: "failed",
						summary: "A reminder could not be delivered to any device.",
						error: out.failed > 0 ? "send_failed" : "no_subscription",
						pending_id: null,
					});
				}
			}
		}
		if (new Date(now).getUTCHours() === CLEANUP_HOUR_UTC) await cleanUp(db, now);
		return json(200, profile.paused ? { sent: 0 } : { sent, failed });
	} catch {
		return json(200, { sent: 0 });
	}
}
