// Life in the world (the polish pass): light snow at night, one or two birds crossing the sky by day, smoke from the
// workshop's chimney, and a small puff of dust when a block lands. Every particle is a pure function of the clock;
// the only thing the world keeps between frames is the last block that landed. So any frame can be drawn at any time,
// the tests can pin it, and a hidden tab (no frames) costs nothing. The caps are hard: no frame holds more than
// MAX_PARTICLES. Under reduced motion there is none of it (spec 2: still frames).
//
// Snow and smoke come in spells, so the loop can fall back to its 3 s tick between them (spec 2's redraw rules):
// while any of this is on screen the loop runs at AMBIENT_MS (pace.ts), or at frame pace for the dust.
import { WORKSHOP } from "./blueprints/workshop";
import { TILE, type Block } from "./blueprints/types";

export const SNOW_MAX = 40;
export const SMOKE_MAX = 6;
export const BIRDS_MAX = 2;
export const DUST_MAX = 6;
export const MAX_PARTICLES = SNOW_MAX + SMOKE_MAX + BIRDS_MAX + DUST_MAX;

// Screen px for snow and birds (they belong to the sky, not to a place); world px for smoke and dust.
export type Flake = { x: number; y: number; size: number; alpha: number };
export type Bird = { x: number; y: number; frame: 0 | 1; flip: boolean };
export type Puff = { x: number; y: number; r: number; alpha: number };
export type Mote = { x: number; y: number; size: number; alpha: number };
// The block that landed last and when (the loop's clock, ms).
export type Landing = { block: Block; at: number };
export type Life = { snow: readonly Flake[]; birds: readonly Bird[]; smoke: readonly Puff[]; dust: readonly Mote[]; pop: Block | null };
export const NO_LIFE: Life = { snow: [], birds: [], smoke: [], dust: [], pop: null };

