export const SANDBOX = "allow-scripts";
export const IFRAME_ALLOW = "";
export type Aura = { a: string; b: string; bg: string; ink: string };
export const cspFor = (nonce: string) =>
	["default-src 'none'", `script-src 'nonce-${nonce}'`, "style-src 'unsafe-inline'", "img-src data: blob:", "font-src data:", "media-src data: blob:", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'"].join("; ");
export const newNonce = (random: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)) => Array.from(random(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const COLOR = /^(#[0-9a-f]{3,8}|(hsl|rgb|oklch)a?\([\d\s.,%/-]+\))$/i;
export const safeColor = (v: string, fallback: string) => (COLOR.test(v.trim()) ? v.trim() : fallback);
const RUNTIME = /^(https:\/\/[\w.-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/artifact\/runtime\.[0-9a-f]{10}\.js$/;
// The runtime comes either by address (https, the normal case) or as text to inline (runtimeText). A page with an
// opaque origin counts as public to the browser, which then refuses a script from localhost or a private address,
// so the dev page and a local build inline the runtime. Either way it sits in a script tag with the one-use nonce.
const CLOSES_SCRIPT = /<[/]script|<!--/i;
export function buildFramePage(p: { nonce: string; runtimeUrl?: string; runtimeText?: string; code: string; aura: Aura }): string {
	if (!/^[0-9a-f]{32}$/.test(p.nonce)) throw new Error("bad nonce");
	if ((p.runtimeUrl === undefined) === (p.runtimeText === undefined)) throw new Error("give the runtime by address or as text, not both");
	if (p.runtimeUrl !== undefined && !RUNTIME.test(p.runtimeUrl)) throw new Error("bad runtime url");
	if (CLOSES_SCRIPT.test(p.code) || CLOSES_SCRIPT.test(p.runtimeText ?? "")) throw new Error("code cannot close the script tag");
	const runtimeTag = p.runtimeText === undefined ? `<script nonce="${p.nonce}" src="${p.runtimeUrl}"></script>` : `<script nonce="${p.nonce}">${p.runtimeText}</script>`;
	const { a, b, bg, ink } = p.aura;
	const vars = `--osmo-a:${safeColor(a, "#5fb3a8")};--osmo-b:${safeColor(b, "#5f8fb3")};--osmo-bg:${safeColor(bg, "#0c111b")};--osmo-ink:${safeColor(ink, "#f3efe8")}`;
	return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${cspFor(p.nonce)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars}}html,body{margin:0;background:var(--osmo-bg);color:var(--osmo-ink);font:16px/1.4 system-ui,sans-serif}</style></head><body><div id="root"></div>${runtimeTag}<script nonce="${p.nonce}">__osmoDefine(function(require,exports,module,React){${p.code}\n});</script></body></html>`;
}
