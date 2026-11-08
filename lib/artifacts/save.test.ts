/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "../actions/fake-db";
import { LIMITS } from "./compile";
import { handleArtifacts, type SaveDeps } from "./save";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const TOKENS: Record<string, string> = { good: "owner-1", other: "someone-else" };
const GOOD = '// title: Tip splitter\nimport { useState } from "react";\nexport default function Tip() {\n\tconst [n, setN] = useState(2);\n\treturn <button onClick={() => setN(n + 1)}>{n}</button>;\n}\n';
const STARTED = "Started building something.";

function setup(over: { env?: Record<string, string | undefined>; artifacts?: number; actions?: any[] } = {}) {
	const db: FakeDb = fakeDb(
		{
			artifacts: Array.from({ length: over.artifacts ?? 0 }, (_, i) => ({ id: `a${i}`, title: "x", source: "x", version: 1, kept: true })),
			actions: over.actions ?? [
				{ id: 7, name: "build", connector: "artifacts", status: "done", summary: STARTED, at: new Date(NOW).toISOString() },
				{ id: 8, name: "note_add", connector: "notes", status: "done", summary: "Noted.", at: new Date(NOW).toISOString() },
			],
		},
		"owner-1",
		() => NOW,
	);
	const deps: SaveDeps = {
		env: { OSMO_OWNER_ID: "owner-1", OSMO_ACTIONS: "on", OSMO_BUILD: "on", ...over.env },
		lookup: vi.fn(async (t: string) => (TOKENS[t] ? { id: TOKENS[t] } : null)),
		db: () => db,
		now: () => NOW,
	};
	return { db, deps };
}
const post = (body: unknown, token: string | null = "good", method = "POST") =>
	new Request("http://localhost/api/artifacts", {
		method,
		headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
		body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
	});
const action = (db: FakeDb, id: number) => db.tables.actions.find((r) => r.id === id)!;

