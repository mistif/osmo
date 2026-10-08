import { describe, expect, it, vi } from "vitest";
import { runBuild, singleFlight, type RunDeps, type ThingView } from "./build-run";
import { LINES } from "./lines";
import { encodeLine, type BuildLine } from "./protocol";

const enc = new TextEncoder();
function ndjson(lines: BuildLine[], opts: { hold?: AbortSignal } = {}): Response {
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			for (const l of lines) c.enqueue(enc.encode(encodeLine(l)));
			if (!opts.hold) c.close();
			else opts.hold.addEventListener("abort", () => c.error(new Error("aborted")));
		},
	});
	return new Response(body, { status: 200 });
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const GOOD = "// title: Tip splitter\nexport default function A() { return <div/>; }\n";
const BAD = "// title: X\nBAD export default function A() {}\n";
const stream = (source: string, tokens = 50): BuildLine[] => [{ t: "delta", s: source.slice(0, 22) }, { t: "delta", s: source.slice(22) }, { t: "done", tokens }];

type Call = { url: string; body: Record<string, unknown> };
function setup(builds: Array<() => Response>, save: () => Response = () => json(200, { id: "id-1", version: 1, title: "Tip splitter" })) {
	const calls: Call[] = [];
	let n = 0;
	const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const u = String(url);
		calls.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
		if (u === "/api/build") return (builds[n++] ?? (() => json(500, {})))();
		return save();
	});
	const deps: RunDeps = {
		fetch: fetchFn as unknown as typeof fetch,
		token: async () => "t",
		clean: (s) => s,
		compile: async (s) => (s.includes("BAD") ? { ok: false, error: "Unexpected token (3:5)" } : { ok: true, code: s }),
	};
	const views: ThingView[] = [];
	const run = (signal: AbortSignal = new AbortController().signal, ticket: { brief: string; actionId: number | null } = { brief: "a tip splitter", actionId: 7 }) =>
		runBuild(ticket, deps, (v) => views.push(v), signal);
	return { calls, views, run, deps };
}
const builds = (c: Call[]) => c.filter((x) => x.url === "/api/build");
const saves = (c: Call[]) => c.filter((x) => x.url === "/api/artifacts");

