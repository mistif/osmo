/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fake-db";
import { handleDue, type DueDeps } from "./due";

const NOW = Date.parse("2026-10-07T12:00:30Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const SECRET = "s3cret-value-for-tests";

function setup(seed: Record<string, any[]> = {}, env: Record<string, string | undefined> = {}, now = NOW) {
	const db = fakeDb(
		{
			profile: [{ paused: false, hide_reminder_text: false, levels: {} }],
			push_subscriptions: [{ id: "s1", endpoint: "https://push.example/1", p256dh: "p", auth: "a" }],
			...seed,
		},
		"owner-1",
		() => now,
	);
	const send = vi.fn<(s: unknown, p: string) => Promise<undefined>>(async () => undefined);
	const deps: DueDeps = {
		env: { OSMO_CRON_SECRET: SECRET, OSMO_ACTIONS: "on", OSMO_OWNER_ID: "owner-1", ...env },
		db: () => db,
		send,
		now: () => now,
	};
	return { db, send, deps };
}
const call = (method = "POST", token: string | null = SECRET) =>
	new Request("http://localhost/api/cron/due", {
		method,
		headers: token === null ? {} : { authorization: `Bearer ${token}` },
		body: method === "POST" ? "{}" : undefined,
	});
const due = (id: string, text: string, at = NOW - MIN) => ({ id, text, due_at: iso(at), status: "pending", created_at: iso(at - HOUR) });

describe("the secret", () => {
	it("is 404 when OSMO_CRON_SECRET is not set, whatever is sent", async () => {
		const { deps } = setup({}, { OSMO_CRON_SECRET: undefined });
		expect((await handleDue(call(), deps)).status).toBe(404);
		expect((await handleDue(call("POST", null), deps)).status).toBe(404);
	});

	it("is 401 for a missing or wrong secret, and touches nothing", async () => {
		const { deps, send, db } = setup({ reminders: [due("r1", "Call Dad")] });
		expect((await handleDue(call("POST", null), deps)).status).toBe(401);
		expect((await handleDue(call("POST", "nope"), deps)).status).toBe(401);
		expect((await handleDue(call("POST", `${SECRET}x`), deps)).status).toBe(401);
		expect((await handleDue(call("POST", SECRET.slice(0, -1)), deps)).status).toBe(401);
		expect(send).not.toHaveBeenCalled();
		expect(db.tables.reminders[0].status).toBe("pending");
	});

	it("is 405 for a GET with the right secret", async () => {
		const { deps } = setup();
		expect((await handleDue(call("GET"), deps)).status).toBe(405);
	});

	it("never caches an answer", async () => {
		const { deps } = setup();
		expect((await handleDue(call(), deps)).headers.get("cache-control")).toBe("no-store");
		expect((await handleDue(call("POST", null), deps)).headers.get("cache-control")).toBe("no-store");
	});
});

describe("sending", () => {
	it("sends the two due reminders once each, marks them sent, and leaves the future one pending", async () => {
		const { deps, send, db } = setup({ reminders: [due("r1", "Call Dad"), due("r2", "Water the plants", NOW - 5 * MIN), due("r3", "Later", NOW + 30 * MIN)] });
		const res = await handleDue(call(), deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: 2, failed: 0 });
		expect(send).toHaveBeenCalledTimes(2);
		const bodies = send.mock.calls.map((c) => JSON.parse(c[1] as string));
		expect(bodies).toEqual(expect.arrayContaining([{ title: "Osmo", body: "Call Dad" }, { title: "Osmo", body: "Water the plants" }]));
		const rows = Object.fromEntries(db.tables.reminders.map((r) => [r.id, r]));
		expect(rows.r1.status).toBe("sent");
		expect(rows.r1.sent_at).toBe(iso(NOW));
		expect(rows.r2.status).toBe("sent");
		expect(rows.r3.status).toBe("pending");
		expect(rows.r3.sent_at).toBeUndefined();
	});

	it("sends each reminder once when two runs overlap", async () => {
		const { deps, send } = setup({ reminders: [due("r1", "Call Dad"), due("r2", "Water the plants")] });
		const [a, b] = await Promise.all([handleDue(call(), deps), handleDue(call(), deps)]);
		const counts = [(await a.json()) as { sent: number }, (await b.json()) as { sent: number }].map((x) => x.sent);
		expect(counts.reduce((x, y) => x + y, 0)).toBe(2);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("sends a plain line instead of the text when hide_reminder_text is on", async () => {
		const { deps, send } = setup({ profile: [{ paused: false, hide_reminder_text: true, levels: {} }], reminders: [due("r1", "Call the doctor")] });
		await handleDue(call(), deps);
		expect(JSON.parse(send.mock.calls[0][1] as string)).toEqual({ title: "Osmo", body: "A reminder from Osmo" });
	});

	it("does nothing with actions off, and leaves reminders pending", async () => {
		for (const off of [undefined, "off", "ON", ""]) {
			const { deps, send, db } = setup({ reminders: [due("r1", "Call Dad")] }, { OSMO_ACTIONS: off });
			const res = await handleDue(call(), deps);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ sent: 0 });
			expect(send).not.toHaveBeenCalled();
			expect(db.tables.reminders[0].status).toBe("pending");
		}
	});

	it("sends nothing while paused, and leaves reminders pending", async () => {
		const { deps, send, db } = setup({ profile: [{ paused: true, levels: {} }], reminders: [due("r1", "Call Dad")] });
		expect(await (await handleDue(call(), deps)).json()).toEqual({ sent: 0 });
		expect(send).not.toHaveBeenCalled();
		expect(db.tables.reminders[0].status).toBe("pending");
	});

	it("sends nothing when the profile cannot be read, rather than guess", async () => {
		const { deps, send, db } = setup({ reminders: [due("r1", "Call Dad")] });
		const real = db.from.bind(db);
		const broken: any = { ...db, from: (t: string) => (t === "profile" ? { select: () => ({ maybeSingle: async () => ({ data: null, error: { message: "down" } }) }) } : real(t)) };
		expect(await (await handleDue(call(), { ...deps, db: () => broken })).json()).toEqual({ sent: 0 });
		expect(send).not.toHaveBeenCalled();
		expect(db.tables.reminders[0].status).toBe("pending");
	});

	it("answers sent 0 when the database is not configured", async () => {
		const { deps } = setup();
		const res = await handleDue(call(), {
			...deps,
			db: () => {
				throw new Error("admin_unconfigured");
			},
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: 0 });
	});
});

