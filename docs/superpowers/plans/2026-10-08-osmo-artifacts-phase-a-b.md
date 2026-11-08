# Osmo Artifacts, Phases A and B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Osmo builds a small React thing on request, streams it into a sealed frame beside the conversation, and saves it (phase A: the frame, runtime and probe; phase B: the `build` action, routes, storage, Insights). Phase C (full animation, versions by asking, Repair) gets a later plan.

**Architecture:** The room compiles with Sucrase and runs the result in a `sandbox="allow-scripts"` iframe built from `srcdoc` with a one-use nonce. React is bundled once into `public/artifact/runtime.<hash>.js`. `/api/build` (language) streams NDJSON through the existing token ledger; `/api/artifacts` (main) recompiles as a gate and inserts through the owner-pinned admin client.

**Tech Stack:** Next 16.3.6, React 19.2.8, Supabase (RLS), vitest 5 (node env, `lib/**/*.test.ts` only), new: `sucrase` (dependency), `esbuild` (devDependency).

**Spec:** `docs/superpowers/specs/2026-10-08-osmo-artifacts-design.md` (cited as "spec N"). Gur's section 14 answers: 1A react only, 2A right of the conversation, 3A no asking Osmo from inside, 4A kept by default, 5A cap 30. Connectors plan: `docs/superpowers/plans/2026-10-07-osmo-connectors-phase-0-1.md` (cited as "0.N").

## Global Constraints

- Dark by default: `OSMO_BUILD` unset (server), the `artifacts` level `off` (profile default via `levelOf`), `OSMO_ACTIONS` unset. Needs `OSMO_CHAT=on` and `OSMO_ACTIONS=on` to run at all.
- Frame: `sandbox="allow-scripts"` only (never `allow-same-origin`), `allow=""`, `referrerpolicy="no-referrer"`. CSP, verbatim: `default-src 'none'; script-src 'nonce-<N>'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'`.
- Limits: source 12,288 bytes (UTF-8), title 1 to 60 characters, brief 1 to 500, repair error 300, output cap 4,000 tokens, 30 builds per 24 hours, 200 rows per user, version 1 to 99. Source is the only thing stored; never the brief or compiled script.
- Only `react` imports; hooks, `memo`, `useId`, `Fragment` only. One `export default`, no props.
- Osmo's register in every line code writes: full forms, no exclamation mark, no emoji.
- Commits: stage by path, never `git add -A` or `git add .`; each ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; checks before each commit: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`. Nothing is pushed by a plan task: only main pushes, with Gur's OK.
- `package.json` and the lockfile: one install at a time; write "installing X" under Now on your desk first (`brain/desks/`, then `git -C brain push origin brain`).
- Only Gur types keys. Never print a key value. Probe calls need his go.
- Next 16 differs from older Next: route handlers use Web `Request`/`Response`; `after` comes from `next/server` and runs up to `maxDuration` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).

## Review Focus

1. The model wraps the component in ``` fences or adds prose before the title line: `cleanOutput` strips it (A1 test).
2. Source containing `</script` or `<!--` would break out of the inline script tag: the scan forbids both and the page builder throws (A1, A2 tests).
3. The browser disconnects mid-stream (tab closed, crisis abort): tokens stay booked, nothing is saved, no double settle (B7 test).
4. The stream ends with no `done` line (network drop): the panel fails with his line, never hangs or shows half a thing (B1 test).
5. A second ticket arrives while one builds, a title carries markup or emoji, and the 201st save: declined, sanitised and refused respectively (B1, B4 tests).

## Verified before writing (2026-10-08, local checks)

- **`handler.ts` has no `action` handling** and `turn-schema.ts` has no `turnFormat`: language's connectors tasks 0.7, 0.8, 0.10, 0.11, 0.12 have not landed. **Phase B language tasks B5 to B8 depend on them** and must not start until they are on local `main`. Main's seam (`runAction`, `listEnabledActions`, `lib/actions/*`, `/api/act`) is on local main (desk, 2026-10-07).
- `react` and `react-dom` are 19.2.8; neither has a `umd` folder. `esbuild` and `sucrase` are not installed (`rolldown` 1.2.10 is present only as vitest's internal; do not use it).
- `next.config.ts` sends `X-Frame-Options: DENY` and `frame-ancestors 'none'` on `/:path*`, plus a no-cache rule for `/sw.js`. `public/sw.js` has no `fetch` listener (spec 15.8 settled for the current file).
- `lib/chat/allowance.ts`: `estimateTokens(instructions, input, maxOutput = MAX_OUTPUT_TOKENS)` already takes the output cap (`MAX_OUTPUT_TOKENS` is 360, `CALL_CEILING` 20,000); `lib/chat/openai.ts` `callModel` has a 10 s timeout, so the build uses its own streaming call.
- `lib/actions/caps.ts` counts `status = 'done'` rows only; `execute.ts` always logs once and `log` returns the new row id; `resolveLog(db, id, status, error?, summary?)` exists in `lib/actions/log.ts`.
- Node 24 strips types, so `scripts/*.mjs` can import `.ts` files that import nothing relative (as `chat-probe.mjs` does). `compile.ts` and `build-prompt.ts` therefore import no relative module.

## File Map

| File | Lane | Task |
|---|---|---|
| `lib/artifacts/compile.ts`, `title.ts` (+tests) | main | A1, B1 |
| `lib/artifacts/frame.ts`, `bridge.ts` | main | A2, A3 |
| `lib/artifacts/runtime/{lockdown.ts,entry.tsx}`, `scripts/build-artifact-runtime.mjs`, `public/artifact/runtime.<hash>.js`, `lib/artifacts/runtime-path.ts` | main | A4 |
| `components/osmo/artifact-frame.tsx`, `app/dev/artifact/{page.tsx,fixtures.ts}` | main | A5 |
| `lib/chat/build-prompt.ts`, `scripts/build-probe.mjs` | language | A6, A7 |
| `lib/artifacts/{protocol,build-progress,lines,build-run}.ts` | main | B1 |
| `docs/migrations/artifacts-phase-1.sql` | main | B2 |
| `lib/actions/{build.ts,types.ts,execute.ts,caps.ts,registry.ts,index.ts}` | main | B3 |
| `lib/artifacts/save.ts`, `app/api/artifacts/route.ts` | main | B4 |
| `lib/chat/{handler.ts,openai-stream.ts,build-handler.ts}`, `app/api/build/route.ts` | language | B5 to B8 |
| `components/osmo/{use-build.ts,thing-panel.tsx,thing.module.css,things-made.tsx}`, `lib/artifacts/things.ts`, `app/assistant.tsx`, `insights-panel.tsx`, `connectors-settings.tsx` | main | B9 to B11 |

---

## PHASE A: frame, runtime, test page, probe

### Task A1 [main]: Checks and compile (spec 5, 13; Review Focus 1, 2)

**Files:** Create `lib/artifacts/compile.ts`, `lib/artifacts/compile.test.ts`. Install `sucrase`.
**Produces:** `LIMITS`, `ALLOWED_IMPORTS`, `cleanOutput(text): string`, `forbiddenWord(source): string | null`, `checkSource(source): {ok:true}|{ok:false;error:string}`, `compileSource(source, opts?: {check?: boolean}): Promise<{ok:true;code:string}|{ok:false;error:string}>` (async so callers can swap in a lazy import). Imports only `sucrase`.

- [ ] Put "installing sucrase" under Now on your desk. Run `npm install sucrase`.
- [ ] Write `compile.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { checkSource, cleanOutput, compileSource, forbiddenWord, LIMITS } from "./compile";

const GOOD = `// title: Tip splitter\nimport { useState } from "react";\nexport default function Tip() {\n\tconst [n, setN] = useState(2);\n\treturn <button onClick={() => setN(n + 1)}>{n}</button>;\n}\n`;
describe("checkSource", () => {
	it("passes a good component", () => expect(checkSource(GOOD)).toEqual({ ok: true }));
	it("counts bytes: 12288 passes, 12289 fails, multi-byte counts as bytes", () => {
		const pad = (n: number) => `export default function A(){return null}\n//${"x".repeat(n)}`;
		const base = new TextEncoder().encode(pad(0)).length;
		expect(checkSource(pad(LIMITS.sourceBytes - base)).ok).toBe(true);
		expect(checkSource(pad(LIMITS.sourceBytes - base + 1)).ok).toBe(false);
		expect(checkSource(pad(0) + "é".repeat(LIMITS.sourceBytes / 2)).ok).toBe(false);
	});
	it.each(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "importScripts", "eval", "Function(", "import(", "window.top", "window.parent", "parent.x", "top.x", "document.cookie", "localStorage", "sessionStorage", "indexedDB", "location", "history", "postMessage", "navigator", "</SCRIPT", "<!--"])("forbids %s", (w) => {
		expect(forbiddenWord(`const a = 1; ${w} ;`)).not.toBeNull();
	});
	it("does not flag words inside longer words", () => expect(forbiddenWord("const desktop = prefetcher; relocation")).toBeNull());
	it("rejects other imports, odd names, namespace imports, missing or double default, required props", () => {
		for (const bad of [`import x from "lodash";\nexport default function A(){return null}`, `import { createPortal } from "react";\nexport default function A(){return null}`, `import * as R from "react";\nexport default function A(){return null}`, `const A = () => null;`, `export default function A(){return null}\nexport default function B(){return null}`, `export default function A(props){return null}`]) expect(checkSource(bad).ok).toBe(false);
		expect(checkSource(`import React, { useState as s, memo } from "react";\nexport default function A(){return null}`).ok).toBe(true);
	});
});
describe("compileSource", () => {
	it("turns JSX and the default export into plain script", async () => {
		const r = await compileSource(GOOD);
		expect(r.ok && r.code.includes("React.createElement") && r.code.includes("exports.default")).toBe(true);
	});
	it("gives a short message with a position for a syntax error", async () => {
		const r = await compileSource(`export default function A(){ return <div>; }`);
		expect(!r.ok && /\(\d+:\d+\)/.test(r.error) && r.error.length <= LIMITS.repairErrorChars).toBe(true);
	});
	it("skips the checks only when asked (dev page)", async () => {
		const src = `export default function A(){ fetch("/x"); return null }`;
		expect((await compileSource(src)).ok).toBe(false);
		expect((await compileSource(src, { check: false })).ok).toBe(true);
	});
});
describe("cleanOutput", () => {
	it("strips fences and prose before the title line", () => {
		expect(cleanOutput("Here you go:\n```jsx\n// title: A b\nexport default 1\n```\n")).toBe("// title: A b\nexport default 1\n");
	});
});
```
- [ ] Run `npx vitest run lib/artifacts/compile` -> FAIL (module missing).
- [ ] Write `compile.ts`:
```ts
// Source checks and the JSX step. Imports nothing relative: scripts/build-probe.mjs loads this file in Node.
import { transform } from "sucrase";

