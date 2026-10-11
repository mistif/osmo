import { describe, expect, it } from "vitest";
import { checkSource, cleanOutput, compileSource, forbiddenWord, LIMITS, visibleBang } from "./compile";

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
	it.each(["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCRtpSender", "WebTransport", "mediaDevices"])("forbids %s", (w) => {
		expect(forbiddenWord(`const a = new ${w}();`)).toBe(w);
	});
	it("tolerates whitespace before the parenthesis of import( and Function(", () => {
		expect(forbiddenWord("const a = import  (\"x\");")).toBe("import(");
		expect(forbiddenWord("const a = import\n(\"x\");")).toBe("import(");
		expect(forbiddenWord("const f = new Function \t(\"return 1\");")).toBe("Function(");
		expect(forbiddenWord("const f = Function\n(\"return 1\");")).toBe("Function(");
	});
	it("refuses a re-export from anything but react", () => {
		const tail = `\nexport default function A(){return null}`;
		for (const bad of [`export * from "lodash";`, `export * as x from "lodash";`, `export { a } from "./x";`, `export{a,b}from'x';`, `export  *  from  "x";`]) expect(checkSource(bad + tail).ok, bad).toBe(false);
		expect(checkSource(`export { useState } from "react";${tail}`).ok).toBe(true);
	});
	it("does not flag words inside longer words", () => expect(forbiddenWord("const desktop = prefetcher; relocation")).toBeNull());
	it("rejects other imports, odd names, namespace imports, missing or double default, required props", () => {
		for (const bad of [`import x from "lodash";\nexport default function A(){return null}`, `import { createPortal } from "react";\nexport default function A(){return null}`, `import * as R from "react";\nexport default function A(){return null}`, `const A = () => null;`, `export default function A(){return null}\nexport default function B(){return null}`, `export default function A(props){return null}`]) expect(checkSource(bad).ok).toBe(false);
		expect(checkSource(`import React, { useState as s, memo } from "react";\nexport default function A(){return null}`).ok).toBe(true);
	});
});
const wrap = (body: string) => `export default function A() {\n${body}\n}\n`;
describe("visible exclamation marks", () => {
	const bad: [string, string, string][] = [
		["a JSX text node", wrap("\treturn <p>Time is up!</p>;"), "Time is up!"],
		["JSX text in a fragment after an element", wrap("\treturn <><b>ok</b> done!</>;"), "done!"],
		["a string prop", wrap('\treturn <button title="Go now!">x</button>;'), "Go now!"],
		["a string in braces", wrap('\treturn <p>{"Wow!"}</p>;'), "Wow!"],
		["a template literal", wrap("\tconst n = 2;\n\treturn <p>{`${n} left!`}</p>;"), "left!"],
		["a template literal after a substitution", wrap('\treturn <p>{`${[1, 2].map((x) => `${x}`).join(",")}!`}</p>;'), "!"],
		["a string inside an array", wrap("\tconst labels = [\"Start\", 'Time is up!'];\n\treturn <p>{labels[1]}</p>;"), "Time is up!"],
		["an escaped quote before the mark", wrap('\treturn <p>{"say \\"hi\\"!"}</p>;'), "hi"],
	];
	it.each(bad)("rejects %s", (_n, src, snippet) => {
		expect(visibleBang(src)).toContain(snippet);
		const r = checkSource(src);
		expect(!r.ok && r.error.startsWith("Visible text has an exclamation mark:") && r.error.length <= LIMITS.repairErrorChars).toBe(true);
	});
	it("names the first offending snippet in the error", () => {
		const r = checkSource(wrap('\treturn <p>{"a"}<i>Time is up!</i><b>Late!</b></p>;'));
		expect(r).toEqual({ ok: false, error: 'Visible text has an exclamation mark: "Time is up!". Remove it.' });
	});
	it.each([
		["!==", "const a = 1; const b = a !== 2;"],
		["!=", "const a = 1; const b = a != 2;"],
		["!flag", "const flag = false; const b = !flag;"],
		["!(a && b)", "const a = 1, b = 2; const c = !(a && b);"],
		["a double negation", "const c = !!window;"],
		["a line comment", "// Time is up!\nconst a = 1;"],
		["a block comment", "/* Time is up! */ const a = 1;"],
		["a JSX comment", "const a = <p>{/* Time is up! */}ok</p>;"],
		["a regex literal", 'const re = /!/; const ok = re.test("x");'],
		["a regex with a class and an escaped slash", "const re = /[!/]\//g;"],
		["a quote in a comment", "// don't\nconst a = <p>fine</p>;"],
		["an apostrophe in JSX text", "const a = <p>Don't stop</p>;"],
		["a comparison and a generic", "const [n] = useState<number>(0); const b = n < 3 && n > 1;"],
		["!important in a style string", 'const s = { color: "red !important" };'],
		["a non-null assertion", "const a = el!.value; const b = els[0]!;"],
	])("accepts %s", (_n, line) => {
		expect(visibleBang(wrap(line))).toBeNull();
	});
	it("accepts a clean component with operators inside JSX braces", () => {
		const src = `import { useState } from "react";\nexport default function A() {\n\tconst [on, setOn] = useState(false);\n\treturn <button onClick={() => setOn(!on)} disabled={on !== false && !(on)}>{!on ? "Start" : "Stop"}</button>;\n}\n`;
		expect(checkSource(src)).toEqual({ ok: true });
	});
	it("is skipped when the checks are skipped", async () => {
		expect((await compileSource(wrap("\treturn <p>Hi!</p>;"))).ok).toBe(false);
		expect((await compileSource(wrap("\treturn <p>Hi!</p>;"), { check: false })).ok).toBe(true);
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