describe("a delivery that fails", () => {
	it("logs one failed row, without the text, when there is no subscription", async () => {
		const { deps, db } = setup({ push_subscriptions: [], reminders: [due("r1", "Call Dad about the secret surprise")] });
		const res = await handleDue(call(), deps);
		expect(await res.json()).toEqual({ sent: 0, failed: 1 });
		const rows = db.tables.actions;
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ surface: "cron", connector: "reminders", name: "reminder_due", status: "failed" });
		expect(JSON.stringify(rows[0])).not.toMatch(/secret surprise|Call Dad/);
		expect(db.tables.reminders[0].status).toBe("sent");
	});

	it("logs a failed row when every send fails, and none when one device got it", async () => {
		const bad = setup({ reminders: [due("r1", "Call Dad")] });
		bad.send.mockRejectedValue({ statusCode: 500 });
		expect(await (await handleDue(call(), bad.deps)).json()).toEqual({ sent: 0, failed: 1 });
		expect(bad.db.tables.actions).toHaveLength(1);
		expect(bad.db.tables.actions[0].status).toBe("failed");

		const two = setup({
			push_subscriptions: [
				{ id: "s1", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
				{ id: "s2", endpoint: "https://push.example/2", p256dh: "p", auth: "a" },
			],
			reminders: [due("r1", "Call Dad")],
		});
		two.send.mockImplementation(async (s: any) => {
			if (s.endpoint.endsWith("/1")) throw { statusCode: 500 };
		});
		expect(await (await handleDue(call(), two.deps)).json()).toEqual({ sent: 1, failed: 0 });
		expect(two.db.tables.actions ?? []).toHaveLength(0);
	});

	it("deletes a subscription the push service reports gone", async () => {
		const { deps, db } = setup({ reminders: [due("r1", "Call Dad")] });
		(deps.send as any).mockRejectedValue({ statusCode: 410 });
		await handleDue(call(), deps);
		expect(db.tables.push_subscriptions).toHaveLength(0);
	});
});