export const LIMITS = { sourceBytes: 12_288, titleChars: 60, titleWords: 5, briefChars: 500, repairErrorChars: 300, perUser: 200, outputTokens: 4000, dailyBuilds: 30 } as const;
export const ALLOWED_IMPORTS = ["useState", "useEffect", "useLayoutEffect", "useRef", "useMemo", "useCallback", "useReducer", "useContext", "useId", "useTransition", "useDeferredValue", "memo", "Fragment"] as const;
// Spec spec 5, plus "</script" and "<!--": the compiled code is embedded in an inline script tag (plan A2).
const FORBIDDEN = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "importScripts", "eval", "Function(", "import(", "window.top", "window.parent", "parent.", "top.", "document.cookie", "localStorage", "sessionStorage", "indexedDB", "location", "history", "postMessage", "navigator", "</script", "<!--"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SCAN = FORBIDDEN.map((w) => ({ w, re: new RegExp(`${/^\w/.test(w) ? "\\b" : ""}${esc(w)}${/\w$/.test(w) ? "\\b" : ""}`, w.startsWith("<") ? "i" : "") }));
const bytes = (s: string) => new TextEncoder().encode(s).length;

export function forbiddenWord(source: string): string | null {
	return SCAN.find(({ re }) => re.test(source))?.w ?? null;
}

// The model is told to send plain text; strip a fence or a lead-in anyway.
export function cleanOutput(text: string): string {
	let t = text.replace(/\r\n/g, "\n");
	const fenced = t.match(/```[\w-]*\n([\s\S]*?)(?:```|$)/);
	if (fenced) t = fenced[1];
	const at = t.indexOf("// title:");
	if (at > 0) t = t.slice(at);
	return t.trimEnd() + "\n";
}

const IMPORT = /\bimport\b\s*([^'"();]*?)\s*(?:from\s*)?(["'])([^"']*)\2/g;
export function checkSource(source: string): { ok: true } | { ok: false; error: string } {
	const no = (error: string) => ({ ok: false as const, error });
	if (bytes(source) > LIMITS.sourceBytes) return no("The source is larger than 12288 bytes.");
	const word = forbiddenWord(source);
	if (word) return no(`Do not use ${word}.`);
	for (const m of source.matchAll(IMPORT)) {
		if (m[3] !== "react") return no(`Only react may be imported, not ${m[3].slice(0, 40)}.`);
		const names = (m[1].match(/\{([^}]*)\}/)?.[1] ?? "").split(",").map((p) => p.trim().split(/\s+as\s+/)[0]).filter(Boolean);
		const wrong = names.find((n) => !(ALLOWED_IMPORTS as readonly string[]).includes(n));
		if (wrong) return no(`Do not import ${wrong} from react.`);
		const rest = m[1].replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
		if (rest !== "" && rest !== "React") return no("Import only named hooks, memo, useId or Fragment from react.");
	}
	if ((source.match(/\bexport\s+default\b/g) ?? []).length !== 1) return no("There must be exactly one export default.");
	if (/export\s+default\s+(?:async\s+)?function\s*[\w$]*\s*\(\s*[^\s)]/.test(source)) return no("The component must take no props.");
	return { ok: true };
}
export type CompileResult = { ok: true; code: string } | { ok: false; error: string };
export async function compileSource(source: string, opts: { check?: boolean } = {}): Promise<CompileResult> {
	if (opts.check !== false) {
		const checked = checkSource(source);
		if (!checked.ok) return checked;
	}
	try {
		const { code } = transform(source, { transforms: ["jsx", "typescript", "imports"], jsxPragma: "React.createElement", jsxFragmentPragma: "React.Fragment", production: true, filePath: "thing.tsx" });
		return { ok: true, code };
	} catch (e) {
		return { ok: false, error: String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, LIMITS.repairErrorChars) };
	}
}
```
- [ ] Run -> PASS; checks. If Node's ESM import of `sucrase` fails in A7, switch to `import sucrase from "sucrase"; const { transform } = sucrase;`.
- [ ] `git add lib/artifacts/compile.ts lib/artifacts/compile.test.ts package.json package-lock.json`; COMMIT `feat(artifacts): source checks and Sucrase compile`.

### Task A2 [main]: The frame page builder (spec 4; Review Focus 2)

**Files:** Create `lib/artifacts/frame.ts`, `frame.test.ts`.
**Produces:** `SANDBOX = "allow-scripts"`, `IFRAME_ALLOW = ""`, `cspFor(nonce)`, `newNonce(random?)`, `safeColor(v, fallback)`, `Aura = {a:string;b:string;bg:string;ink:string}`, `buildFramePage({nonce, runtimeUrl, code, aura}): string` (throws on a bad runtime URL or code containing `</script`/`<!--`).

- [ ] Write `frame.test.ts`: (1) `cspFor("abc")` `toBe` the exact Global Constraints string with `abc`; (2) `SANDBOX` is `"allow-scripts"` and `expect(SANDBOX).not.toContain("allow-same-origin")` plus a scan of `buildFramePage` output: no `allow-same-origin`; (3) page has the CSP `<meta>` before any `<script`, exactly two `nonce="N"` script tags, the first with `src="https://osmo.test/artifact/runtime.0123456789.js"`; (4) `runtimeUrl` `https://evil.test/x.js`, `javascript:1`, `https://osmo.test/artifact/runtime.0123456789.js"><script` all throw; `http://localhost:3000/artifact/runtime.0123456789.js` passes; (5) `code` with `</ScRiPt>` or `<!--` throws; (6) `safeColor("red;}body{display:none", "#000")` is `"#000"`, `safeColor("hsl(172 38% 50%)", "#000")` passes through; (7) `newNonce(() => new Uint8Array(16).fill(255))` is `"ff".repeat(16)`; two default nonces differ.
- [ ] Run -> FAIL. Implement:
```ts
export const SANDBOX = "allow-scripts";
export const IFRAME_ALLOW = "";
export type Aura = { a: string; b: string; bg: string; ink: string };
export const cspFor = (nonce: string) =>
	["default-src 'none'", `script-src 'nonce-${nonce}'`, "style-src 'unsafe-inline'", "img-src data: blob:", "font-src data:", "media-src data: blob:", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'"].join("; ");
export const newNonce = (random: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)) => Array.from(random(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const COLOR = /^(#[0-9a-f]{3,8}|(hsl|rgb|oklch)a?\([\d\s.,%/-]+\))$/i;
export const safeColor = (v: string, fallback: string) => (COLOR.test(v.trim()) ? v.trim() : fallback);
const RUNTIME = /^(https:\/\/[\w.-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/artifact\/runtime\.[0-9a-f]{10}\.js$/;
export function buildFramePage(p: { nonce: string; runtimeUrl: string; code: string; aura: Aura }): string {
	if (!/^[0-9a-f]{32}$/.test(p.nonce)) throw new Error("bad nonce");
	if (!RUNTIME.test(p.runtimeUrl)) throw new Error("bad runtime url");
	if (/<\/script|<!--/i.test(p.code)) throw new Error("code cannot close the script tag");
	const { a, b, bg, ink } = p.aura;
	const vars = `--osmo-a:${safeColor(a, "#5fb3a8")};--osmo-b:${safeColor(b, "#5f8fb3")};--osmo-bg:${safeColor(bg, "#0c111b")};--osmo-ink:${safeColor(ink, "#f3efe8")}`;
	return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${cspFor(p.nonce)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars}}html,body{margin:0;background:var(--osmo-bg);color:var(--osmo-ink);font:16px/1.4 system-ui,sans-serif}</style></head><body><div id="root"></div><script nonce="${p.nonce}" src="${p.runtimeUrl}"></script><script nonce="${p.nonce}">__osmoDefine(function(require,exports,module,React){${p.code}\n});</script></body></html>`;
}
```
- [ ] Run -> PASS; checks; `git add lib/artifacts/frame.ts lib/artifacts/frame.test.ts`; COMMIT `feat(artifacts): the sealed frame page builder with the exact policy`.

### Task A3 [main]: The bridge validator (spec 4, 13)

**Files:** Create `lib/artifacts/bridge.ts`, `bridge.test.ts`.
**Produces:** `FrameMessage` (`{type:"ready"}|{type:"title";text}|{type:"height";px}|{type:"error";text}`), `acceptMessage(ev:{source:unknown;data:unknown}, frame:unknown, nonce:string): FrameMessage|null`, `clampHeight(px, viewportH): number`. Wire format: `{osmo:1, n:<nonce>, t:"ready"|"title"|"height"|"error", v?:string|number}`.

- [ ] Test: with `frame = {}` and `nonce = "n1"`: a valid message of each type is accepted; `source` not `frame` -> null; wrong `n` -> null; an extra key -> null; `ready` with a `v` -> null; title of 61 chars -> null, 60 -> ok; error 201 -> null; `height` non-number, `NaN`, `Infinity` -> null; `t:"cmd"` -> null; `data` a string, null, array -> null. `clampHeight(-50, 800)` is 160; `clampHeight(9999, 800)` is 560; `clampHeight(500, 600)` is 420 (70% of 600); `clampHeight(300, 800)` is 300.
- [ ] Run -> FAIL. Implement:
```ts
export type FrameMessage = { type: "ready" } | { type: "title"; text: string } | { type: "height"; px: number } | { type: "error"; text: string };
const KEYS = (t: string) => (t === "ready" ? ["n", "osmo", "t"] : ["n", "osmo", "t", "v"]);
export function acceptMessage(ev: { source: unknown; data: unknown }, frame: unknown, nonce: string): FrameMessage | null {
	if (frame == null || ev.source !== frame) return null;
	const d = ev.data;
	if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
	const o = d as Record<string, unknown>;
	if (o.osmo !== 1 || o.n !== nonce || typeof o.t !== "string") return null;
	if (Object.keys(o).sort().join() !== KEYS(o.t).sort().join()) return null;
	if (o.t === "ready") return { type: "ready" };
	if ((o.t === "title" || o.t === "error") && typeof o.v === "string" && o.v.length <= (o.t === "title" ? 60 : 200)) return { type: o.t, text: o.v };
	if (o.t === "height" && typeof o.v === "number" && Number.isFinite(o.v)) return { type: "height", px: o.v };
	return null;
}
export const clampHeight = (px: number, viewportH: number) => Math.round(Math.min(Math.max(px, 160), Math.min(viewportH * 0.7, 560)));
```
- [ ] Run -> PASS; checks; `git add lib/artifacts/bridge.ts lib/artifacts/bridge.test.ts`; COMMIT `feat(artifacts): the frame bridge validator`.

### Task A4 [main]: The runtime bundle and its build script (spec 2, 4)

**Files:** Create `lib/artifacts/runtime/lockdown.ts`, `lockdown.test.ts`, `lib/artifacts/runtime/entry.tsx`, `scripts/build-artifact-runtime.mjs`, `lib/artifacts/runtime.test.ts`, generated `public/artifact/runtime.<hash>.js` and `lib/artifacts/runtime-path.ts`. Modify `next.config.ts`, `package.json` (script `artifact:runtime`). Create `lib/artifacts/headers.test.ts`. Install `esbuild` (dev).
**Produces:** `RUNTIME_PATH` (e.g. `"/artifact/runtime.1a2b3c4d5e.js"`); `buildRuntime({write?: boolean}): Promise<{name; path; text}>`; `lockdown(win)`, `requireOnly(react)`.

- [ ] `lockdown.test.ts`: on a plain object `win = { fetch: 1, XMLHttpRequest: 1, WebSocket: 1, EventSource: 1, open: 1, eval: 1 }` after `lockdown(win)` each of the six is `undefined` and assigning `win.fetch = 1` does not bring it back (use `Object.freeze`d check: `expect(Object.getOwnPropertyDescriptor(win,"fetch")?.configurable).toBe(false)`); `requireOnly("R")("react")` is `"R"`; `requireOnly("R")("react-dom")`, `("fs")`, `("./x")` throw.
- [ ] Write `lockdown.ts`:
```ts
const REMOVED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "open", "eval"];
export function lockdown(win: object): void {
	for (const name of REMOVED) {
		try {
			Object.defineProperty(win, name, { value: undefined, writable: false, configurable: false });
		} catch {
			// a property the browser will not let us redefine stays; the policy and the sandbox are the wall
		}
	}
}
export const requireOnly = (react: unknown) => (name: string) => {
	if (name === "react") return react;
	throw new Error("Only react can be imported.");
};
```
- [ ] Write `entry.tsx` (the file the runtime bundles; it runs inside the frame):
```tsx
import * as React from "react";
import { createRoot } from "react-dom/client";
import { lockdown, requireOnly } from "./lockdown";

