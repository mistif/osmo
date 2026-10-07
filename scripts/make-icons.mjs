// Renders Osmo's app icons from one inline SVG: the heart with three dashed rings, in the room's
// colours (see components/osmo/figure.tsx). Run once: node scripts/make-icons.mjs
// sharp is not a dependency of its own; it comes with next, so it is resolved through next.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromNext = createRequire(join(root, "node_modules", "next", "package.json"));
const sharp = requireFromNext("sharp");

const BASE = "#0d0f14";
const AURA_A = "#4fb0a1"; // hsl(172 38% 50%): the room's first aura
const AURA_B = "#4f80b0"; // hsl(212 38% 50%): the second
const RING = "#9fd9cf"; // aura A mixed toward white, as the rings are drawn

// scale 1 fills the canvas; the maskable icon draws the same art at 0.7 inside a full-bleed background.
function svg(size, scale) {
	const ring = (rx, ry, turn, dash, width) =>
		`<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" transform="rotate(${turn})" fill="none" stroke="${RING}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${dash}" opacity="0.85"/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs>
<radialGradient id="a" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#d4f0ea"/><stop offset="0.55" stop-color="${AURA_A}" stop-opacity="0.85"/><stop offset="1" stop-color="${AURA_A}" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="60%" cy="60%" r="65%"><stop offset="0" stop-color="#d0e2f2"/><stop offset="0.55" stop-color="${AURA_B}" stop-opacity="0.85"/><stop offset="1" stop-color="${AURA_B}" stop-opacity="0"/></radialGradient>
<radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${AURA_A}" stop-opacity="0.32"/><stop offset="1" stop-color="${AURA_A}" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="512" height="512" fill="${BASE}"/>
<g transform="translate(256 256) scale(${scale})">
<circle r="250" fill="url(#g)"/>
<g filter="url(#soft)" opacity="0.95">
<path d="M0 -92 C70 -150 150 -90 118 -10 C100 40 40 80 0 108 C-40 80 -100 40 -118 -10 C-150 -90 -70 -150 0 -92 Z" fill="url(#a)"/>
<path d="M0 -70 C52 -110 118 -66 94 -4 C78 34 30 62 0 84 C-30 62 -78 34 -94 -4 C-118 -66 -52 -110 0 -70 Z" fill="url(#b)" opacity="0.8" transform="rotate(-12)"/>
</g>
<g filter="url(#soft)" opacity="0.55"><ellipse rx="150" ry="150" fill="none" stroke="${AURA_A}" stroke-width="10"/></g>
${ring(150, 70, -18, "10 9", 5)}
${ring(190, 94, 38, "34 20", 5)}
${ring(222, 108, 72, "4 16", 6)}
</g>
</svg>`;
}

const out = (...p) => join(root, ...p);
mkdirSync(out("public", "icons"), { recursive: true });

const render = (size, scale, file) => sharp(Buffer.from(svg(size, scale))).png().toFile(file);
await render(192, 1, out("public", "icons", "icon-192.png"));
await render(512, 1, out("public", "icons", "icon-512.png"));
await render(512, 0.7, out("public", "icons", "icon-maskable-512.png"));
await render(180, 1, out("app", "apple-icon.png"));
console.log("icons written");