describe("the daily clean-up at 03 UTC", () => {
	const THREE = Date.parse("2026-10-07T03:10:00Z");
	const seed = (now: number) => ({
		oauth_states: [
			{ id: "o-old", expires_at: iso(now - MIN) },
			{ id: "o-new", expires_at: iso(now + 5 * MIN) },
		],
		actions: [
			{ id: 1, at: iso(now - 91 * DAY), name: "note_add", status: "done", summary: "old" },
			{ id: 2, at: iso(now - 89 * DAY), name: "note_add", status: "done", summary: "recent" },
		],
		pending_actions: [
			{ id: "p-day", created_at: iso(now - 2 * DAY), expires_at: iso(now - 2 * DAY + 10 * MIN), status: "done", name: "note_delete" },
			{ id: "p-expired", created_at: iso(now - 30 * MIN), expires_at: iso(now - 20 * MIN), status: "pending", name: "note_delete", action_id: 7 },
			{ id: "p-waiting", created_at: iso(now - MIN), expires_at: iso(now + 9 * MIN), status: "pending", name: "note_delete" },
			{ id: "p-stuck", created_at: iso(now - 2 * HOUR), expires_at: iso(now - 2 * HOUR + 10 * MIN), status: "running", name: "note_delete", action_id: 8 },
			{ id: "p-running", created_at: iso(now - 5 * MIN), expires_at: iso(now + 5 * MIN), status: "running", name: "note_delete" },
		],
	});
	const withLogs = (now: number) => ({
		...seed(now),
		actions: [...seed(now).actions, { id: 7, at: iso(now - 30 * MIN), name: "note_delete", status: "waiting", summary: "x" }, { id: 8, at: iso(now - 2 * HOUR), name: "note_delete", status: "waiting", summary: "x" }],
	});

	it("deletes old oauth states and actions, and settles the stuck pending rows", async () => {
		const { deps, db } = setup(withLogs(THREE), {}, THREE);
		const res = await handleDue(call(), deps);
		expect(res.status).toBe(200);
		expect(db.tables.oauth_states.map((r) => r.id)).toEqual(["o-new"]);
		expect(db.tables.actions.map((r) => r.id).sort()).toEqual([2, 7, 8]);
		const pending = Object.fromEntries(db.tables.pending_actions.map((r) => [r.id, r.status]));
		expect(pending["p-day"]).toBeUndefined(); // older than a day: deleted
		expect(pending["p-expired"]).toBe("expired");
		expect(pending["p-waiting"]).toBe("pending");
		expect(pending["p-stuck"]).toBe("failed");
		expect(pending["p-running"]).toBe("running");
		// the waiting log rows that belonged to the settled pending rows are settled too
		const logs = Object.fromEntries(db.tables.actions.map((r) => [r.id, r.status]));
		expect(logs[7]).toBe("expired");
		expect(logs[8]).toBe("failed");
	});

	it("deletes nothing at other hours", async () => {
		const noon = Date.parse("2026-10-07T12:10:00Z");
		const { deps, db } = setup(withLogs(noon), {}, noon);
		await handleDue(call(), deps);
		expect(db.tables.oauth_states).toHaveLength(2);
		expect(db.tables.actions).toHaveLength(4);
		expect(db.tables.pending_actions).toHaveLength(5);
		expect(db.tables.pending_actions.find((r) => r.id === "p-stuck")?.status).toBe("running");
	});

	it("still cleans up while paused, but not while actions are off", async () => {
		const paused = setup({ ...seed(THREE), profile: [{ paused: true, levels: {} }] }, {}, THREE);
		await handleDue(call(), paused.deps);
		expect(paused.db.tables.oauth_states).toHaveLength(1);
		const off = setup(seed(THREE), { OSMO_ACTIONS: undefined }, THREE);
		await handleDue(call(), off.deps);
		expect(off.db.tables.oauth_states).toHaveLength(2);
	});

	it("survives a table that cannot be cleaned, and still sends the reminders", async () => {
		const { deps, db, send } = setup({ ...seed(THREE), reminders: [due("r1", "Call Dad", THREE - MIN)] }, {}, THREE);
		const real = db.from.bind(db);
		const broken: any = {
			...db,
			from: (t: string) => {
				if (t === "oauth_states") throw new Error("no such table");
				return real(t);
			},
		};
		const res = await handleDue(call(), { ...deps, db: () => broken });
		expect(res.status).toBe(200);
		expect(send).toHaveBeenCalledTimes(1);
		expect(db.tables.actions.find((r) => r.id === 1)).toBeUndefined(); // the other steps still ran
	});
});
