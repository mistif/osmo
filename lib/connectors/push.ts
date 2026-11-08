// Web Push (spec 7). sendPush fans one notification out to every saved device; the sender is injected, so the
// tests never reach a real push service. web-push is imported lazily, only when something is really sent.
import type { OwnerDb } from "../server/admin";
import type { Env } from "../actions/types";

type PushSubscriptionRow = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Sender = (subscription: PushSubscriptionRow, payload: string) => Promise<unknown>;
export type PushResult = { sent: number; failed: number };

export const vapidConfigured = (env: Env) => Boolean(env.OSMO_VAPID_PUBLIC && env.OSMO_VAPID_PRIVATE && env.OSMO_VAPID_SUBJECT);

const SEND_TIMEOUT_MS = 5000; // a push service that does not answer must not hold the cron run
const TTL_SECONDS = 3600; // a reminder an hour late is no longer worth showing

// The real sender. Throws "push_unconfigured" when a VAPID name is missing, before the library is loaded.
export function webPushSender(env: Env): Sender {
	return async (subscription, payload) => {
		if (!vapidConfigured(env)) throw new Error("push_unconfigured");
		const webpush = (await import("web-push")).default;
		webpush.setVapidDetails(env.OSMO_VAPID_SUBJECT!, env.OSMO_VAPID_PUBLIC!, env.OSMO_VAPID_PRIVATE!);
		return webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } }, payload, { timeout: SEND_TIMEOUT_MS, TTL: TTL_SECONDS });
	};
}

const gone = (e: unknown) => {
	const code = (e as { statusCode?: unknown } | null)?.statusCode;
	return code === 404 || code === 410;
};

// Sends to every subscription. A 404 or 410 deletes that row; any other error keeps it and counts as failed;
// a success stamps last_ok_at. Never throws: an unreadable table counts as one failure.
export async function sendPush(db: OwnerDb, message: { title: string; body: string }, send: Sender, now: number): Promise<PushResult> {
	let rows: { id: unknown; endpoint: string; p256dh: string; auth: string }[];
	try {
		const { data, error } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth");
		if (error) return { sent: 0, failed: 1 };
		rows = (data ?? []) as typeof rows;
	} catch {
		return { sent: 0, failed: 1 };
	}
	const payload = JSON.stringify({ title: message.title, body: message.body });
	let sent = 0,
		failed = 0;
	for (const r of rows) {
		try {
			await send({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload);
			sent++;
			try {
				await db.from("push_subscriptions").update({ last_ok_at: new Date(now).toISOString() }).eq("id", r.id);
			} catch {
				// the stamp is a nicety
			}
		} catch (e) {
			failed++;
			if (gone(e)) {
				try {
					await db.from("push_subscriptions").delete().eq("id", r.id);
				} catch {
					// it will be reported gone again next time
				}
			}
		}
	}
	return { sent, failed };
}