describe("who may call", () => {
	it("401 without a token, 403 for another user, 405 for a GET", async () => {
		const { deps } = setup();
		expect((await handleArtifacts(post({ source: GOOD }, null), deps)).status).toBe(401);
		expect((await handleArtifacts(post({ source: GOOD }, "nobody"), deps)).status).toBe(401);
		expect((await handleArtifacts(post({ source: GOOD }, "other"), deps)).status).toBe(403);
		expect((await handleArtifacts(post(null, "good", "GET"), deps)).status).toBe(405);
	});
	it("404 while OSMO_BUILD or OSMO_ACTIONS is not on, and nothing is read or written", async () => {
		for (const env of [{ OSMO_BUILD: undefined }, { OSMO_BUILD: "ON" }, { OSMO_ACTIONS: undefined }]) {
			const { deps, db } = setup({ env });
			const res = await handleArtifacts(post({ source: GOOD }), deps);
			expect(res.status).toBe(404);
			expect(db.tables.artifacts).toEqual([]);
		}
	});
	it("every answer carries cache-control: no-store", async () => {
		const { deps } = setup();
		expect((await handleArtifacts(post({ source: GOOD }), deps)).headers.get("cache-control")).toBe("no-store");
		expect((await handleArtifacts(post({ source: GOOD }, null), deps)).headers.get("cache-control")).toBe("no-store");
	});
});
describe("the body", () => {
	it("a guest (any case) is a 400 and nothing is inserted", async () => {
		for (const speaker of ["guest", "GUEST", " Guest "]) {
			const { deps, db } = setup();
			expect((await handleArtifacts(post({ source: GOOD, speaker }), deps)).status).toBe(400);
			expect(db.tables.artifacts).toEqual([]);
		}
	});
	it("a body over 20,000 bytes, bad JSON, a wrong shape and extra keys are 400", async () => {
		const { deps, db } = setup();
		for (const body of [{ source: "x".repeat(20_001) }, "not json", [], { source: 5 }, { source: GOOD, extra: 1 }, { actionId: 7 }, { source: GOOD, actionId: "7" }, { source: GOOD, actionId: 1.5 }, { failed: true }, { failed: true, actionId: "7" }, { failed: true, source: GOOD, actionId: 7 }, { failed: false, actionId: 7 }]) {
			expect((await handleArtifacts(post(body), deps)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
		}
		expect(db.tables.artifacts).toEqual([]);
	});
	it("measures the body in bytes: 10,001 two-byte characters is over 20,000 bytes", async () => {
		const { deps, db } = setup();
		const text = JSON.stringify({ source: "\u00e9".repeat(10_001) });
		expect(text.length).toBeLessThan(20_000);
		expect((await handleArtifacts(post(text), deps)).status).toBe(400);
		expect(db.tables.artifacts).toEqual([]);
	});
});
describe("saving", () => {
	it("a source that fails the checks is a 422 and nothing is inserted", async () => {
		const { deps, db } = setup();
		const bad = GOOD.replace("setN(n + 1)", "fetch('/x')");
		const res = await handleArtifacts(post({ source: bad }), deps);
		expect(res.status).toBe(422);
		expect(await res.json()).toMatchObject({ error: "compile", message: expect.stringContaining("fetch") });
		expect(db.tables.artifacts).toEqual([]);
	});
	it("a source over 12,288 bytes is a 422", async () => {
		const { deps, db } = setup();
		const res = await handleArtifacts(post({ source: GOOD + "//" + "x".repeat(LIMITS.sourceBytes) }), deps);
		expect(res.status).toBe(422);
		expect(db.tables.artifacts).toEqual([]);
	});
	it("a syntax error is a 422 with a short message", async () => {
		const { deps } = setup();
		const res = await handleArtifacts(post({ source: "// title: X\nexport default function A() { return <div>; }\n" }), deps);
		expect(res.status).toBe(422);
		expect(((await res.json()) as { message: string }).message.length).toBeLessThanOrEqual(LIMITS.repairErrorChars);
	});
	it("a good source inserts one row, as version 1, kept, with its title, and settles the log row", async () => {
		const { deps, db } = setup();
		const res = await handleArtifacts(post({ source: GOOD, actionId: 7 }), deps);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string; version: number; title: string };
		expect(body).toMatchObject({ version: 1, title: "Tip splitter" });
		expect(db.tables.artifacts).toHaveLength(1);
		expect(db.tables.artifacts[0]).toMatchObject({ id: body.id, title: "Tip splitter", kind: "react", version: 1, kept: true, parent_id: null, source: GOOD, user_id: "owner-1" });
		expect(action(db, 7)).toMatchObject({ status: "done", summary: "Built Tip splitter" });
	});
	it("cleans the title and falls back to Something small", async () => {
		const a = setup();
		await handleArtifacts(post({ source: GOOD.replace("Tip splitter", "<b>Tip</b>") }), a.deps);
		expect(a.db.tables.artifacts[0].title).toBe("b Tip b");
		const b = setup();
		await handleArtifacts(post({ source: GOOD.replace("// title: Tip splitter\n", "") }), b.deps);
		expect(b.db.tables.artifacts[0].title).toBe("Something small");
		const c = setup();
		await handleArtifacts(post({ source: GOOD.replace("Tip splitter", "!!!") }), c.deps);
		expect(c.db.tables.artifacts[0].title).toBe("Something small");
	});
	it("an action id that is missing or belongs to another kind of action is ignored, and the source still saves", async () => {
		for (const actionId of [undefined, 999, 8]) {
			const { deps, db } = setup();
			const res = await handleArtifacts(post(actionId === undefined ? { source: GOOD } : { source: GOOD, actionId }), deps);
			expect(res.status).toBe(200);
			expect(db.tables.artifacts).toHaveLength(1);
			expect(action(db, 8)).toMatchObject({ summary: "Noted." });
		}
	});
	it("the log tables never hold any text of the brief (the route never sees one)", async () => {
		const { deps, db } = setup();
		await handleArtifacts(post({ source: GOOD, actionId: 7, brief: "a private calculator" }), deps).catch(() => null);
		expect(JSON.stringify(db.tables.actions)).not.toContain("private calculator");
	});
	it("refuses the 201st row with a 409 and inserts nothing", async () => {
		const { deps, db } = setup({ artifacts: 200 });
		const res = await handleArtifacts(post({ source: GOOD, actionId: 7 }), deps);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "full" });
		expect(db.tables.artifacts).toHaveLength(200);
		const ok = setup({ artifacts: 199 });
		expect((await handleArtifacts(post({ source: GOOD }), ok.deps)).status).toBe(200);
		expect(ok.db.tables.artifacts).toHaveLength(200);
	});
	it("answers 500 when the database cannot be reached", async () => {
		const { deps } = setup();
		deps.db = () => {
			throw new Error("admin_unconfigured");
		};
		expect((await handleArtifacts(post({ source: GOOD }), deps)).status).toBe(500);
	});
});
describe("the failed marker", () => {
	it("settles a build row as failed once, keeping its text-free summary", async () => {
		const { deps, db } = setup();
		const res = await handleArtifacts(post({ failed: true, actionId: 7 }), deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(action(db, 7)).toMatchObject({ status: "failed", summary: STARTED, error: "build_failed" });
		// a second call changes nothing
		action(db, 7).error = "marker";
		await handleArtifacts(post({ failed: true, actionId: 7 }), deps);
		expect(action(db, 7)).toMatchObject({ status: "failed", error: "marker" });
		expect(db.tables.artifacts).toEqual([]);
	});
	it("leaves a row that is not a build row, a missing row, and a build row already settled by a save", async () => {
		const { deps, db } = setup();
		expect((await handleArtifacts(post({ failed: true, actionId: 8 }), deps)).status).toBe(200);
		expect(action(db, 8)).toMatchObject({ status: "done", summary: "Noted." });
		expect((await handleArtifacts(post({ failed: true, actionId: 999 }), deps)).status).toBe(200);
		await handleArtifacts(post({ source: GOOD, actionId: 7 }), deps);
		await handleArtifacts(post({ failed: true, actionId: 7 }), deps);
		expect(action(db, 7)).toMatchObject({ status: "done", summary: "Built Tip splitter" });
	});
	it("a guest marker is a 400", async () => {
		const { deps, db } = setup();
		expect((await handleArtifacts(post({ failed: true, actionId: 7, speaker: "guest" }), deps)).status).toBe(400);
		expect(action(db, 7).status).toBe("done");
	});
});