// A fixed hash of an integer and a salt, in 0..1.
function hash(n: number, salt: number): number {
	let h = Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt + 0x51ed, 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
	h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

// --- Snow: at night, in spells of SNOW_ON_MS every SNOW_CYCLE_MS (the first and last SNOW_RAMP_MS of a spell thin
// out), up to SNOW_MAX flakes falling and swaying across the whole view, wrapping from the bottom to the top. ---
export const SNOW_CYCLE_MS = 120_000;
export const SNOW_ON_MS = 45_000;
export const SNOW_RAMP_MS = 6_000;
export function snowShare(wallMs: number): number {
	const p = mod(wallMs, SNOW_CYCLE_MS);
	if (p >= SNOW_ON_MS) return 0;
	return Math.min(1, p / SNOW_RAMP_MS, (SNOW_ON_MS - p) / SNOW_RAMP_MS);
}
export function snowAt(wallMs: number, view: { w: number; h: number }, scale: number, share: number): Flake[] {
	const count = Math.min(SNOW_MAX, Math.round(SNOW_MAX * Math.min(1, Math.max(0, share))));
	if (count === 0 || view.w <= 0 || view.h <= 0) return [];
	const k = Math.max(1, Math.round(scale));
	const t = wallMs / 1000;
	const out: Flake[] = [];
	for (let i = 0; i < count; i++) {
		const big = i % 5 === 0;
		const fall = (14 + 12 * hash(i, 1)) * k; // px a second
		const span = view.h + 8 * k;
		const y = mod(t * fall + hash(i, 2) * span, span) - 4 * k;
		const sway = Math.sin((t * 2 * Math.PI) / (3 + 2 * hash(i, 3)) + hash(i, 4) * 6.283) * 5 * k;
		const x = mod(hash(i, 5) * view.w + t * 4 * k + sway, view.w);
		out.push({ x: Math.round(x), y: Math.round(y), size: (big ? 2 : 1) * k, alpha: big ? 0.85 : 0.6 });
	}
	return out;
}

// --- Birds: by day, a flight every BIRD_CYCLE_MS at a time of its own within it, one or two birds crossing the view
// in BIRD_FLIGHT_MS, left to right or right to left, high in the sky, flapping and gliding. ---
export const BIRD_CYCLE_MS = 80_000;
export const BIRD_FLIGHT_MS = 16_000;
export function birdsAt(wallMs: number, view: { w: number; h: number }, scale: number, always = false): Bird[] {
	if (view.w <= 0 || view.h <= 0) return [];
	const k = Math.max(1, Math.round(scale));
	const n = Math.floor(wallMs / BIRD_CYCLE_MS);
	const start = always ? Math.floor(wallMs / BIRD_FLIGHT_MS) * BIRD_FLIGHT_MS : n * BIRD_CYCLE_MS + hash(n, 11) * (BIRD_CYCLE_MS - BIRD_FLIGHT_MS);
	const t = wallMs - start;
	if (t < 0 || t >= BIRD_FLIGHT_MS) return [];
	const seed = always ? Math.floor(wallMs / BIRD_FLIGHT_MS) : n;
	const leftward = hash(seed, 12) < 0.5;
	const two = hash(seed, 13) < 0.45;
	const fy = 0.1 + 0.18 * hash(seed, 14);
	const share = t / BIRD_FLIGHT_MS;
	const out: Bird[] = [];
	for (let b = 0; b < (two ? 2 : 1); b++) {
		const across = -12 * k + (view.w + 24 * k) * share - b * 14 * k;
		const x = leftward ? view.w - across : across;
		const y = fy * view.h + Math.sin(t / 420 + b * 1.7) * 2 * k + b * 6 * k;
		// Four wingbeats, then a glide of two.
		const beat = Math.floor(t / 170 + b * 2) % 6;
		out.push({ x: Math.round(x), y: Math.round(y), frame: beat < 4 ? ((beat % 2) as 0 | 1) : 0, flip: leftward });
	}
	return out.slice(0, BIRDS_MAX);
}

// --- Smoke: from the workshop's chimney once it is built, a puff every SMOKE_EVERY_MS during a spell of
// SMOKE_SPELL_MS in every SMOKE_CYCLE_MS; each rises, drifts east, grows and fades over SMOKE_LIFE_MS. ---
const chimneyRow = WORKSHOP.map.findIndex((r) => r.includes("T"));
// The chimney's cap (tile coordinates): the battlement over the workshop's chimney brick.
export const CHIMNEY = { x: WORKSHOP.x + WORKSHOP.map[chimneyRow].indexOf("T"), y: WORKSHOP.y + chimneyRow };
export const SMOKE_FROM = { x: (CHIMNEY.x + 0.5) * TILE, y: CHIMNEY.y * TILE + 3 }; // world px
export const chimneyLaid = (laid: readonly Block[]): boolean => laid.some((b) => b.x === CHIMNEY.x && b.y === CHIMNEY.y);
export const SMOKE_EVERY_MS = 1400;
export const SMOKE_SPELL_MS = 9_000;
export const SMOKE_CYCLE_MS = 30_000;
export const SMOKE_LIFE_MS = 5_600;
export function smokeAt(wallMs: number, always = false): Puff[] {
	const out: Puff[] = [];
	const first = Math.ceil((wallMs - SMOKE_LIFE_MS) / SMOKE_EVERY_MS);
	const last = Math.floor(wallMs / SMOKE_EVERY_MS);
	for (let k = first; k <= last; k++) {
		const born = k * SMOKE_EVERY_MS;
		if (!always && mod(born, SMOKE_CYCLE_MS) >= SMOKE_SPELL_MS) continue;
		const age = (wallMs - born) / 1000;
		const life = SMOKE_LIFE_MS / 1000;
		if (age < 0 || age >= life) continue;
		out.push({
			x: SMOKE_FROM.x + age * 5 + Math.sin(age * 1.7 + k) * 1.5,
			y: SMOKE_FROM.y - age * 9,
			r: 2 + age * 1.1,
			alpha: 0.55 * (1 - age / life) * Math.min(1, age / 0.3),
		});
	}
	return out.slice(-SMOKE_MAX);
}

// --- A block lands: it pops (drawn a world pixel bigger all round) for POP_MS, and DUST_MAX motes of dust spring
// from its foot, three each way, and fall and fade over DUST_MS. ---
export const POP_MS = 100;
export const DUST_MS = 450;
export const popOf = (landing: Landing | null, now: number): Block | null =>
	landing && now >= landing.at && now - landing.at < POP_MS ? landing.block : null;
export function dustAt(landing: Landing | null, now: number): Mote[] {
	if (!landing) return [];
	const age = (now - landing.at) / 1000;
	if (!(age >= 0 && age < DUST_MS / 1000)) return [];
	const foot = { x: (landing.block.x + 0.5) * TILE, y: (landing.block.y + 1) * TILE - 1 };
	const out: Mote[] = [];
	for (let j = 0; j < DUST_MAX; j++) {
		const side = j < DUST_MAX / 2 ? -1 : 1;
		const n = j % 3;
		const vx = side * (14 + 10 * n);
		const vy = -(10 + 6 * n);
		out.push({
			x: foot.x + side * (4 + 2 * n) + vx * age,
			y: foot.y + vy * age + 30 * age * age,
			size: n === 0 ? 2 : 1, // world px
			alpha: 0.7 * (1 - age / (DUST_MS / 1000)),
		});
	}
	return out;
}

// Everything alive in one frame. day: full daylight (birds); night: dark enough for snow; chimney: the workshop's
// chimney cap is laid; motion: false under reduced motion (nothing at all). force (the dev page): "all" keeps snow,
// smoke and birds going whatever the hour or spell, "none" turns them off.
export type LifeInput = {
	wallMs: number;
	now: number;
	view: { w: number; h: number };
	scale: number;
	day: boolean;
	night: boolean;
	chimney: boolean;
	landing: Landing | null;
	motion: boolean;
	force?: "all" | "none";
};
export function lifeAt(o: LifeInput): Life {
	if (!o.motion) return NO_LIFE;
	const all = o.force === "all";
	const none = o.force === "none";
	return {
		snow: none || !(o.night || all) ? [] : snowAt(o.wallMs, o.view, o.scale, all ? 1 : snowShare(o.wallMs)),
		birds: none || !(o.day || all) ? [] : birdsAt(o.wallMs, o.view, o.scale, all),
		smoke: none || !o.chimney ? [] : smokeAt(o.wallMs, all),
		dust: dustAt(o.landing, o.now),
		pop: popOf(o.landing, o.now),
	};
}
export const particleCount = (l: Life): number => l.snow.length + l.birds.length + l.smoke.length + l.dust.length;
// What the life on screen asks of the loop: frames for a landing (short), the ambient pace for the rest, or nothing.
export function lifeWants(l: Life): "frames" | "ambient" | null {
	if (l.dust.length > 0 || l.pop !== null) return "frames";
	return l.snow.length + l.birds.length + l.smoke.length > 0 ? "ambient" : null;
}
