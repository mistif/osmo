// The sky (spec 2, three stops since the look pass): a gradient from the mood's two aura colours, zenith to a mid
// band to a horizon band that warms at dawn and dusk, shifted by Gur's clock through dawn, day, dusk and night; the sun
// (his heart) by the hour; stars at night; two layers of drifting clouds. Pure.
import { CLOUD_SHAPES } from "./backdrop";
import { parseHsl } from "./raster";

export type Hsl = [number, number, number];
export type SkyPhase = "dawn" | "day" | "dusk" | "night";

const wrap = (hour: number) => ((hour % 24) + 24) % 24;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const hourOf = (d: Date): number => d.getHours() + d.getMinutes() / 60;
export const isNight = (hour: number): boolean => wrap(hour) >= 21 || wrap(hour) < 5;
export function phaseOf(hour: number): SkyPhase {
	const h = wrap(hour);
	if (h >= 5 && h < 7) return "dawn";
	if (h >= 7 && h < 19) return "day";
	if (h >= 19 && h < 21) return "dusk";
	return "night";
}
// 0 at night, 1 by day, ramping 05:00 to 07:00 and 19:00 to 21:00.
export function daylight(hour: number): number {
	const h = wrap(hour);
	if (h < 5 || h >= 21) return 0;
	if (h < 7) return (h - 5) / 2;
	if (h < 19) return 1;
	return (21 - h) / 2;
}
// 1 at sunrise (06:00) and sunset (20:00), 0 an hour and a half away.
export function warmth(hour: number): number {
	const h = wrap(hour);
	return clamp01(1 - Math.min(Math.abs(h - 6), Math.abs(h - 20)) / 1.5);
}

// Lightness, in %, at night and by day. The top stays dark enough for the room's Bone text at the lightest hour
// (lib/shell/contrast.test.ts proves it); lower SKY_TOP_L.day if that test ever fails, never below 20.
export const SKY_TOP_L = { night: 6, day: 26 };
export const SKY_BOTTOM_L = { night: 10, day: 40 };
const MAX_SAT = 55;
const DUSK_HUE = 24;
const CALM_A: Hsl = [172, 38, 50];
const CALM_B: Hsl = [212, 38, 50];

const mixHue = (from: number, to: number, t: number) => {
	const diff = ((to - from + 540) % 360) - 180;
	return (from + diff * t + 360) % 360;
};