describe("runBuild", () => {
	it("builds, then saves, then is ready; the save body has the source and the action id and no brief", async () => {
		const t = setup([() => ndjson(stream(GOOD))]);
		await t.run();
		const phases = t.views.map((v) => v.phase);
		expect(phases[0]).toBe("building");
		expect(phases.at(-1)).toBe("ready");
		const titled = t.views.find((v) => v.phase === "building" && v.title !== null);
		expect(titled && titled.phase === "building" && titled.title).toBe("Tip splitter");
		expect(t.views.at(-1)).toEqual({ phase: "ready", id: "id-1", title: "Tip splitter", source: GOOD });
		expect(builds(t.calls)[0].body).toEqual({ brief: "a tip splitter" });
		const save = saves(t.calls);
		expect(save.length).toBe(1);
		expect(save[0].body).toEqual({ source: GOOD, actionId: 7 });
		expect(JSON.stringify(save[0].body)).not.toContain("brief");
	});
	it("repairs once when the first source does not compile", async () => {
		const t = setup([() => ndjson(stream(BAD)), () => ndjson(stream(GOOD))]);
		await t.run();
		const b = builds(t.calls);
		expect(b.length).toBe(2);
		expect(b[1].body).toEqual({ repair: { source: BAD, error: "Unexpected token (3:5)" } });
		expect(t.views.at(-1)?.phase).toBe("ready");
	});
	it("cuts the repair error to 300 characters", async () => {
		const t = setup([() => ndjson(stream(BAD)), () => ndjson(stream(GOOD))]);
		t.deps.compile = async (s) => (s.includes("BAD") ? { ok: false, error: "e".repeat(900) } : { ok: true, code: s });
		await t.run();
		const repair = builds(t.calls)[1].body.repair as { error: string };
		expect(repair.error.length).toBe(300);
	});
	it("fails after two compile errors, with exactly two build calls and a failed marker", async () => {
		const t = setup([() => ndjson(stream(BAD)), () => ndjson(stream(BAD))]);
		await t.run();
		expect(builds(t.calls).length).toBe(2);
		expect(t.views.at(-1)).toEqual({ phase: "failed", line: LINES.compile });
		const s = saves(t.calls);
		expect(s.length).toBe(1);
		expect(s[0].body).toEqual({ failed: true, actionId: 7 });
	});
	it("fails with his line when the stream ends with no done (Review Focus 4), and saves nothing", async () => {
		const t = setup([() => ndjson([{ t: "delta", s: "// title: Half\nexport def" }])]);
		await t.run();
		expect(t.views.at(-1)).toEqual({ phase: "failed", line: LINES.failed });
		expect(saves(t.calls).some((c) => "source" in c.body)).toBe(false);
	});
	it("fails when the connection breaks mid-stream", async () => {
		const ac = new AbortController();
		const t = setup([() => ndjson([{ t: "delta", s: "abc" }], { hold: ac.signal })]);
		const done = t.run(); // the runner's own signal stays live; only the fake body errors
		await new Promise((r) => setTimeout(r, 5));
		ac.abort();
		await done;
		expect(t.views.at(-1)).toEqual({ phase: "failed", line: LINES.failed });
	});
	it.each([
		["too_big", LINES.tooBig],
		["allowance", LINES.allowance],
		["cap", LINES.cap],
	] as const)("an %s error shows its line and does not repair", async (code, line) => {
		const t = setup([() => ndjson([{ t: "delta", s: "// title: X\n" }, { t: "error", code }])]);
		await t.run();
		expect(t.views.at(-1)).toEqual({ phase: "failed", line });
		expect(builds(t.calls).length).toBe(1);
		expect(saves(t.calls).some((c) => "source" in c.body)).toBe(false);
	});
	it("a 404 from the route means the switch is off", async () => {
		const t = setup([() => json(404, {})]);
		await t.run();
		expect(t.views.at(-1)).toEqual({ phase: "failed", line: LINES.off });
	});
	it("no token means failed", async () => {
		const t = setup([() => ndjson(stream(GOOD))]);
		t.deps.token = async () => null;
		await t.run();
		expect(t.views.at(-1)).toEqual({ phase: "failed", line: LINES.failed });
		expect(builds(t.calls).length).toBe(0);
	});
	it("an abort mid-stream resolves with no failed view and no save", async () => {
		const ac = new AbortController();
		const t = setup([() => ndjson([{ t: "delta", s: "// title: X\n" }], { hold: ac.signal })]);
		const done = t.run(ac.signal);
		await new Promise((r) => setTimeout(r, 5));
		ac.abort();
		await done;
		expect(t.views.some((v) => v.phase === "failed")).toBe(false);
		expect(saves(t.calls).length).toBe(0);
	});
	it("a full shelf (409) says so; another save failure says it could not keep it", async () => {
		const a = setup([() => ndjson(stream(GOOD))], () => json(409, { error: "full" }));
		await a.run();
		expect(a.views.at(-1)).toEqual({ phase: "failed", line: LINES.full });
		const b = setup([() => ndjson(stream(GOOD))], () => json(500, { error: "failed" }));
		await b.run();
		expect(b.views.at(-1)).toEqual({ phase: "failed", line: LINES.saveFailed });
	});
	it("without an action id the save body carries none and no failed marker is sent", async () => {
		const ok = setup([() => ndjson(stream(GOOD))]);
		await ok.run(undefined, { brief: "x", actionId: null });
		expect(saves(ok.calls)[0].body).toEqual({ source: GOOD });
		const bad = setup([() => ndjson([{ t: "error", code: "failed" }])]);
		await bad.run(undefined, { brief: "x", actionId: null });
		expect(saves(bad.calls).length).toBe(0);
	});
});
describe("singleFlight", () => {
	it("lets one build start at a time", () => {
		const f = singleFlight();
		const release = f.tryStart();
		expect(release).not.toBeNull();
		expect(f.tryStart()).toBeNull();
		release?.();
		release?.(); // releasing twice is harmless
		const again = f.tryStart();
		expect(again).not.toBeNull();
		expect(f.tryStart()).toBeNull();
	});
});
