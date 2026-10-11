import { describe, expect, it } from "vitest";
import { FRAME_STYLES } from "./frame-styles";
import { buildFramePage, cspFor, IFRAME_ALLOW, newNonce, safeColor, SANDBOX } from "./frame";

const NONCE = "0123456789abcdef0123456789abcdef";
const RUNTIME = "https://osmo.test/artifact/runtime.0123456789.js";
const AURA = { a: "hsl(172 38% 50%)", b: "hsl(212 38% 50%)", bg: "#0c111b", ink: "#f3efe8" };
const page = (over: Partial<Parameters<typeof buildFramePage>[0]> = {}) => buildFramePage({ nonce: NONCE, runtimeUrl: RUNTIME, code: "exports.default = function A(){ return null };", aura: AURA, ...over });

describe("cspFor", () => {
	it("is exactly the policy in the plan", () => {
		expect(cspFor("abc")).toBe("default-src 'none'; script-src 'nonce-abc'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'");
	});
});
describe("the sandbox", () => {
	it("allows scripts only and never the same origin", () => {
		expect(SANDBOX).toBe("allow-scripts");
		expect(SANDBOX).not.toContain("allow-same-origin");
		expect(IFRAME_ALLOW).toBe("");
		expect(page()).not.toContain("allow-same-origin");
	});
});
describe("buildFramePage", () => {
	it("puts the policy before any script and nonces exactly two script tags", () => {
		const html = page();
		expect(html.indexOf("Content-Security-Policy")).toBeGreaterThan(-1);
		expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
		expect(html).toContain(`content="${cspFor(NONCE)}"`);
		const tags = html.match(/<script[^>]*>/g) ?? [];
		expect(tags).toHaveLength(2);
		for (const t of tags) expect(t).toContain(`nonce="${NONCE}"`);
		expect(tags[0]).toContain(`src="${RUNTIME}"`);
		expect(tags[1]).not.toContain("src=");
	});
	it("writes the aura as variables", () => {
		const html = page();
		expect(html).toContain("--osmo-a:hsl(172 38% 50%)");
		expect(html).toContain("--osmo-bg:#0c111b");
	});
	it("refuses a runtime url that is not the runtime file on https or localhost", () => {
		for (const bad of ["https://evil.test/x.js", "javascript:1", `${RUNTIME}"><script`, "http://osmo.test/artifact/runtime.0123456789.js"]) {
			expect(() => page({ runtimeUrl: bad })).toThrow();
		}
		expect(() => page({ runtimeUrl: "http://localhost:3000/artifact/runtime.0123456789.js" })).not.toThrow();
	});
	it("refuses code that could close the script tag", () => {
		expect(() => page({ code: "a </ScRiPt><b>" })).toThrow();
		expect(() => page({ code: "a <!-- b" })).toThrow();
	});
	it("refuses a bad nonce", () => {
		expect(() => page({ nonce: "short" })).toThrow();
		expect(() => page({ nonce: `${NONCE.slice(0, 31)}"` })).toThrow();
	});
});
describe("safeColor", () => {
	it("passes real colours and drops anything else", () => {
		expect(safeColor("red;}body{display:none", "#000")).toBe("#000");
		expect(safeColor("hsl(172 38% 50%)", "#000")).toBe("hsl(172 38% 50%)");
		expect(safeColor("#0c111b", "#000")).toBe("#0c111b");
	});
});
describe("newNonce", () => {
	it("is 32 hex characters from the random source", () => {
		expect(newNonce(() => new Uint8Array(16).fill(255))).toBe("ff".repeat(16));
	});
	it("differs between calls", () => {
		expect(newNonce()).not.toBe(newNonce());
		expect(newNonce()).toMatch(/^[0-9a-f]{32}$/);
	});
});

describe("buildFramePage with the runtime inlined (dev, and any page that is not https)", () => {
	const TEXT = "window.__osmoDefine = function(){};";
	const inline = (over: Partial<Parameters<typeof buildFramePage>[0]> = {}) => buildFramePage({ nonce: NONCE, runtimeText: TEXT, code: "exports.default = 1;", aura: AURA, ...over });
	it("keeps the same policy and exactly two nonced script tags, the first without an address", () => {
		const html = inline();
		expect(html).toContain(`content="${cspFor(NONCE)}"`);
		const tags = html.match(/<script[^>]*>/g) ?? [];
		expect(tags).toEqual([`<script nonce="${NONCE}">`, `<script nonce="${NONCE}">`]);
		expect(html.indexOf(TEXT)).toBeLessThan(html.indexOf("__osmoDefine(function"));
	});
	it("needs exactly one of the address or the text", () => {
		expect(() => buildFramePage({ nonce: NONCE, code: "x", aura: AURA })).toThrow();
		expect(() => buildFramePage({ nonce: NONCE, runtimeUrl: RUNTIME, runtimeText: TEXT, code: "x", aura: AURA })).toThrow();
	});
	it("refuses runtime text that could close the script tag", () => {
		expect(() => inline({ runtimeText: "a </script><b>" })).toThrow();
		expect(() => inline({ runtimeText: "a <!-- b" })).toThrow();
	});
});

describe("the frame's base stylesheet", () => {
	it("sits in one style block with the one-use nonce, after the variables and before the body", () => {
		const html = page();
		const blocks = html.match(/<style[^>]*>/g) ?? [];
		expect(blocks).toEqual([`<style nonce="${NONCE}">`]);
		expect(html).toContain(`:root{--osmo-a:hsl(172 38% 50%);`);
		expect(html).toContain(FRAME_STYLES);
		expect(html.indexOf("--osmo-a:")).toBeLessThan(html.indexOf(FRAME_STYLES));
		expect(html.indexOf(FRAME_STYLES)).toBeLessThan(html.indexOf("<body>"));
		expect(buildFramePage({ nonce: NONCE, runtimeText: "x", code: "y", aura: AURA })).toContain(FRAME_STYLES);
	});
	it("is plain ASCII, small, and refers to nothing outside the frame", () => {
		expect([...FRAME_STYLES].every((c) => c === "\n" || (c >= " " && c <= "~"))).toBe(true);
		expect(Buffer.byteLength(FRAME_STYLES)).toBeLessThan(3072);
		for (const outside of ["url(", "@import", "@font-face", "http:", "https:", "//"]) expect(FRAME_STYLES.toLowerCase(), outside).not.toContain(outside);
	});
	it("styles the page, the controls, the scrollbars and reduced motion from the four colours", () => {
		for (const part of ["color-scheme:dark", "var(--osmo-bg)", "var(--osmo-ink)", "scrollbar-width:thin", "::-webkit-scrollbar", ":focus-visible", "accent-color:var(--osmo-a)", "prefers-reduced-motion:reduce", "::selection", "ui-sans-serif,system-ui"]) {
			expect(FRAME_STYLES, part).toContain(part);
		}
		expect(FRAME_STYLES.split("{").length).toBe(FRAME_STYLES.split("}").length);
	});
	it("leaves the policy alone: no nonce or other source added for styles", () => {
		expect(cspFor(NONCE)).toContain("style-src 'unsafe-inline';");
	});
});
