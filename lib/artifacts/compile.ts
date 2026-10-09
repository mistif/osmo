// Source checks and the JSX step. Imports nothing relative: scripts/build-probe.mjs loads this file in Node.
import { transform } from "sucrase";

export const LIMITS = { sourceBytes: 12_288, titleChars: 60, titleWords: 5, briefChars: 500, repairErrorChars: 300, perUser: 200, outputTokens: 4000, dailyBuilds: 30 } as const;
const ALLOWED_IMPORTS = ["useState", "useEffect", "useLayoutEffect", "useRef", "useMemo", "useCallback", "useReducer", "useContext", "useId", "useTransition", "useDeferredValue", "memo", "Fragment"] as const;
// Spec spec 5, plus "</script" and "<!--": the compiled code is embedded in an inline script tag (plan A2).
const FORBIDDEN = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCRtpSender", "WebTransport", "mediaDevices", "importScripts", "eval", "Function(", "import(", "window.top", "window.parent", "parent.", "top.", "document.cookie", "localStorage", "sessionStorage", "indexedDB", "location", "history", "postMessage", "navigator", "</script", "<!--"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A word ending in "(" tolerates whitespace before the parenthesis: Function (  and  import  (.
const body = (w: string) => (w.endsWith("(") ? `${esc(w.slice(0, -1))}\\s*\\(` : esc(w));
const SCAN = FORBIDDEN.map((w) => ({ w, re: new RegExp(`${/^\w/.test(w) ? "\\b" : ""}${body(w)}${/\w$/.test(w) ? "\\b" : ""}`, w.startsWith("<") ? "i" : "") }));
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
// export * from "x" and export { a } from "x" load a module just as import does.
const REEXPORT = /\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(["'])([^"']*)\1/g;
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
	for (const m of source.matchAll(REEXPORT)) {
		if (m[2] !== "react") return no(`Only react may be imported, not ${m[2].slice(0, 40)}.`);
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
