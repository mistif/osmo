/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fake-db";
import { pushKey, pushSubscribe, pushTest, type PushApiDeps } from "./push-api";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const TOKENS: Record<string, string> = { good: "owner-1", other: "someone-else" };
const VAPID = { OSMO_VAPID_PUBLIC: "pubkey", OSMO_VAPID_PRIVATE: "priv", OSMO_VAPID_SUBJECT: "mailto:a@example.com" };

function setup(env: Record<string, string | undefined> = {}, seed: Record<string, any[]> = {}) {
	const db = fakeDb(seed, "owner-1", () => NOW);
	const send = vi.fn(async () => undefined);
	const deps: PushApiDeps = {
		env: { OSMO_OWNER_ID: "owner-1", ...VAPID, ...env },
		lookup: async (t) => (TOKENS[t] ? { id: TOKENS[t] } : null),
		db: () => db,
		send,
		now: () => NOW,
	};
	return { db, send, deps };
}
const req = (method: string, body?: unknown, token: string | null = "good") =>
	new Request("http://localhost/api/push", {
		method,
		headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
		body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
	});
const valid = { endpoint: "https://push.example/abc", keys: { p256dh: "pp", auth: "aa" }, label: "iPhone" };

describe("pushKey", () => {
	it("is 404 when OSMO_VAPID_PUBLIC is unset, whoever asks", async () => {
		const { deps } = setup({ OSMO_VAPID_PUBLIC: undefined });
		expect((await pushKey(req("GET"), deps)).status).toBe(404);
		expect((await pushKey(req("GET", undefined, null), deps)).status).toBe(404);
	});

	it("gives the public key to the owner only", async () => {
		const { deps } = setup();
		expect((await pushKey(req("GET", undefined, null), deps)).status).toBe(401);
		expect((await pushKey(req("GET", undefined, "other"), deps)).status).toBe(403);
		const ok = await pushKey(req("GET"), deps);
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ key: "pubkey" });
		expect(ok.headers.get("cache-control")).toBe("no-store");
	});
});

describe("pushSubscribe", () => {
	it("401 and 403 before anything is written", async () => {
		const { deps, db } = setup();
		expect((await pushSubscribe(req("POST", valid, null), deps)).status).toBe(401);
		expect((await pushSubscribe(req("POST", valid, "other"), deps)).status).toBe(403);
		expect(db.tables.push_subscriptions ?? []).toHaveLength(0);
	});

	it("accepts a valid subscription and upserts it on the endpoint", async () => {
		const { deps, db } = setup();
		expect((await pushSubscribe(req("POST", valid), deps)).status).toBe(200);
		expect((await pushSubscribe(req("POST", { ...valid, label: "Windows Edge" }), deps)).status).toBe(200);
		expect(db.tables.push_subscriptions).toHaveLength(1);
		expect(db.tables.push_subscriptions[0]).toMatchObject({ endpoint: valid.endpoint, p256dh: "pp", auth: "aa", label: "Windows Edge" });
	});

	it("accepts a missing label", async () => {
		const { deps, db } = setup();
		const noLabel = { endpoint: valid.endpoint, keys: valid.keys };
		expect((await pushSubscribe(req("POST", noLabel), deps)).status).toBe(200);
		expect(db.tables.push_subscriptions[0].label ?? null).toBeNull();
	});

	it.each([
		["a non-https endpoint", { ...valid, endpoint: "http://push.example/abc" }],
		["an endpoint that is not a url", { ...valid, endpoint: "not a url" }],
		["an endpoint over 500 characters", { ...valid, endpoint: `https://push.example/${"a".repeat(500)}` }],
		["keys that are not strings", { ...valid, keys: { p256dh: 1, auth: "aa" } }],
		["missing keys", { endpoint: valid.endpoint }],
		["empty keys", { ...valid, keys: { p256dh: "", auth: "aa" } }],
		["a label over 40 characters", { ...valid, label: "x".repeat(41) }],
		["a label that is not text", { ...valid, label: 5 }],
		["an array", [valid]],
		["not JSON", "{nope"],
		["a body that is far too large", { ...valid, extra: "x".repeat(10_000) }],
	])("rejects %s with 400", async (_name, body) => {
		const { deps, db } = setup();
		expect((await pushSubscribe(req("POST", body as any), deps)).status).toBe(400);
		expect(db.tables.push_subscriptions ?? []).toHaveLength(0);
	});

	it("is 405 for GET", async () => {
		const { deps } = setup();
		expect((await pushSubscribe(req("GET"), deps)).status).toBe(405);
	});
});

describe("pushTest", () => {
	it("sends the test line to every device and returns the counts", async () => {
		const { deps, send } = setup({}, { push_subscriptions: [{ id: "1", endpoint: "https://p.example/1", p256dh: "p", auth: "a" }] });
		const res = await pushTest(req("POST"), deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: 1, failed: 0 });
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://p.example/1" }), JSON.stringify({ title: "Osmo", body: "This is a test from Osmo." }));
	});

	it("401, 403, 405 and 503 without the VAPID names", async () => {
		const { deps } = setup();
		expect((await pushTest(req("POST", undefined, null), deps)).status).toBe(401);
		expect((await pushTest(req("POST", undefined, "other"), deps)).status).toBe(403);
		expect((await pushTest(req("GET"), deps)).status).toBe(405);
		const bare = setup({ OSMO_VAPID_PRIVATE: undefined });
		expect((await pushTest(req("POST"), bare.deps)).status).toBe(503);
	});

	it("reports zero when nothing is subscribed", async () => {
		const { deps } = setup();
		expect(await (await pushTest(req("POST"), deps)).json()).toEqual({ sent: 0, failed: 0 });
	});
});