// top: the zenith; mid: the band half way down, between the two hues; bottom: the horizon band, warmed toward dusk orange
// around sunrise and sunset. Lightness rises from the top to the horizon, all inside the caps above.
export type Sky = { top: Hsl; mid: Hsl; bottom: Hsl; stars: number };
export const SKY_STOPS = { mid: 0.45, horizon: 0.8 }; // where the mid and horizon bands sit, as a share of the height
export function skyAt(colorA: string, colorB: string, hour: number): Sky {
	const a = parseHsl(colorA) ?? CALM_A;
	const b = parseHsl(colorB) ?? CALM_B;
	const d = daylight(hour);
	const w = warmth(hour);
	const topL = lerp(SKY_TOP_L.night, SKY_TOP_L.day, d);
	const bottomL = lerp(SKY_BOTTOM_L.night, SKY_BOTTOM_L.day, d);
	return {
		top: [Math.round(a[0]), Math.round(Math.min(a[1], MAX_SAT)), Math.round(topL)],
		mid: [
			Math.round(mixHue(a[0], b[0], 0.5)),
			Math.round(Math.min((a[1] + b[1]) / 2, MAX_SAT)),
			Math.round(lerp(topL, bottomL, 0.55) + w * 2),
		],
		bottom: [Math.round(mixHue(b[0], DUSK_HUE, w * 0.7)), Math.round(Math.min(b[1], MAX_SAT)), Math.round(bottomL + w * 4)],
		stars: clamp01((0.35 - d) / 0.35),
	};
}
export const hslCss = ([h, s, l]: Hsl): string => `hsl(${h} ${s}% ${l}%)`;
// The sky's colour a share of the way down it, between its stops, as drawn.
export function skyHslAt(sky: Sky, at: number): Hsl {
	const stops: [number, Hsl][] = [[0, sky.top], [SKY_STOPS.mid, sky.mid], [SKY_STOPS.horizon, sky.bottom]];
	const k = clamp01(at);
	let i = 0;
	while (i < stops.length - 2 && k > stops[i + 1][0]) i++;
	const [a0, c0] = stops[i];
	const [a1, c1] = stops[i + 1];
	const t = clamp01((k - a0) / (a1 - a0));
	return [mixHue(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
}

// Fractions of the sky's width and height. Up from 06:00 to 20:00 on an arc, highest at 13:00; otherwise a dim
// heart low in the middle, behind the island and the castle.
export type Sun = { fx: number; fy: number; up: boolean };
export function sunAt(hour: number): Sun {
	const t = (wrap(hour) - 6) / 14;
	if (t < 0 || t > 1) return { fx: 0.5, fy: 0.62, up: false };
	return { fx: 0.12 + 0.76 * t, fy: 0.6 - 0.45 * Math.sin(Math.PI * t), up: true };
}

export type Star = { fx: number; fy: number; big: boolean };
// The same stars every night: a small fixed random sequence.
export function starField(count = 48, seed = 7): Star[] {
	let s = seed >>> 0;
	const next = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
	return Array.from({ length: count }, () => ({ fx: next(), fy: next() * 0.55, big: next() < 0.15 }));
}

// The clouds: big soft shapes from the cloud sheet (backdrop.ts), in two layers. x, y in world px of the shape's cell's
// top-left; layer 0 is far (slow, little parallax, drawn fainter), 1 is near. They drift right and wrap round
// CLOUD_SPAN, wider than any view, so a layer's spacing never changes; the renderer draws each cloud again one span
// over wherever the view needs it.
export type Cloud = { shape: number; x: number; y: number; layer: 0 | 1 };
export const CLOUD_SPEED = [3, 7] as const; // world px per second
export const PARALLAX = [0.3, 0.6] as const;
export const CLOUD_SPAN = 2048;
// World y from -320 (seen only on a tall view) to 470 (below the island's snow at 416, behind its underside): every
// view has clouds in its sky, and a few drift below the island so it reads as floating.
export const CLOUDS: readonly Cloud[] = [
	{ shape: 2, x: 40, y: 150, layer: 0 },
	{ shape: 3, x: 300, y: -250, layer: 0 },
	{ shape: 5, x: 520, y: 40, layer: 0 },
	{ shape: 1, x: 760, y: 380, layer: 0 },
	{ shape: 4, x: 1010, y: -120, layer: 0 },
	{ shape: 3, x: 1260, y: 230, layer: 0 },
	{ shape: 0, x: 1500, y: 10, layer: 0 },
	{ shape: 2, x: 1780, y: 420, layer: 0 },
	{ shape: 3, x: 880, y: 90, layer: 0 },
	{ shape: 5, x: 1640, y: 280, layer: 0 },
	{ shape: 0, x: 60, y: 30, layer: 1 },
	{ shape: 1, x: 420, y: 250, layer: 1 },
	{ shape: 4, x: 760, y: -280, layer: 1 },
	{ shape: 5, x: 980, y: 110, layer: 1 },
	{ shape: 3, x: 1300, y: 440, layer: 1 },
	{ shape: 1, x: 1560, y: 190, layer: 1 },
	{ shape: 2, x: 1840, y: -150, layer: 1 },
	{ shape: 3, x: 250, y: 330, layer: 1 },
	{ shape: 3, x: 1140, y: -40, layer: 1 },
	{ shape: 5, x: 1720, y: 360, layer: 1 },
];
export const cloudWidth = (c: Cloud): number => CLOUD_SHAPES[c.shape].x1;
// Drifting right, wrapping round the span.
export function cloudX(c: Cloud, clockMs: number, span = CLOUD_SPAN): number {
	const moved = c.x + (CLOUD_SPEED[c.layer] * clockMs) / 1000;
	return ((moved % span) + span) % span;
}
