// The sky (spec 2): a gradient from the mood's two aura colours, shifted by Gur's clock through dawn, day, dusk and
// night; the sun (his heart) by the hour; stars at night; two layers of drifting clouds. Pure.
import { TILE } from "./blueprints/types";
import { parseHsl } from "./raster";
import type { TileId } from "./tiles";

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

export type Sky = { top: Hsl; bottom: Hsl; stars: number };
export function skyAt(colorA: string, colorB: string, hour: number): Sky {
	const a = parseHsl(colorA) ?? CALM_A;
	const b = parseHsl(colorB) ?? CALM_B;
	const d = daylight(hour);
	const w = warmth(hour);
	return {
		top: [Math.round(a[0]), Math.round(Math.min(a[1], MAX_SAT)), Math.round(lerp(SKY_TOP_L.night, SKY_TOP_L.day, d))],
		bottom: [Math.round(mixHue(b[0], DUSK_HUE, w * 0.6)), Math.round(Math.min(b[1], MAX_SAT)), Math.round(lerp(SKY_BOTTOM_L.night, SKY_BOTTOM_L.day, d) + w * 4)],
		stars: clamp01((0.35 - d) / 0.35),
	};
}
export const hslCss = ([h, s, l]: Hsl): string => `hsl(${h} ${s}% ${l}%)`;

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

type Part = { tile: TileId; dx: number; dy: number };
// x, y in world px of the cloud's left cell; layer 0 is far (slow, little parallax), 1 is near.
export type Cloud = { parts: readonly Part[]; x: number; y: number; layer: 0 | 1 };
export const CLOUD_SPEED = [3, 7] as const; // world px per second
export const PARALLAX = [0.3, 0.6] as const;
const long = (middles: number, top = 0): Part[] => {
	const parts: Part[] = [{ tile: "cloud-l", dx: 0, dy: 0 }];
	for (let i = 1; i <= middles; i++) parts.push({ tile: "cloud-m", dx: i * TILE, dy: 0 });
	parts.push({ tile: "cloud-r", dx: (middles + 1) * TILE, dy: 0 });
	if (top >= 1 && top <= middles) parts.push({ tile: "cloud-top", dx: top * TILE, dy: -TILE });
	return parts;
};
const small: Part[] = [{ tile: "cloud-small", dx: 0, dy: 0 }];
export const CLOUDS: readonly Cloud[] = [
	{ parts: long(2, 1), x: 40, y: 80, layer: 0 },
	{ parts: small, x: 400, y: 48, layer: 0 },
	{ parts: long(1), x: 700, y: 112, layer: 0 },
	{ parts: long(3, 2), x: 150, y: 144, layer: 1 },
	{ parts: long(2), x: 560, y: 64, layer: 1 },
	{ parts: small, x: 900, y: 168, layer: 1 },
];
export const cloudWidth = (c: Cloud): number => Math.max(...c.parts.map((p) => p.dx)) + TILE;
// Drifting right, wrapping round the world's width plus the cloud's own.
export function cloudX(c: Cloud, clockMs: number, span: number): number {
	const w = cloudWidth(c);
	const loop = span + w;
	const moved = c.x + w + (CLOUD_SPEED[c.layer] * clockMs) / 1000;
	return (((moved % loop) + loop) % loop) - w;
}
