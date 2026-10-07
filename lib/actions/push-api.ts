// The three push routes' logic (spec 7.1, 7.2): the public key, saving a device, and a test push.
// Every answer carries cache-control: no-store. Only Gur may call any of them.
import { ownerDb, type OwnerDb } from "../server/admin";
import { supabaseUser, type UserLookup } from "../server/auth";
import { sendPush, vapidConfigured, webPushSender, type Sender } from "../connectors/push";
import { requireOwner } from "./owner";
import type { Env } from "./types";

export type PushApiDeps = { env: Env; lookup: UserLookup; db(): OwnerDb; send: Sender; now(): number };

export const pushDeps = (): PushApiDeps => ({
	env: process.env,
	lookup: supabaseUser,
	db: () => ownerDb(),
	send: webPushSender(process.env),
	now: () => Date.now(),
});

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// The browser needs the public key to subscribe. It comes from here, not from a NEXT_PUBLIC_ name (spec 7.1).
export async function pushKey(request: Request, d: PushApiDeps): Promise<Response> {
	if (request.method !== "GET") return json(405, { error: "method" });
	const key = d.env.OSMO_VAPID_PUBLIC;
	if (!key) return json(404, { error: "not_found" });
	const who = await requireOwner(request, d.env, d.lookup);
	if (who instanceof Response) return who;
	return json(200, { key });
}

const MAX_BODY = 4000;
const MAX_ENDPOINT = 500;
const MAX_KEY = 200;
const MAX_LABEL = 40;

// Only the real push services: a stored endpoint is later fetched by the server, so a stranger's address must never get in.
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const PUSH_SUFFIXES = [".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com"];
const pushHost = (host: string) => PUSH_HOSTS.includes(host) || PUSH_SUFFIXES.some((s) => host.endsWith(s));
const MAX_DEVICES = 10;
const TOO_MANY = { error: "too_many_devices", message: "Ten devices are already saved. Remove one in Settings first." };

type Sub = { endpoint: string; p256dh: string; auth: string; label: string | null };

const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function readSub(raw: string): Sub | null {
	if (raw.length > MAX_BODY) return null;
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return null;
	}
	if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
	const o = v as Record<string, unknown>;
	if (!text(o.endpoint, MAX_ENDPOINT)) return null;
	let url: URL;
	try {
		url = new URL(o.endpoint);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || !pushHost(url.hostname.toLowerCase())) return null;
	const keys = o.keys;
	if (keys === null || typeof keys !== "object" || Array.isArray(keys)) return null;
	const k = keys as Record<string, unknown>;
	if (!text(k.p256dh, MAX_KEY) || !text(k.auth, MAX_KEY)) return null;
	if (o.label !== undefined && o.label !== null && (typeof o.label !== "string" || o.label.length > MAX_LABEL)) return null;
	return { endpoint: o.endpoint, p256dh: k.p256dh, auth: k.auth, label: typeof o.label === "string" && o.label !== "" ? o.label : null };
}

export async function pushSubscribe(request: Request, d: PushApiDeps): Promise<Response> {
	if (request.method !== "POST") return json(405, { error: "method" });
	const who = await requireOwner(request, d.env, d.lookup);
	if (who instanceof Response) return who;
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_BODY) return json(400, { error: "bad_request" });
	let raw: string;
	try {
		raw = await request.text();
	} catch {
		return json(400, { error: "bad_request" });
	}
	const sub = readSub(raw);
	if (sub === null) return json(400, { error: "bad_request" });
	try {
		const db = d.db();
		const have = await db.from("push_subscriptions").select("endpoint");
		if (have.error || !Array.isArray(have.data)) return json(500, { error: "save_failed" });
		const known = (have.data as { endpoint: string }[]).some((r) => r.endpoint === sub.endpoint);
		if (!known && have.data.length >= MAX_DEVICES) return json(409, TOO_MANY); // a saved device may still renew
		const { error } = await db.from("push_subscriptions").upsert({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, label: sub.label }, "endpoint");
		if (error) return json(500, { error: "save_failed" });
	} catch {
		return json(500, { error: "save_failed" });
	}
	return json(200, { ok: true });
}

export async function pushTest(request: Request, d: PushApiDeps): Promise<Response> {
	if (request.method !== "POST") return json(405, { error: "method" });
	const who = await requireOwner(request, d.env, d.lookup);
	if (who instanceof Response) return who;
	if (!vapidConfigured(d.env)) return json(503, { error: "not_configured" });
	try {
		return json(200, await sendPush(d.db(), { title: "Osmo", body: "This is a test from Osmo." }, d.send, d.now()));
	} catch {
		return json(500, { error: "failed" });
	}
}
