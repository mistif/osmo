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
		expect(checkSource(pad(0) + "\u00e9".repeat(LIMITS.sourceBytes / 2)).ok).toBe(false);
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
