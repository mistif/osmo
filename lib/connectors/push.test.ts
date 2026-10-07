/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "../actions/fake-db";
import { sendPush, vapidConfigured, webPushSender } from "./push";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const sub = (id: string, endpoint = `https://push.example/${id}`) => ({ id, endpoint, p256dh: `p-${id}`, auth: `a-${id}` });

describe("sendPush", () => {
	it("sends nothing and counts nothing when there are no subscriptions", async () => {
		const db = fakeDb({ push_subscriptions: [] });
		const send = vi.fn();
		expect(await sendPush(db, { title: "Osmo", body: "Hi" }, send, NOW)).toEqual({ sent: 0, failed: 0 });
		expect(send).not.toHaveBeenCalled();
	});

	it("sends once per subscription with the keys and a JSON payload, and stamps last_ok_at", async () => {
		const db = fakeDb({ push_subscriptions: [sub("1"), sub("2")] });
		const send = vi.fn(async () => undefined);
		expect(await sendPush(db, { title: "Osmo", body: "Call Dad" }, send, NOW)).toEqual({ sent: 2, failed: 0 });
		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenCalledWith({ endpoint: "https://push.example/1", keys: { p256dh: "p-1", auth: "a-1" } }, JSON.stringify({ title: "Osmo", body: "Call Dad" }));
		expect(db.tables.push_subscriptions.map((r) => r.last_ok_at)).toEqual([new Date(NOW).toISOString(), new Date(NOW).toISOString()]);
	});

	it("deletes a subscription the service reports gone (410 or 404)", async () => {
		const db = fakeDb({ push_subscriptions: [sub("1"), sub("2"), sub("3")] });
		const send = vi.fn(async (s: { endpoint: string }) => {
			if (s.endpoint.endsWith("/1")) throw { statusCode: 410 };
			if (s.endpoint.endsWith("/2")) throw { statusCode: 404 };
		});
		expect(await sendPush(db, { title: "Osmo", body: "x" }, send as any, NOW)).toEqual({ sent: 1, failed: 2 });
		expect(db.tables.push_subscriptions.map((r) => r.id)).toEqual(["3"]);
	});

	it("keeps the row and counts a failure for any other error", async () => {
		const db = fakeDb({ push_subscriptions: [sub("1"), sub("2")] });
		const send = vi.fn(async (s: { endpoint: string }) => {
			if (s.endpoint.endsWith("/1")) throw { statusCode: 500 };
			if (s.endpoint.endsWith("/2")) throw new Error("network down");
		});
		expect(await sendPush(db, { title: "Osmo", body: "x" }, send as any, NOW)).toEqual({ sent: 0, failed: 2 });
		expect(db.tables.push_subscriptions).toHaveLength(2);
		expect(db.tables.push_subscriptions.every((r) => r.last_ok_at === undefined)).toBe(true);
	});

	it("reports one failure, and sends nothing, when the subscriptions cannot be read", async () => {
		const db = fakeDb({ push_subscriptions: [sub("1")] });
		const broken: any = { ...db, from: () => ({ select: () => ({ then: (ok: any) => Promise.resolve({ data: null, error: { message: "down" } }).then(ok) }) }) };
		const send = vi.fn();
		expect(await sendPush(broken, { title: "Osmo", body: "x" }, send, NOW)).toEqual({ sent: 0, failed: 1 });
		expect(send).not.toHaveBeenCalled();
	});
});

describe("vapidConfigured and webPushSender", () => {
	const env = { OSMO_VAPID_PUBLIC: "pub", OSMO_VAPID_PRIVATE: "priv", OSMO_VAPID_SUBJECT: "mailto:a@example.com" };

	it("needs all three names", () => {
		expect(vapidConfigured(env)).toBe(true);
		expect(vapidConfigured({ ...env, OSMO_VAPID_PRIVATE: undefined })).toBe(false);
		expect(vapidConfigured({ ...env, OSMO_VAPID_SUBJECT: "" })).toBe(false);
		expect(vapidConfigured({})).toBe(false);
	});

	it("sets the VAPID details and calls sendNotification with the subscription and payload (library mocked)", async () => {
		const setVapidDetails = vi.fn();
		const sendNotification = vi.fn(async () => ({ statusCode: 201 }));
		vi.doMock("web-push", () => ({ default: { setVapidDetails, sendNotification } }));
		const send = webPushSender(env);
		await send({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }, '{"title":"Osmo"}');
		expect(setVapidDetails).toHaveBeenCalledWith("mailto:a@example.com", "pub", "priv");
		expect(sendNotification).toHaveBeenCalledWith({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }, '{"title":"Osmo"}');
		vi.doUnmock("web-push");
	});

	it("throws push_unconfigured without the names, before touching the library", async () => {
		const send = webPushSender({});
		await expect(send({ endpoint: "https://x.example", keys: { p256dh: "p", auth: "a" } }, "{}")).rejects.toThrow("push_unconfigured");
	});
});