const nonce = (document.currentScript as HTMLScriptElement | null)?.nonce ?? "";
const parent = window.parent;
const send = parent.postMessage.bind(parent); // captured before lockdown
const post = (t: string, v?: string | number) => send(v === undefined ? { osmo: 1, n: nonce, t } : { osmo: 1, n: nonce, t, v }, "*");
const fail = (e: unknown) => post("error", String((e as Error)?.message ?? e).slice(0, 200));
lockdown(window);
document.addEventListener("click", (e) => { if ((e.target as Element | null)?.closest?.("a")) e.preventDefault(); }, true);
window.addEventListener("error", (e) => fail(e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() { return { failed: true }; }
	componentDidCatch(e: unknown) { fail(e); }
	render() { return this.state.failed ? null : this.props.children; }
}

(window as unknown as { __osmoDefine: (f: (...a: unknown[]) => void) => void }).__osmoDefine = (factory) => {
	try {
		const module = { exports: {} as { default?: unknown } };
		factory(requireOnly(React), module.exports, module, React);
		const Thing = module.exports.default as React.ComponentType;
		if (typeof Thing !== "function") throw new Error("There is no default component.");
		if ((Thing as unknown as { length: number }).length > 0) throw new Error("The component must take no props.");
		createRoot(document.getElementById("root")!).render(<Boundary><Thing /></Boundary>);
		new ResizeObserver(() => post("height", Math.ceil(document.documentElement.scrollHeight))).observe(document.documentElement);
		post("ready");
		if (document.title) post("title", document.title.slice(0, 60));
	} catch (e) {
		fail(e);
	}
};
```
- [ ] Put "installing esbuild" on the desk; `npm install -D esbuild`. Write `scripts/build-artifact-runtime.mjs`:
```js
// Bundles React, ReactDOM and the bridge into public/artifact/runtime.<hash>.js (committed), and writes lib/artifacts/runtime-path.ts.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function buildRuntime({ write = true, root = process.cwd() } = {}) {
	const out = await build({ entryPoints: [join(root, "lib/artifacts/runtime/entry.tsx")], bundle: true, format: "iife", platform: "browser", target: "es2020", minify: true, write: false, legalComments: "none", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
	const text = out.outputFiles[0].text;
	const name = `runtime.${createHash("sha256").update(text).digest("hex").slice(0, 10)}.js`;
	if (write) {
		const dir = join(root, "public", "artifact");
		mkdirSync(dir, { recursive: true });
		for (const f of readdirSync(dir)) if (/^runtime\..*\.js$/.test(f)) rmSync(join(dir, f));
		writeFileSync(join(dir, name), text);
		writeFileSync(join(root, "lib/artifacts/runtime-path.ts"), `// Generated by scripts/build-artifact-runtime.mjs. Do not edit.\nexport const RUNTIME_PATH = "/artifact/${name}";\n`);
	}
	return { name, text, path: `/artifact/${name}` };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log((await buildRuntime()).path);
```
  Add `"artifact:runtime": "node scripts/build-artifact-runtime.mjs"` to `package.json` scripts. Run `npm run artifact:runtime`; expect a path printed and a file of roughly 190 KB raw (spec guessed 60 KB compressed; record the real size in the commit body).
- [ ] `runtime.test.ts` (timeout 30 s): `buildRuntime({write:false}).path` equals `RUNTIME_PATH` from `./runtime-path` (fails with "run npm run artifact:runtime" when the committed bundle is stale), the file exists under `public/artifact/`, and its text contains neither `"fetch("` calls of its own nor `localStorage` (`expect(text).not.toMatch(/localStorage/)`; React's own code has no storage use).
- [ ] `next.config.ts`: add before the `/sw.js` rule `{ source: "/artifact/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }, { key: "X-Content-Type-Options", value: "nosniff" }] }`. `headers.test.ts`: `import cfg from "../../next.config"`; `const rules = await cfg.headers!()`; assert the `/:path*` rule still holds `X-Frame-Options: DENY` and `frame-ancestors 'none'` (a future loosening fails here), and a `/artifact/:path*` rule has `immutable`.
- [ ] Run all new tests -> PASS; checks. `git add lib/artifacts/runtime lib/artifacts/runtime.test.ts lib/artifacts/runtime-path.ts lib/artifacts/headers.test.ts public/artifact scripts/build-artifact-runtime.mjs next.config.ts package.json package-lock.json`; COMMIT `feat(artifacts): the runtime bundle (React, bridge, lockdown) and its long-cache header`.

### Task A5 [main]: The frame component and `/dev/artifact` (spec 4, 11, 13)

**Files:** Create `components/osmo/artifact-frame.tsx`, `app/dev/artifact/page.tsx`, `app/dev/artifact/fixtures.ts`. (No vitest: the logic is in A1 to A3; vitest collects `lib/**` only.)
**Produces:** `<ArtifactFrame source aura onEvent skipChecks? />` where `onEvent(e)` gets `FrameMessage | {type:"compile-error";text:string} | {type:"left-frame"}`; heights are clamped inside.

- [ ] Write `artifact-frame.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { acceptMessage, clampHeight, type FrameMessage } from "@/lib/artifacts/bridge";
import { type Aura, buildFramePage, IFRAME_ALLOW, newNonce, SANDBOX } from "@/lib/artifacts/frame";
import { RUNTIME_PATH } from "@/lib/artifacts/runtime-path";

export type FrameEvent = FrameMessage | { type: "compile-error"; text: string } | { type: "left-frame" };
type Props = { source: string; aura: Aura; onEvent(e: FrameEvent): void; skipChecks?: boolean; className?: string };

export function ArtifactFrame({ source, aura, onEvent, skipChecks, className }: Props) {
	const ref = useRef<HTMLIFrameElement>(null);
	const loads = useRef(0);
	const onEventRef = useRef(onEvent);
	const [open, setOpen] = useState<{ page: string; nonce: string } | null>(null);
	const [height, setHeight] = useState(240);
	useEffect(() => { onEventRef.current = onEvent; });
	useEffect(() => {
		let live = true;
		setOpen(null);
		(async () => {
			const { compileSource } = await import("@/lib/artifacts/compile"); // Sucrase loads on first use
			const result = await compileSource(source, { check: !(skipChecks && process.env.NODE_ENV !== "production") });
			if (!live) return;
			if (!result.ok) return onEventRef.current({ type: "compile-error", text: result.error });
			const nonce = newNonce();
			loads.current = 0;
			setOpen({ nonce, page: buildFramePage({ nonce, runtimeUrl: location.origin + RUNTIME_PATH, code: result.code, aura }) });
		})();
		return () => { live = false; };
		// aura is read once per open (spec 4: fixed for that open)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [source, skipChecks]);
	useEffect(() => {
		if (!open) return;
		const listen = (ev: MessageEvent) => {
			const m = acceptMessage(ev, ref.current?.contentWindow, open.nonce);
			if (!m) return;
			if (m.type === "height") setHeight(clampHeight(m.px, window.innerHeight));
			onEventRef.current(m);
		};
		window.addEventListener("message", listen);
		return () => window.removeEventListener("message", listen);
	}, [open]);
	if (!open) return null;
	return (
		<iframe ref={ref} className={className} title="Something Osmo made" sandbox={SANDBOX} allow={IFRAME_ALLOW} referrerPolicy="no-referrer" srcDoc={open.page} style={{ width: "100%", height, border: 0 }}
			onLoad={() => { if (++loads.current > 1) { setOpen(null); onEventRef.current({ type: "left-frame" }); } }} />
	);
}
```
- [ ] Write `fixtures.ts`: `GOOD` (a tip splitter using `useState`, bill and people inputs, a button, `// title: Tip splitter`), `COMPILE_ERROR` (`export default function A(){ return <div>; }`), `TRIES_FETCH` (`export default function A(){ fetch("https://example.com/?q=1"); return <p>Hello</p>; }`), and `HOSTILE: Record<string,string>` with one-line components for: `fetch`, `top` (`window.top.document.title`), `storage` (`localStorage.setItem` in an effect), `cookie`, `websocket` (`new WebSocket("wss://example.com")`), `form` (a `<form action="https://example.com"><button/></form>` auto-submitted via ref), `link` (`<a href="https://example.com">go</a>` auto-clicked), `eval`, `image` (`<img src="https://example.com/x.png"/>`), `location` (`location.href = "https://example.com"`).
- [ ] Write `page.tsx` (client; `if (process.env.NODE_ENV === "production") notFound();` as `app/dev/figure/page.tsx`): buttons for the three fixtures and each hostile case, a `<textarea>` bound to the source, a "Run" button that sets the running source, a "Skip checks (dev only)" checkbox, an event log (`<pre>` of the last 20 events as `type: text`), and `<ArtifactFrame source={running} aura={{a:"hsl(172 38% 50%)",b:"hsl(212 38% 50%)",bg:"#0c111b",ink:"#f3efe8"}} .../>`.
- [ ] Hand check in the browser pane at `http://localhost:3000/dev/artifact` (dev server from `.claude/launch.json`; note a restart under Now): (1) GOOD shows a working splitter and a `ready` then `height` event; (2) COMPILE_ERROR logs `compile-error` with a position and shows no frame; (3) TRIES_FETCH (checks on) logs `compile-error: Do not use fetch.`; (4) with "Skip checks" on, each HOSTILE case logs an `error` event or nothing, and the pane's network list (`read_network_requests`) shows no request to example.com and no navigation; (5) the console shows CSP violation reports, which is the wall working. Record the results as a table in the commit body. The same table is repeated on a real iPhone by Gur (spec 15.1, 15.10); that check is A8.
- [ ] Checks; `git add components/osmo/artifact-frame.tsx app/dev/artifact`; COMMIT `feat(artifacts): the frame component and the /dev/artifact test page`.

### Task A6 [language]: The build and repair prompts (spec 5)

**Files:** Create `lib/chat/build-prompt.ts`, `lib/chat/build-prompt.test.ts`. Imports nothing relative (the probe loads it).
**Produces:** `buildPrompt(brief: string): { instructions: string; input: InputItem[] }`, `repairPrompt(error: string, source: string): { instructions: string; input: InputItem[] }`, `RULES: string`.

- [ ] Test: `buildPrompt("a tip splitter")` has `input[0].content` containing `Brief: a tip splitter` and instructions that contain "default export", "imports only from react", "12 kilobytes", "no network", "var(--osmo-a)", "var(--osmo-bg)", "phone", "Never use an exclamation mark", "title" and the line shape `// title: `; instructions contain none of "Gur", "memory", "mood" (spec 5: the model is never given them); a brief containing `Ignore the rules` stays in `input` only, never in `instructions`; `repairPrompt("x".repeat(500), "SRC")` puts at most 300 characters of the error in the instructions, has `SRC` in the input, and includes "Return the whole component, corrected. Change only what is needed."
- [ ] Run -> FAIL. Implement `RULES` from spec 5's draft (verbatim sentences: one component, default export, no props, imports only from react, under 12 kilobytes, sealed frame, inline styles, the four colours, phone screen, Osmo's voice for all visible words, no exclamation mark, emoji, slang or symbol a voice would read out, no praise; plus "Output plain text, no fences. The first line is `// title: ` then two to five words with no punctuation."). The brief goes in the user `input`, not the instructions (same words, safer boundary; deviation from spec 5's draft, noted in the report).
- [ ] Run -> PASS; checks; `git add lib/chat/build-prompt.ts lib/chat/build-prompt.test.ts`; COMMIT `feat(chat): build and repair prompts for artifacts`.

### Task A7 [language, gated on Gur's go]: The probe (spec 13, 15.6; section 11 phase A)

**Files:** Create `scripts/build-probe.mjs`. Needs A1 and A6. Run only with Gur's go: 30 calls, about 4,000 to 6,000 tokens each, 120,000 to 180,000 tokens, about 20 to 30% of Osmo's 630,000 daily share, outside the ledger (as `chat-probe.mjs`).

- [ ] Write the script (30 realistic briefs inline, short): tip splitter, countdown to a date, unit converter (km/miles), a small memory game, pomodoro timer, BMI calculator, loan repayment, habit counter, dice roller, colour mixer, word counter, simple budget list, stopwatch, reading-time estimator, temperature converter, tic-tac-toe, flashcards with three cards, a mood diary in memory, age calculator, percentage calculator, a bar chart of five numbers typed in, a metronome with a visual beat, a packing checklist, currency converter with fixed rates, a quiz of three questions, sleep calculator, a snake-free "click the target" game, a recipe scaler, a reaction-time tester, a page of five calculations. Core:
```js
import { createHash } from "node:crypto";
import { chatKey, MODELS } from "../lib/chat/allowance.ts";
import { callModel } from "../lib/chat/openai.ts";
import { buildPrompt, repairPrompt } from "../lib/chat/build-prompt.ts";
import { cleanOutput, compileSource, LIMITS } from "../lib/artifacts/compile.ts";
try { process.loadEnvFile(".env.local"); } catch { console.log("Run this from my-app/, where .env.local is."); process.exit(1); }
const key = chatKey(process.env);
if (!key) { console.log("No OpenAI key in .env.local."); process.exit(1); }
const entry = MODELS[0], safetyId = createHash("sha256").update("osmo build-probe").digest("hex");
const limit = Number(process.argv[2] ?? BRIEFS.length);
const ask = async ({ instructions, input }) => {
	const t0 = performance.now();
	const o = await callModel(fetch, key, { entry, instructions, input, safetyId, maxOutput: LIMITS.outputTokens }, 90_000);
	return { o, ms: Math.round(performance.now() - t0) };
};
const rows = [];
for (const brief of BRIEFS.slice(0, limit)) {
	const first = await ask(buildPrompt(brief));
	const source = first.o.kind === "answered" ? cleanOutput(first.o.parsed.text) : "";
	let res = await compileSource(source), repaired = false, tokens = first.o.kind === "answered" ? (first.o.parsed.usage?.input ?? 0) + (first.o.parsed.usage?.output ?? 0) : 0, ms = first.ms, final = source;
	if (!res.ok) {
		const again = await ask(repairPrompt(res.error, source));
		repaired = true; ms += again.ms;
		if (again.o.kind === "answered") { final = cleanOutput(again.o.parsed.text); tokens += (again.o.parsed.usage?.input ?? 0) + (again.o.parsed.usage?.output ?? 0); res = await compileSource(final); }
	}
	const words = final.replace(/\/\/[^\n]*|[{}()<>;=]/g, " ");
	rows.push({ brief, ok: res.ok, repaired, tokens, ms, bytes: new TextEncoder().encode(final).length, bang: /!/.test(words.replace(/!==?|!\w|!\(/g, "")), emoji: /\p{Extended_Pictographic}/u.test(final), why: res.ok ? "" : res.error.slice(0, 80) });
	console.log(JSON.stringify(rows.at(-1)));
}
const n = rows.length, pct = (k) => `${rows.filter(k).length}/${n}`;
console.log(`first try ${pct((r) => r.ok && !r.repaired)}, after one repair ${pct((r) => r.ok)}, exclamation ${pct((r) => r.bang)}, emoji ${pct((r) => r.emoji)}`);
const sorted = (k) => rows.map((r) => r[k]).sort((a, b) => a - b);
console.log(`tokens median ${sorted("tokens")[n >> 1]}, max ${sorted("tokens").at(-1)}; ms median ${sorted("ms")[n >> 1]}, max ${sorted("ms").at(-1)}; bytes max ${sorted("bytes").at(-1)}`);
```
  (`BRIEFS` is the 30-entry array declared above this block; `callModel`'s third argument is the timeout, 90 s here because a build is longer than chat's 10 s.) Add a streaming leg once B6 exists: `node scripts/build-probe.mjs 1 --stream` calls `streamModel` and prints the event names seen, first-delta time and whether `usage` arrived (settles spec 15.6 and B6's fixtures).
- [ ] Run `node scripts/build-probe.mjs 2` first (two calls) after Gur's go; then the full 30 after he reads the two. Proposed bar, Gur decides: at least 24 of 30 compile first try and 27 of 30 after one repair; median under 7,000 tokens; no row over 12,288 bytes. Write the table to the language desk (never to the repo).
- [ ] `git add scripts/build-probe.mjs`; COMMIT `feat(chat): the artifacts build probe (30 briefs)`.

### Task A8 [STOP, Gur; main]: Phase A gate

- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run build` all green. Phase A changes nothing in the real room (the dev page 404s in production; nothing imports the frame outside it).
- [ ] Gur opens `/dev/artifact` on his laptop and on the iPhone (dev server on the LAN, or after a deploy; `/dev/artifact` 404s in production, so the phone check needs the LAN dev server) and runs the A5 table. If an iPhone result fails (spec 15.1: nonce on an external script in an opaque-origin srcdoc, `postMessage`, `ResizeObserver`), stop and tell main: the fallback is a dedicated frame address with its own headers (spec 4).
- [ ] Cloud agent reviews the sandbox (spec 12) once main pushes with Gur's OK. Update the main desk: Just landed.

---

## PHASE B: the `build` action, routes, storage, panel, Insights

**Prerequisite for B5 to B8 (language):** connectors tasks 0.7, 0.8, 0.10, 0.11, 0.12 on local `main`. Main's B1 to B4 and B9 to B11 do not wait for them (B9 can be driven by a dev trigger until B8 lands).

### Task B1 [main]: Protocol, progress, sketch, lines, title, and the build runner (spec 3, 6, 13; Review Focus 4, 5)

**Files:** Create `lib/artifacts/{protocol,build-progress,lines,title,build-run}.ts` and one `.test.ts` each.
**Produces:**
- `protocol.ts`: `BuildLine = {t:"delta";s:string}|{t:"done";tokens:number}|{t:"error";code:BuildError}`, `BUILD_ERRORS = ["off","allowance","cap","too_big","failed"]`, `encodeLine(l): string`, `createLineReader(onLine): {push(chunk:string):void}`.
- `build-progress.ts`: `buildProgress(bytes, expected, finished?)`, `sketchBlocks(source)`.
- `lines.ts`: `LINES` and `lineFor(code)`.
- `title.ts`: `partialTitle(src): string|null` (only a complete first line), `cleanTitle(raw): string|null`.
- `build-run.ts`: `ThingView`, `RunDeps`, `runBuild(ticket, deps, onView, signal): Promise<void>`, `singleFlight(): { tryStart(): (() => void) | null }`.

- [ ] Tests (one file each, real assertions): **protocol**: `createLineReader` fed `'{"t":"delta","s":"a"}\n{"t":"do'` then `'ne","tokens":5}\n'` yields delta then done; garbage lines, unknown `t`, `{t:"error",code:"nope"}` are skipped; a final line with no newline is held. **progress**: `buildProgress(0,4000)` 0; rising for 1000, 2000, 4000; `buildProgress(1e9, 4000)` is 0.95 (never 1); `NaN`/`-5`/`expected 0` give 0; `finished` gives 1. `sketchBlocks("")` 0; `"<div><h1>A</h1><button>x</button></div>"` 4; a `<div>` inside `// <b>`, `/* <i> */`, `"<p>"` and `` `<p>` `` is not counted; `i < n` and `a<b` not counted; 20 elements cap at 12. **title**: `partialTitle("// title: Tip splitter")` null (no newline yet), `partialTitle("// title: Tip splitter\nimport")` `"Tip splitter"`; `cleanTitle("<b>Hi</b> there! 😀")` `"b Hi b there"` shape: letters, digits, spaces only, at most 5 words and 60 characters, null when empty. **lines**: no `!` and no emoji in any `LINES` value (`/[!\p{Extended_Pictographic}]/u`); `lineFor("too_big")` is the over-size sentence. **build-run** (fake `fetch` returning a `Response` whose body is a `ReadableStream` of NDJSON, `token: async () => "t"`, `compile: async (s) => s.includes("BAD") ? {ok:false,error:"Unexpected token (3:5)"} : {ok:true,code:s}`):
  1. success: views go `building`(title appears once the first line arrives) -> `ready` with the id/title from the save response; the save request body has `source`, `actionId`, and no `brief`;
  2. compile fails once: second `/api/build` body is `{repair:{source,error}}` with error at most 300 chars; then success;
  3. compile fails twice: final view `failed` with `LINES.compile`, exactly two build calls, and a `{failed:true,actionId}` POST to `/api/artifacts`;
  4. stream with no `done` (Review Focus 4) -> `failed` with `LINES.failed`, no save;
  5. `{t:"error",code:"too_big"}` and `"allowance"` -> their lines, no repair;
  6. abort mid-stream -> resolves without any `failed` view and with no save;
  7. `singleFlight`: first `tryStart()` returns a release fn, second returns null until released.
- [ ] Run -> FAIL. Implement. `LINES` (spec 3 table, his register): `compile: "I could not get that to work. Shall I try a different approach?"`, `runtime: "Something I built has stopped working."` (phase B has no Repair button; C appends "I can try to repair it."), `tooBig: "That came out larger than I allow, so I stopped. Could you ask for something smaller?"`, `allowance: "I have used my share for today, so I cannot build that now."`, `cap: "I have reached today's limit for building."`, `failed: "I could not finish that just now. Would you like me to try again?"`, `busy: "I am still building the last one."`, `off: "My building is switched off in Settings."`, `full: "You have as many things as I can keep. Please delete one first."`, `saveFailed: "I built it, but I could not keep it."`. Key code in `build-run.ts`:
```ts
export type ThingView =
	| { phase: "building"; title: string | null; blocks: number; progress: number }
	| { phase: "ready"; id: string; title: string; source: string }
	| { phase: "failed"; line: string };
export type RunDeps = { fetch: typeof fetch; token(): Promise<string | null>; compile(source: string): Promise<{ ok: true; code: string } | { ok: false; error: string }> };
type Attempt = { ok: true; source: string } | { ok: false; code: BuildError };

async function attempt(body: object, d: RunDeps, onView: (v: ThingView) => void, signal: AbortSignal, expected: number): Promise<Attempt> {
	const token = await d.token();
	if (!token) return { ok: false, code: "failed" };
	let res: Response;
	try {
		res = await d.fetch("/api/build", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal });
	} catch { return { ok: false, code: "failed" }; }
	if (!res.ok || !res.body) return { ok: false, code: res.status === 404 ? "off" : "failed" };
	let source = "", failure: BuildError | null = null, done = false;
	const reader = createLineReader((l) => {
		if (l.t === "delta") { source += l.s; onView({ phase: "building", title: partialTitle(source), blocks: sketchBlocks(source), progress: buildProgress(source.length, expected) }); }
		else if (l.t === "done") done = true; else failure = l.code;
	});
	const decoder = new TextDecoder(), stream = res.body.getReader();
	try { for (;;) { const { value, done: end } = await stream.read(); if (end) break; reader.push(decoder.decode(value, { stream: true })); } } catch { return { ok: false, code: "failed" }; }
	return failure ? { ok: false, code: failure } : done ? { ok: true, source: cleanOutput(source) } : { ok: false, code: "failed" };
}
```
  `runBuild`: `const fail = async (line) => { if (!signal.aborted) onView({phase:"failed", line}); }`; attempt 1 with `{ brief: ticket.brief }`, expected 4000; on `!ok` -> `fail(lineFor(code))` and (unless aborted) POST failed marker; compile; on compile error one `attempt({ repair: { source, error: error.slice(0,300) } })`, compile again, else `fail(LINES.compile)` + marker; then `POST /api/artifacts {source, actionId}`; `409` -> `LINES.full`; other non-OK -> `LINES.saveFailed`; OK -> `onView({phase:"ready", id, title, source})`. `cleanOutput` is imported from `compile.ts` (the room already loads Sucrase lazily elsewhere; to keep it out of the main chunk, `build-run.ts` gets `cleanOutput` through `RunDeps`: add `clean(text): string` to `RunDeps` and the test passes `(s) => s`; the hook supplies it from a dynamic import of `compile.ts`).
- [ ] Run -> PASS; checks; `git add lib/artifacts/protocol.ts lib/artifacts/protocol.test.ts lib/artifacts/build-progress.ts lib/artifacts/build-progress.test.ts lib/artifacts/lines.ts lib/artifacts/lines.test.ts lib/artifacts/title.ts lib/artifacts/title.test.ts lib/artifacts/build-run.ts lib/artifacts/build-run.test.ts`; COMMIT `feat(artifacts): stream protocol, progress, outline blocks and the build runner`.

### Task B2 [STOP, Gur's OK; main]: Migration `artifacts_phase_1` (spec 7)

**Files:** Create `docs/migrations/artifacts-phase-1.sql`. Applied by main only, after Gur says OK in chat.

- [ ] Write the file:
```sql
-- Artifacts phase 1 (spec 2026-10-08-osmo-artifacts-design.md section 7). Insert only through /api/artifacts (service role).
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  kind text not null default 'react' check (kind = 'react'),
  source text not null check (octet_length(source) <= 12288),
  version smallint not null default 1 check (version between 1 and 99),
  parent_id uuid references public.artifacts (id) on delete set null,
  kept boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index artifacts_user_created on public.artifacts (user_id, created_at desc);
create function public.artifacts_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger artifacts_touch before update on public.artifacts for each row execute function public.artifacts_touch();
alter table public.artifacts enable row level security;
create policy "own artifacts read" on public.artifacts for select to authenticated using ((select auth.uid()) = user_id);
create policy "own artifacts update" on public.artifacts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own artifacts delete" on public.artifacts for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.artifacts from anon, authenticated;
grant select, delete on public.artifacts to authenticated;
grant update (title, kept) on public.artifacts to authenticated;
```
- [ ] Ask Gur in chat: "Apply artifacts_phase_1 (new table, owner-only, no browser insert)?" On a clear yes, apply with the Supabase `apply_migration` tool (name `artifacts_phase_1`). Verify with `list_tables` (RLS on) and `execute_sql`: `select grantee, privilege_type, column_name from information_schema.column_privileges where table_name='artifacts' and grantee in ('anon','authenticated')` shows update only on `title`,`kept` and no insert; `get_advisors` (security) shows nothing new. Record "as applied" in the file header.
- [ ] `git add docs/migrations/artifacts-phase-1.sql`; COMMIT `docs(db): artifacts phase 1 migration, as applied`. Main desk: Just landed.

### Task B3 [main]: The `build` Def, the ticket, the cap and the gate (spec 3, 10, 12; Gur's 5A)

**Files:** Create `lib/actions/build.ts`, `lib/actions/build.test.ts`. Modify `lib/actions/types.ts`, `execute.ts`, `caps.ts`, `registry.ts`, `index.ts`, their tests (`core.test.ts`, `index.test.ts`; run the suite and fix any test that pins the registry's names or count).
**Produces:** `type BuildTicket = { brief: string; actionId: number | null }`; `RunResult` ok variant gains `ticket?: { brief: string }`; `ActionOutcome` done gains `ticket?: BuildTicket`; `buildDef`; `buildGate(userId, now, deps?): Promise<"ok"|"off"|"cap">`; `capReached(db, name, now, extra = 0)`; `CAP_GROUPS` entries gain optional `statuses`.

- [ ] Tests (`build.test.ts`, with `fakeDb` from `./fake-db`):
  - `buildDef.check`: `{brief:" a tip splitter "}` -> ok, args `{brief:"a tip splitter"}`; empty, 501 chars, extra key, a number, `{brief:"x", from:"t1"}` -> not ok (`from` is phase C); `{brief:"x", from:""}` ok.
  - `buildDef.run` returns `{ok:true, say:"", result:null, ticket:{brief}}`; `logLine` is `"Started building something."` and `describe` carries no brief.
  - `execute(buildDef, …)` returns `kind:"done"` with `ticket.actionId` equal to the id of the `actions` row it wrote (summary `Started building something.`, no brief text anywhere in the table).
  - Cap: 30 `done` build rows in the last 24 h -> `capReached(db,"build",now)` true; 29 -> false; 30 `done` + 1 `failed` counts 31; with `extra = 1`, 30 rows -> false and 31 -> true; a `done` row at 25 h old does not count.
  - `buildGate`: `OSMO_BUILD` unset -> `"off"`; set, `OSMO_ACTIONS` unset -> `"off"`; level `off` or paused -> `"off"`; level `act` -> `"ok"`; level `act` with 31 rows -> `"cap"`; a throwing `db()` -> `"off"`.
  - `runAction` end to end with level `act` and `buildDef` in `registry`: outcome `done` with a ticket, one log row; with level `off`: `refused`; `listEnabledActions` lists `build` only at `act`.
- [ ] Run -> FAIL. Implement:
```ts
// lib/actions/build.ts
import { LIMITS } from "../artifacts/compile";
import type { Def } from "./types";

export const buildDef: Def = {
	name: "build",
	connector: "artifacts",
	tier: 2,
	needsResult: false,
	voiceOk: false,
	line: 'build: make a small working thing for Gur (a calculator, timer, converter or little game) that appears beside you. args {"brief": what to make, plain words, 1 to 500 characters}. Use it only when he asks for something that runs. Tier 2.',
	unclear: "I could not tell what you would like me to build.",
	check(args) {
		if (typeof args !== "object" || args === null || Array.isArray(args)) return { ok: false };
		const o = args as Record<string, unknown>;
		if (Object.keys(o).some((k) => k !== "brief" && k !== "from") || (o.from !== undefined && o.from !== "")) return { ok: false };
		const brief = typeof o.brief === "string" ? o.brief.trim() : "";
		return brief.length >= 1 && brief.length <= LIMITS.briefChars ? { ok: true, args: { brief } } : { ok: false };
	},
	describe: () => "Build a small thing",
	logLine: () => "Started building something.",
	run: async (args) => ({ ok: true, say: "", result: null, ticket: { brief: (args as { brief: string }).brief } }),
};
```
  `compile.ts` imports `sucrase`; `build.ts` importing `LIMITS` from it pulls Sucrase into the server's action bundle only (acceptable; /api/artifacts needs it anyway). In `execute.ts`: `const logged = await log(...)` then add `...(r.ok && r.ticket ? { ticket: { brief: r.ticket.brief, actionId: typeof logged === "number" ? logged : null } } : {})` to the done outcome. `caps.ts`: group type `{ names: string[]; limit: number; statuses?: string[] }`, add `{ names: ["build"], limit: LIMITS.dailyBuilds, statuses: ["done", "failed"] }`, query `.in("status", group.statuses ?? ["done"])`, `capReached(db, name, now, extra = 0)` compares `>= group.limit + extra`. (Failed rows count because a failed build costs tokens; the one over-count is a ticket whose args failed to parse, which costs none: accepted.) `registry.ts`: append `buildDef`. `types.ts`: add `"artifacts"` to `CONNECTORS`. `index.ts`:
```ts
export async function buildGate(userId: string, now: number, deps: Deps = realDeps()): Promise<"ok" | "off" | "cap"> {
	try {
		if (!actionsOn(deps.env) || deps.env.OSMO_BUILD !== "on") return "off";
		const db = deps.db();
		if (!sameOwner(db, userId)) return "off";
		const profile = await loadProfile(db);
		if (profile.paused || decide(levelOf(profile, "artifacts"), 2) !== "run") return "off";
		return (await capReached(db, "build", now, 1)) ? "cap" : "ok"; // +1: this build's own ticket row is already counted
	} catch {
		return "off";
	}
}
```
- [ ] Run whole suite -> PASS; checks; `git add lib/actions/build.ts lib/actions/build.test.ts lib/actions/types.ts lib/actions/execute.ts lib/actions/caps.ts lib/actions/registry.ts lib/actions/index.ts` plus any adjusted test files by name; COMMIT `feat(actions): the build action, its ticket, daily cap of 30 and the route gate (dark)`. Post the Ask on the language desk: the Def's `line` wording is theirs to edit; `buildGate` and the ticket field are the seam.

### Task B4 [main]: `/api/artifacts`, the save gate (spec 3.7, 7, 9; Review Focus 5)

**Files:** Create `lib/artifacts/save.ts`, `save.test.ts`, `app/api/artifacts/route.ts`.
**Consumes:** `requireOwner` (`lib/actions/owner.ts`), `ownerDb`, `resolveLog`, `compileSource`, `cleanTitle`. **Produces:** `handleArtifacts(request, deps: SaveDeps): Promise<Response>`, `saveDeps()`; `SaveDeps = { env: Env; lookup: UserLookup; db(): OwnerDb; now(): number }`.
Body: `{ source: string; actionId?: number }` or `{ failed: true; actionId: number }`. Answers: 200 `{id, version, title}` or `{ok:true}`; 400 bad body or guest; 401/403; 404 off; 409 `{error:"full"}`; 422 `{error:"compile", message}`.

- [ ] Tests (`fakeDb` seeded with `actions`, `artifacts`; `lookup` fake): no token 401; other user 403; `OSMO_BUILD` unset 404; `speaker: "guest"` (any case) 400 and nothing inserted; body over 20,000 bytes 400; source with `fetch(` 422 and nothing inserted; source over 12,288 bytes 422; a good source inserts one row with `kind:"react"`, `version:1`, `kept:true`, `parent_id:null`, title from its `// title:` line (cleaned: `// title: <b>Tip</b>` stores `b Tip b`), fallback title `"Something small"` when absent; response has `id`, `version`; the matching `actions` row (by `actionId`, name `build`) becomes `done` with summary `Built Tip splitter` and the table contains no part of any brief; an `actionId` belonging to a non-`build` row or missing is ignored (still saves); 200 existing rows -> 409 and no insert (the 201st); `{failed:true, actionId}` sets that row `failed` once, and a second call or a row that is not a `build` row changes nothing.
- [ ] Run -> FAIL. Implement the handler in the shape of `lib/actions/act.ts` (`json()` with `cache-control: no-store`, `readBody` with a 20,000-character limit, `requireOwner(request, env, lookup)`). Core of the save branch:
```ts
const checked = await compileSource(body.source);
if (!checked.ok) return json(422, { error: "compile", message: checked.error });
const { count } = await db.from("artifacts").select("id", { count: "exact", head: true });
if ((count ?? 0) >= LIMITS.perUser) return json(409, { error: "full" });
const title = cleanTitle(firstLineTitle(body.source)) ?? "Something small";
const { data, error } = await db.from("artifacts").insert({ title, kind: "react", source: body.source, version: 1, parent_id: null, kept: true }).select("id,version").single();
if (error || !data) return json(500, { error: "failed" });
await settleLog(db, body.actionId, "done", `Built ${title}`); // only when the row exists and is a build row
```
  `firstLineTitle` reads `/^\/\/ title:\s*(.*)$/m` from the first line. `route.ts`: `export const maxDuration = 20; export async function POST(request: Request) { return handleArtifacts(request, saveDeps()); }` with `saveDeps = () => ({ env: process.env, lookup: supabaseUser, db: () => ownerDb(), now: () => Date.now() })`.
- [ ] Run -> PASS; checks; `git add lib/artifacts/save.ts lib/artifacts/save.test.ts app/api/artifacts/route.ts`; COMMIT `feat(artifacts): /api/artifacts saves through a compile gate (dark: needs OSMO_BUILD)`.

### Task B5 [language, needs 0.10]: Reserve and settle with a per-call output cap (spec 10)

**Files:** Modify `lib/chat/handler.ts`, `lib/chat/handler.test.ts`.
**Produces (exported from handler.ts):** `owner(request, deps, env)` (the existing step-1 function, now exported); `type Booked = { kind: "booked"; reservation: Reservation; usage: Usage; settle(counts: Counts, model: string): Promise<boolean> }`; `reserveCall(s: Spend, c: { estimate: number; maxOutput: number }): Promise<Booked | { kind: "skip"; reason: FallbackReason; usage: Usage | null }>`; `spend`'s `call` gains `maxOutput?: number` (default `MAX_OUTPUT_TOKENS`).
Today `reservationRow` and the settlement fallback hard-code 360 (`MAX_OUTPUT_TOKENS`); a 4,000-token build must not be booked at 360.

- [ ] Test first: `reserveCall` with `{estimate: 5000, maxOutput: 4000}` writes a reservation row with `output_tokens: 4000` and `input_tokens: 1000`; `settle` writes a signed settling row for that reservation; a second `reserveCall` that no longer fits the share returns `skip` `allowance` without a row; a ledger whose day was stopped returns `skip` `error`; `spend` called without `maxOutput` still books 360 (the existing tests stay green unchanged).
- [ ] Run -> FAIL. Split `spend` (steps 5 to 9 of the connectors plan's helper: read, stopped check, fits, reserve, second read, withdraw) into `reserveCall`, and make `spend` = `reserveCall` + `callModel` + settle. Replace the `MAX_OUTPUT_TOKENS` uses in `spend`'s estimate, `reservationRow` and `settlement()` by the call's `maxOutput`.
- [ ] Run the `lib/chat` suite -> PASS unchanged elsewhere; checks; `git add lib/chat/handler.ts lib/chat/handler.test.ts`; COMMIT `refactor(chat): reserveCall with a per-call output cap, for streaming builds`.

### Task B6 [language]: The streaming model call (spec 10; probe settles spec 15.6)

**Files:** Create `lib/chat/openai-stream.ts`, `openai-stream.test.ts`. Imports `./openai` (types, `requestBody`, `parseResponse`) only.
**Produces:** `parseSse(buffer: string): { events: { event: string; data: unknown }[]; rest: string }`; `streamModel(fetchFn, key, req: ModelRequest, onDelta: (s: string) => boolean, signal: AbortSignal, timeoutMs = 60_000): Promise<StreamOutcome>`; `StreamOutcome = { kind: "streamed"; text: string; status: string | null; incomplete: string | null; model: string | null; usage: ModelUsage | null; requestId: string | null } | Extract<ModelOutcome, { kind: "rejected" | "unknown" }>`.

- [ ] Tests with a fake `fetch` returning an SSE `Response` (`text/event-stream`): events split across chunks (`"event: response.output_text.delta\ndata: {\"delta\":\"ab\"}\n\nevent: resp"` then the rest); `onDelta` called per delta with the text; `response.completed` carries `{response:{status:"completed",model:"m",usage:{input_tokens:10,output_tokens:20}}}` -> `streamed` with `usage {input:10,output:20,cached:0,reasoning:0}`; `response.incomplete` with `max_output_tokens` -> `incomplete: "max_output_tokens"`; `onDelta` returning `false` aborts the request (`signal.aborted` true on the fetch's signal) and returns `streamed` with `usage: null`; HTTP 400 JSON -> `rejected` with code/type only; HTTP 500, a stream that ends with no terminal event, or `signal` aborted -> `unknown`; the request body is `requestBody(req)` plus `stream: true` and the key only in the header.
- [ ] Run -> FAIL. Implement: `fetchFn(RESPONSES_URL, { method:"POST", headers: {authorization, "content-type"}, body: JSON.stringify({ ...requestBody(req), stream: true }), signal })`, with one overall timer calling the controller; read `response.body` with a `TextDecoder`, `parseSse` on the growing buffer; `response.output_text.delta` -> `text += data.delta; if (onDelta(data.delta) === false) { controller.abort(); return { kind:"streamed", text, status:null, incomplete:null, model:null, usage:null, requestId } }`; `response.completed|response.incomplete` -> `parseResponse(data.response)` fields; `response.failed|error` -> `unknown`. **Unverified until the probe's `--stream` leg (A7) prints the real event names and a final usage; if they differ, adjust the fixtures and constants here.**
- [ ] Run -> PASS; checks; `git add lib/chat/openai-stream.ts lib/chat/openai-stream.test.ts`; COMMIT `feat(chat): a streaming Responses call for builds`.

### Task B7 [language, needs B1, B3, B5, B6]: `/api/build` (spec 3.3, 9, 10; Review Focus 3)

**Files:** Create `lib/chat/build-handler.ts`, `lib/chat/build-handler.test.ts`, `app/api/build/route.ts`.
**Produces:** `handleBuild(request, deps: BuildDeps): Promise<Response>`; `BuildDeps = ChatDeps & { gate(userId: string, now: number): Promise<"ok"|"off"|"cap">; defer(p: Promise<unknown>): void; stream: typeof streamModel }`; `buildDeps()` wiring `gate: buildGate`, `defer: (p) => after(() => p)` (`after` from `next/server`), `stream: streamModel`.
Request body: `{brief: string}` (1 to 500 chars) or `{repair: {source: string; error: string}}` (source at most 12,288 bytes, error at most 300 chars); a `speaker` of `"guest"` (any case) or any other key is a 400. Response: `application/x-ndjson`, headers `cache-control: no-store, no-transform` and `x-accel-buffering: no`, lines per `lib/artifacts/protocol.ts`.

- [ ] Tests (rig as `handler.test.ts`: fake ledger, fake `stream`, `gate: async () => "ok"`, `defer` collecting promises; `env()` with `OSMO_BUILD:"on"` and the chat settings):
  1. no token 401, other user 403, `OSMO_BUILD` unset 404 `{error:"off"}`, non-POST 405, bad body / extra key / guest 400 (and no ledger row, no stream call);
  2. `gate` returns `"cap"` -> one `error` line `cap`, no ledger row; `"off"` -> `off`;
  3. happy path: the fake stream emits `// title: Tip\n` and a body in two deltas, returns `streamed` with the model that was asked for and usage 700/900; the lines are `delta`, `delta`, `done` with `tokens 1600`; the ledger has one reservation with `output_tokens 4000` and one signed settling row 700 in/900 out; the stream request's `maxOutput` is 4000 and its `instructions` come from `buildPrompt` with the brief only in `input`;
  4. allowance short (pre-filled ledger) -> `error allowance`, stream never called;
  5. deltas totalling 12,289 bytes (a 3-byte character crossing the cap) -> the fake's `onDelta` receives `false`, the response ends with `error too_big` and no `done`, and the ledger is settled with the reported usage (or stays at the estimate when none);
  6. outcome `incomplete` (`max_output_tokens`) -> `error too_big`; `unknown` -> `error failed` with the estimate left booked (no settling row); `rejected` -> `error failed` settled at zero;
  7. served model differs -> `error failed` and a settling row under the served model's name (the day stops, as chat);
  8. **disconnect (Review Focus 3):** abort `request.signal` mid-stream -> the fake sees `signal.aborted`, the response stream closes quietly, the ledger is settled once (usage, or estimate when none), no `done` line, and the promise given to `defer` resolves after the settle;
  9. a repair body builds `repairPrompt` and counts separately: two requests make two reservations.
- [ ] Run -> FAIL. Implement per the connectors-style `handleChat`: `owner()` from B5, `OSMO_BUILD`, `readConfig` (null -> `error off`), `gate(user.id, deps.now())`, prompt, `reserveCall(ctx, { estimate: estimateTokens(instructions, input, LIMITS.outputTokens), maxOutput: LIMITS.outputTokens })`, then a `ReadableStream` whose `start` runs `deps.stream(...)` with an `onDelta` that counts UTF-8 bytes and returns `false` past `LIMITS.sourceBytes`, settles, writes the final line and closes; `cancel()` aborts upstream; `request.signal` also aborts. `deps.defer(settled)` where `settled` resolves after the settle (so Vercel's `after` keeps the function alive for the ledger write). Settlement rule: `streamed` with usage -> that usage under the served model; `rejected` -> `ZERO`; served model different with no usage -> the reservation estimate under the served model; otherwise nothing (the estimate stays). `route.ts`: `export const maxDuration = 60;` (Unverified: Gur's plan allows 60 s and does not buffer small chunks; check on the first deploy, spec 15.5) and `POST` -> `handleBuild(request, buildDeps())`.
- [ ] Run -> PASS; checks; `git add lib/chat/build-handler.ts lib/chat/build-handler.test.ts app/api/build/route.ts`; COMMIT `feat(chat): /api/build streams a component through the token ledger (dark)`. Language desk: Just landed; main desk Ask: tell main when B7 is on local main.

### Task B8 [language, needs 0.11, 0.12, B3]: The ticket travels with the answer (spec 3.2, 12)

**Files:** Modify `lib/chat/types.ts`, `lib/chat/handler.ts`, `lib/chat/ask.ts`, their tests, and language's part of `app/assistant.tsx`.
**Produces:** `ChatAnswer` model variant gains `build?: { brief: string; actionId: number | null }`; `AskResult` model gains `build: { brief: string; actionId: number | null } | null`; `useBuild`'s `start` is called from `sendText`.

- [ ] Tests: in `handler.test.ts`, `run` returns `{kind:"done", line:"", result:null, ticket:{brief:"a tip splitter", actionId:7}}` -> the answer's `reply` is the model's holding sentence with no trailing space, `build` equals the ticket, `waiting` false, one OpenAI call; a `done` without a ticket has no `build`; `failed`/`refused` lines still replace the reply and carry no `build`. In `ask.test.ts`: a valid `build` passes through; `brief: 3`, `actionId: "7"`, extra keys, an empty brief -> `build: null`.
- [ ] Run -> FAIL. In 0.11's action branch change `else if (out.kind === "done" && out.result === null) reply = ...` to `[reply, out.line].filter(Boolean).join(" ")` and add `build = out.ticket`; return `...(build ? { build } : {})`. In `ask.ts` validate the field (`typeof brief === "string" && brief.length >= 1 && brief.length <= 500 && (actionId === null || Number.isInteger(actionId))`).
- [ ] Room seam (language's part of `assistant.tsx`; put the file under Now first): add `const buildRef = useRef<{ start(t: BuildTicket): void; cancel(): void } | null>(null);` next to `sendTextRef`; in `sendText`, where an `ask` result of `kind === "model"` is delivered (find with `grep -n 'kind === "model"' app/assistant.tsx`), after `deliver(...)` add `if (result.build) buildRef.current?.start(result.build);`; in `takeCrisis` add `buildRef.current?.cancel();`. Main's B9 assigns `buildRef.current`. Until B9 lands it is null and nothing happens.
- [ ] Run -> PASS; checks; `git add lib/chat/types.ts lib/chat/handler.ts lib/chat/ask.ts lib/chat/handler.test.ts lib/chat/ask.test.ts app/assistant.tsx`; COMMIT `feat(chat): the build ticket rides on the answer; a crisis cancels a build`.

### Task B9 [main]: The panel, the hook and the wiring (spec 6 minimal, 8; Gur's 2A, 4A)

**Files:** Create `components/osmo/use-build.ts`, `components/osmo/thing-panel.tsx`, `components/osmo/thing.module.css`. Modify `app/assistant.tsx` (main's markup part).
Scope held to phase B per spec 11: outline blocks that draw in as the source arrives (`--build-blocks`), a plain progress bar (`--build-progress`), `data-building` on the stage (no styling beyond the panel), Keep/Discard, the phone card and a full-screen overlay. Not here (phase C): the wash, pulse, ring quickening, settle swell, `from`, Earlier versions, Repair.

- [ ] `use-build.ts`:
```ts
"use client";
import { useCallback, useRef, useState } from "react";
import { ensureSession, supabase } from "@/lib/supabase";
import { runBuild, singleFlight, type ThingView } from "@/lib/artifacts/build-run";
import { LINES } from "@/lib/artifacts/lines";
import type { BuildTicket } from "@/lib/actions/types";

export function useBuild() {
	const [view, setView] = useState<ThingView | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const flight = useRef(singleFlight());
	const abort = useRef<AbortController | null>(null);
	const start = useCallback((ticket: BuildTicket) => {
		const release = flight.current.tryStart();
		if (!release) { setNotice(LINES.busy); return; }
		setNotice(null);
		setView({ phase: "building", title: null, blocks: 0, progress: 0 });
		const controller = (abort.current = new AbortController());
		(async () => {
			const compile = await import("@/lib/artifacts/compile");
			await runBuild(ticket, { fetch: (...a) => fetch(...a), token: async () => (await ensureSession())?.access_token ?? null, compile: (s) => compile.compileSource(s), clean: compile.cleanOutput }, setView, controller.signal);
		})().finally(release);
	}, []);
	const cancel = useCallback(() => { abort.current?.abort(); setView(null); }, []);
	const discard = useCallback(async () => {
		if (view?.phase === "ready") await supabase.from("artifacts").delete().eq("id", view.id);
		setView(null);
	}, [view]);
	return { view, notice, start, cancel, discard, close: () => setView(null), show: (id: string, title: string, source: string) => setView({ phase: "ready", id, title, source }) };
}
```
  (`BuildTicket` is exported from `lib/actions/types.ts` in B3; `show` is what Insights' Open uses.)
- [ ] `thing-panel.tsx`: props `{ build: ReturnType<typeof useBuild>; aura: Aura; hidden: boolean }` (`hidden` while Memory/Insights/Settings is open: renders only a chip with the title, spec 6). `building`: title (or "Building"), a 12-slot outline (`<span className={styles.slot} data-on={i < blocks}>` set by `style={{"--build-blocks": blocks}}`), `<progress value={progress} max={1} />`, `aria-busy` and a visually hidden status line "Building"; `failed`: the line, a Close button; `ready`: `<ArtifactFrame source aura onEvent />` (events: `error` -> replace the frame with `LINES.runtime`; `left-frame` -> the same; `compile-error` -> `LINES.compile`; `title` ignored), the title, and a bar `Keep` (hides the bar; the row is already kept) / `Discard` (`build.discard()`); tapping the card (button wrapper, `aria-label="Open full screen"`) toggles an overlay (`position: fixed; inset: 0`) with Close, the same frame (a fresh mount), and Keep/Discard for a just-built thing or Delete for one opened from Insights. `notice` shown as `role="status"`.
- [ ] `thing.module.css`: wide (`@media (min-width: 68rem)`): `.panel { position: absolute; right: 2rem; top: 7rem; width: min(26rem, 32vw); max-height: 70svh }`; narrow: `.panel { position: static; max-height: 34svh; margin: 0 0 0.75rem }`; `.slot { opacity: 0.12; transition: opacity 0.4s ease }` and `.slot[data-on="true"] { opacity: 1 }`; `@media (prefers-reduced-motion: reduce) { .slot { transition: none } .panel { animation: fade 0.2s linear both } }`; panel background `color-mix(in oklab, var(--aura-a) 14%, var(--base))`.
- [ ] `assistant.tsx` (main's parts; file under Now): `const build = useBuild();` `useEffect(() => { buildRef.current = build; });`, `data-building={build.view?.phase === "building" ? "" : undefined}` on the stage next to `data-speaking`, `--build-progress` added to `stageStyle` when building, `<ThingPanel build={build} aura={{ a: theme.colorA, b: theme.colorB, bg: theme.base, ink: "#f3efe8" }} hidden={panels.panel !== null} />` inside `<main className={styles.column}>` between the log and the composer (so the narrow layout sits above the composer), and `build.cancel()` on Lock.
- [ ] Hand check in the browser pane at 1280 px and 390 px (`resize_window` presets), dev server with `OSMO_BUILD=on`, `OSMO_ACTIONS=on`, level `act` in `.env.local` and the profile row (never touch Gur's real settings in the pane: use a test profile or the dev page's trigger): outline draws as text arrives; the panel is right of the conversation on wide, a card above the composer on the phone, tap opens the overlay; reduced motion (`emulate_media`) shows no transition; Keep hides the bar; Discard deletes the row. Without `OSMO_BUILD` nothing renders (dark). Gur's hand check follows.
- [ ] Checks; `git add components/osmo/use-build.ts components/osmo/thing-panel.tsx components/osmo/thing.module.css app/assistant.tsx`; COMMIT `feat(room): the thing panel, Keep and Discard, the phone card and full-screen view (dark)`.

### Task B10 [main]: Insights "Things I made" (spec 8; Gur's 4A)

**Files:** Create `lib/artifacts/things.ts`, `things.test.ts`, `components/osmo/things-made.tsx`. Modify `components/osmo/insights-panel.tsx`, `app/assistant.tsx` (pass `onOpen`).
**Produces:** `ThingRow = { id: string; title: string; version: number; parent_id: string | null; created_at: string }`, `sanitizeThing(raw): ThingRow | null`, `latestOfChains(rows): ThingRow[]` (rows no other row points to, newest first), `describeThing(r, now): string`.

- [ ] Tests: `sanitizeThing` rejects a missing id, a non-number version, a title over 60 or empty; `latestOfChains` of `[v1(a), v2(b, parent a), c]` is `[b, c]` ordered by `created_at` descending; a chain whose newest row was deleted shows the one before; `describeThing({title:"Tip splitter",version:1,...}, now)` is `Tip splitter, made on Wednesday 8 October.` and for version 2 `Tip splitter, version 2, made on ...` (day built from `Intl.DateTimeFormat("en-GB", …).formatToParts`, as `lib/shell/what-i-did.ts`, no commas, no digits-as-symbols).
- [ ] Run -> FAIL; implement. `things-made.tsx`: select `id,title,version,parent_id,created_at` (never `source`) ordered by `created_at` desc, limit 200; per row `describeThing`, an Open button (reads `source` for that single id, then `build.show(id, title, source)` and closes the panel) and a Delete button with the one-step inline confirm used by "What I did" (`confirming` state, `supabase.from("artifacts").delete().eq("id", id)`, the failure line `I could not delete that. Try again.`). A table that does not exist yet (query error) or zero rows renders nothing, so the section stays hidden while the feature is dark (deviation from spec 8's empty state, which would show "I have not made anything yet" to every user before phase B is on; revisit when the level is on). Section title "Things I made" under "What I did" in `insights-panel.tsx`.
- [ ] Run -> PASS; checks; hand check in the pane with one seeded row via the dev server's Supabase (ask Gur first; or test against `fakeDb` only and leave the pane check to Gur); `git add lib/artifacts/things.ts lib/artifacts/things.test.ts components/osmo/things-made.tsx components/osmo/insights-panel.tsx app/assistant.tsx`; COMMIT `feat(insights): Things I made, with Open and Delete`.

### Task B11 [main]: Settings level, the privacy line, keys and docs (spec 12 Asks)

**Files:** Modify `components/osmo/connectors-settings.tsx`, `brain/project.md` (Keys, tables, `/api/build` and `/api/artifacts` entries), `brain/lanes.md`, `brain/desks/main.md`, `.env.example`.

- [ ] `connectors-settings.tsx`: add `{ id: "artifacts", name: "Building things" }` to `CONNECTORS`, with a per-connector allowed-levels list: `artifacts` offers Off and Act only (a held "Ask" would route the yes through `/api/act`, which does not carry the ticket; phase C can add it). Add one line under it, verbatim: `Osmo writes what he builds with an OpenAI model. It is sent your request, and your earlier version when you ask for a change, and nothing else about you.` Hand check in the pane (read-only: do not press anything on Gur's real settings; look at the rendered rows only).
- [ ] `project.md`: Keys row `OSMO_BUILD` (server only; exactly `on` enables `/api/build` and `/api/artifacts`; also needs `OSMO_CHAT=on`, `OSMO_ACTIONS=on`, the `artifacts` level `act`); tables row `artifacts`; Interfaces: the ticket seam and `buildGate`. `lanes.md` (main keeps it): add "`app/api/build/**` and `lib/chat/build-*.ts`, `lib/chat/openai-stream.ts` are language's; `app/api/artifacts/**` and `lib/artifacts/*` are main's" (spec 12). `.env.example`: `OSMO_BUILD=` with a comment. Push the brain (`git -C brain push origin brain`).
- [ ] `git add .env.example components/osmo/connectors-settings.tsx`; COMMIT `feat(settings): the Building things level and its privacy line`; commit the brain files in the brain repo separately, staged by path.

### Task B12 [STOP, Gur; main]: Phase B gate

- [ ] Language's B5 to B8 and the connectors 0.7 to 0.13 are on local `main`; `npx vitest run`, `tsc`, `lint`, `npm run build` green; with `OSMO_BUILD` unset every route answers `off` and the room is unchanged (hand check).
- [ ] **What Gur does:** says go for the probe (A7) and reads its numbers; says OK for migration B2; types `OSMO_BUILD=on` and `OSMO_ACTIONS=on` into `.env.local` (and later Vercel Production), then sets "Building things" to Act in Settings; asks Osmo "make me a tip splitter" and checks: sketch within about 3 s, a working thing in 10 to 25 s, Keep/Discard, the Insights row, Delete; checks the 31st-build refusal is not worth testing by hand (unit tests cover it). Confirms `maxDuration = 60` streams unbuffered on his Vercel plan on the first preview deploy (spec 15.5).
- [ ] Main checks every desk for "not ready to ship"; push only with Gur's OK. Cloud reviews the sandbox, the bridge and the RLS after the push. Then write the phase C plan (animation in full, `from` and `things` list, Earlier versions, Repair, "Ask" level support, Insights empty state).

---

## Self-review (spec coverage)

- Spec 3 flow: A1/A6 (prompt, compile), B3 (ticket), B7 (stream), B1/B9 (outline, panel), B4 (save, log row), failure table lines in B1 `LINES`. Spec 4: A2, A3, A4, A5 (hostile hand check). Spec 5: A1, A6. Spec 7: B2, B4. Spec 8: B9, B10 (versions and `from` deferred to C). Spec 9: guest 400 in B4/B7, crisis abort in B7/B8. Spec 10: B5 to B7, cap in B3. Spec 13: tests are in each task; the real-browser hostile suite is the A5/A8 hand table (no Playwright dependency added; vitest cannot run a frame).
- Names used across tasks: `LIMITS`, `compileSource`, `cleanOutput`, `checkSource` (A1) -> A5, A7, B1, B3, B4; `buildFramePage`, `SANDBOX`, `Aura` (A2) -> A5, B9; `acceptMessage`, `clampHeight` (A3) -> A5; `RUNTIME_PATH` (A4) -> A5; `BuildLine`, `createLineReader`, `ThingView`, `runBuild`, `singleFlight`, `LINES`, `cleanTitle` (B1) -> B4, B7, B9; `BuildTicket`, `buildGate`, `capReached` (B3) -> B7, B8, B9; `reserveCall`, `owner` (B5) -> B7; `streamModel` (B6) -> B7; `buildPrompt`, `repairPrompt` (A6) -> A7, B7.
