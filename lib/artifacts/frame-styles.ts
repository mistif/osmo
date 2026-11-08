// The base stylesheet inside the sealed frame, so a built thing looks like part of Osmo instead of browser defaults.
// It reads only the four variables frame.ts writes (--osmo-a, --osmo-b, --osmo-bg, --osmo-ink). The room's own font,
// Bricolage Grotesque, is a file the frame cannot load across its opaque origin (font-src allows data: only), so the
// stack here is a system one with a similar feel. No @import, no url(), no font loaded. A thing's own inline styles
// outrank every rule here, so a thing can still set whatever is specific to it.
const A = "var(--osmo-a)";
const mix = (c: string, pct: number) => `color-mix(in oklab,${c} ${pct}%,transparent)`;
const EDGE = `1px solid ${mix(A, 60)}`;
const PRESS = ":is(button,input[type=button],input[type=submit],input[type=reset])";
const FIELD = ":is(input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=file],[type=color],[type=image]),textarea,select)";

export const FRAME_STYLES = [
	"*,*::before,*::after{box-sizing:border-box;margin:0}",
	`*{scrollbar-width:thin;scrollbar-color:${mix(A, 45)} transparent}`,
	"html{color-scheme:dark;-webkit-text-size-adjust:100%}",
	// The padding is on body alone: on both it would add up to 32px.
	`html,body{background:var(--osmo-bg);color:var(--osmo-ink);font:15px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif;min-height:100%;overflow:auto}body{padding:16px}`,
	`::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}::-webkit-scrollbar-thumb{background:${mix(A, 45)};border-radius:999px}`,
	"button,input,select,textarea{font:inherit;color:inherit}",
	`${PRESS}{background:${mix(A, 22)};border:${EDGE};border-radius:999px;padding:8px 14px;cursor:pointer;transition:background .15s,transform .15s}`,
	`${PRESS}:hover:not(:disabled){background:${mix(A, 34)}}`,
	`${PRESS}:active:not(:disabled){background:${mix(A, 14)};transform:translateY(1px)}`,
	`${FIELD}{background:rgb(0 0 0/.28);border:${EDGE};border-radius:12px;padding:8px 12px}`,
	"textarea{resize:vertical}:disabled{opacity:.55;cursor:not-allowed}",
	`:focus-visible{outline:2px solid ${A};outline-offset:2px}`,
	`input[type=range],input[type=checkbox],input[type=radio]{accent-color:${A}}`,
	"h1,h2,h3{line-height:1.25;font-weight:600;letter-spacing:-.01em}h1{font-size:1.5rem}h2{font-size:1.25rem}h3{font-size:1.1rem}",
	"p,ul,ol,pre,table,h1,h2,h3{margin-bottom:.75em}",
	`a{color:${A};text-decoration:none}a:hover{text-decoration:underline}`,
	`code,pre{font:.9em/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:${mix(A, 12)};border-radius:6px}code{padding:.1em .35em}pre{padding:10px 12px;overflow:auto}pre code{padding:0;background:none}`,
	`table{border-collapse:collapse;width:100%}th,td{padding:6px 10px;text-align:left;border-bottom:1px solid ${mix("var(--osmo-ink)", 16)}}`,
	`hr{border:0;border-top:1px solid ${mix("var(--osmo-ink)", 20)};margin:1em 0}`,
	`::selection{background:${mix(A, 40)}}`,
	"@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}",
].join("\n");
