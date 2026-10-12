import { describe, expect, it } from "vitest";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { START_X } from "./blueprints";
import { TILE, type Block } from "./blueprints/types";
import { newCamera } from "./camera";
import {
	BIRD_CYCLE_MS, BIRD_FLIGHT_MS, BIRDS_MAX, birdsAt, CHIMNEY, chimneyLaid, DUST_MAX, DUST_MS, dustAt, HOME_CHIMNEY, HOME_SMOKE_FROM, lifeAt,
	lifeWants, MAX_PARTICLES, NO_LIFE, particleCount, POP_MS, popOf, SMOKE_CYCLE_MS, SMOKE_FROM, SMOKE_LIFE_MS, SMOKE_MAX, SMOKE_SPELL_MS,
	smokeAt, smokeSeen, SNOW_CYCLE_MS, SNOW_MAX, SNOW_ON_MS, snowAt, snowShare, type LifeInput,
} from "./life";
import { shiftBlocks } from "./map/home";

const VIEW = { w: 1200, h: 800 };
const block: Block = { x: 30, y: 20, tile: "brick", layer: "walls" };
const base: LifeInput = {
	wallMs: 0, now: 0, view: VIEW, scale: 1, day: false, night: true, chimney: true, landing: null, motion: true,
};

describe("the caps", () => {
	it("never holds more than MAX_PARTICLES in a frame, whatever the time, and each kind keeps its own cap", () => {
		expect(MAX_PARTICLES).toBe(SNOW_MAX + SMOKE_MAX + BIRDS_MAX + DUST_MAX);
		for (let wallMs = 0; wallMs < 2 * SNOW_CYCLE_MS; wallMs += 997) {
			for (const force of [undefined, "all"] as const) {
				const l = lifeAt({ ...base, wallMs, now: 100, day: true, night: true, landing: { block, at: 0 }, force });
				expect(l.snow.length).toBeLessThanOrEqual(SNOW_MAX);
				expect(l.smoke.length).toBeLessThanOrEqual(SMOKE_MAX);
				expect(l.birds.length).toBeLessThanOrEqual(BIRDS_MAX);
				expect(l.dust.length).toBeLessThanOrEqual(DUST_MAX);
				expect(particleCount(l)).toBeLessThanOrEqual(MAX_PARTICLES);
			}
		}
	});
	it("has none of it under reduced motion, and none with force none but a landing's dust", () => {
		expect(lifeAt({ ...base, motion: false, landing: { block, at: 0 }, force: "all" })).toEqual(NO_LIFE);
		const l = lifeAt({ ...base, wallMs: 10_000, day: true, force: "none", landing: { block, at: 0 }, now: 50 });
		expect([l.snow.length, l.birds.length, l.smoke.length]).toEqual([0, 0, 0]);
		expect(l.dust.length).toBe(DUST_MAX);
	});
	it("is the same for the same clock: nothing is random", () => {
		const a = lifeAt({ ...base, wallMs: 12_345, day: true });
		const b = lifeAt({ ...base, wallMs: 12_345, day: true });
		expect(a).toEqual(b);
	});
});

describe("snow", () => {
	it("falls in spells of 45 s every two minutes, thinning at each end", () => {
		expect(snowShare(0)).toBe(0);
		expect(snowShare(3_000)).toBeCloseTo(0.5, 6);
		expect(snowShare(20_000)).toBe(1);
		expect(snowShare(SNOW_ON_MS - 3_000)).toBeCloseTo(0.5, 6);
		expect(snowShare(SNOW_ON_MS + 1)).toBe(0);
		expect(snowShare(SNOW_CYCLE_MS + 20_000)).toBe(1);
		expect(snowShare(-SNOW_CYCLE_MS + 20_000)).toBe(1);
	});
	it("only at night", () => {
		expect(lifeAt({ ...base, wallMs: 20_000, night: false }).snow).toEqual([]);
		expect(lifeAt({ ...base, wallMs: 20_000 }).snow.length).toBe(SNOW_MAX);
	});
	it("stays inside the view, falls, and comes back at the top", () => {
		const a = snowAt(20_000, VIEW, 2, 1);
		const b = snowAt(20_500, VIEW, 2, 1);
		for (const f of a) {
			expect(f.x).toBeGreaterThanOrEqual(0);
			expect(f.x).toBeLessThanOrEqual(VIEW.w);
			expect(f.y).toBeGreaterThanOrEqual(-8);
			expect(f.y).toBeLessThanOrEqual(VIEW.h + 8);
			expect([2, 4]).toContain(f.size);
		}
		const fell = a.filter((f, i) => b[i].y > f.y).length;
		expect(fell).toBeGreaterThan(SNOW_MAX * 0.8); // the rest wrapped to the top
	});
	it("copes with a view of no size", () => {
		expect(snowAt(20_000, { w: 0, h: 0 }, 1, 1)).toEqual([]);
	});
});

describe("birds", () => {
	it("cross by day, one or two at a time, and never at night", () => {
		let flights = 0;
		let seen = 0;
		for (let wallMs = 0; wallMs < 10 * BIRD_CYCLE_MS; wallMs += 500) {
			const day = lifeAt({ ...base, wallMs, day: true, night: false }).birds;
			expect(day.length).toBeLessThanOrEqual(2);
			if (day.length > 0) seen++;
			if (day.length > 0 && lifeAt({ ...base, wallMs: wallMs - 500, day: true, night: false }).birds.length === 0) flights++;
			expect(lifeAt({ ...base, wallMs, day: false }).birds).toEqual([]);
		}
		expect(flights).toBe(10); // one flight in every cycle
		expect(seen * 500).toBeGreaterThanOrEqual(10 * BIRD_FLIGHT_MS - 10 * 500);
	});
	it("cross the whole view during a flight", () => {
		const forced = (t: number) => birdsAt(t, VIEW, 1, true);
		const start = forced(BIRD_FLIGHT_MS * 3 + 10)[0];
		const end = forced(BIRD_FLIGHT_MS * 4 - 10)[0];
		expect(Math.abs(end.x - start.x)).toBeGreaterThan(VIEW.w);
		expect(start.y).toBeLessThan(VIEW.h * 0.35);
	});
});

describe("smoke", () => {
	it("rises from the workshop's chimney cap, which is a laid block of the workshop", () => {
		const cap = CASTLE_BLOCKS.workshop.find((b) => b.x === CHIMNEY.x && b.y === CHIMNEY.y);
		expect(cap?.tile).toBe("battlement");
		expect(SMOKE_FROM).toEqual({ x: (CHIMNEY.x + 0.5) * TILE, y: CHIMNEY.y * TILE + 3 });
		expect(chimneyLaid(CASTLE_BLOCKS.workshop)).toBe(true);
		expect(chimneyLaid(CASTLE_BLOCKS.workshop.filter((b) => b !== cap))).toBe(false);
		expect(lifeAt({ ...base, wallMs: 5_000, chimney: false }).smoke).toEqual([]);
	});
	it("puffs during its spell, each puff rising, drifting east, growing and fading", () => {
		const during = smokeAt(5_000);
		expect(during.length).toBeGreaterThan(1);
		const later = smokeAt(5_600);
		const newest = during[during.length - 1]; // 0.6 s on, the same puff is 0.66 px wider
		const sameLater = later.find((p) => Math.abs(p.r - newest.r - 0.66) < 1e-6);
		expect(sameLater).toBeDefined();
		if (!sameLater) return;
		expect(sameLater.y).toBeLessThan(newest.y);
		expect(sameLater.x).toBeGreaterThan(newest.x - 2);
		for (const p of during) {
			expect(p.y).toBeLessThanOrEqual(SMOKE_FROM.y);
			expect(p.alpha).toBeGreaterThanOrEqual(0);
			expect(p.alpha).toBeLessThanOrEqual(0.55);
		}
	});
	it("keeps the ambient pace only while the chimney's plume is in view, with a margin (review M1)", () => {
		const phone = { w: 375, h: 700 };
		const desk = { w: 1920, h: 1080 };
		const inSpell = { ...base, wallMs: 5_000, day: false, night: false };
		const wants = (view: { w: number; h: number }, x: number, scale: number) => {
			const camera = newCamera(x, view, scale);
			return lifeWants(lifeAt({ ...inSpell, view, scale, chimney: chimneyLaid(CASTLE_BLOCKS.workshop) && smokeSeen(camera, view, 0) }));
		};
		// On a phone at the yard the chimney is well off to the side: no smoke to keep the loop going.
		expect(smokeSeen(newCamera(START_X, phone, 2), phone, 0)).toBe(false);
		expect(wants(phone, START_X, 2)).toBeNull();
		// The same phone looking at the workshop, and a desktop at the yard, see it.
		expect(smokeSeen(newCamera(SMOKE_FROM.x, phone, 2), phone, 0)).toBe(true);
		expect(wants(phone, SMOKE_FROM.x, 2)).toBe("ambient");
		expect(wants(desk, START_X, 1)).toBe("ambient");
		// The margin: a plume just past the edge still counts, one well past it does not.
		const edge = (dx: number) => smokeSeen(newCamera(SMOKE_FROM.x + dx, phone, 2), phone, 0);
		expect(edge(-(phone.w / 4 + 20))).toBe(true); // the chimney 20 world px past the right edge
		expect(edge(-(phone.w / 4 + 60))).toBe(false); // 60 px past it
	});
	it("stops between spells once the last puff has faded", () => {
		expect(smokeAt(SMOKE_SPELL_MS + SMOKE_LIFE_MS + 100)).toEqual([]);
		expect(smokeAt(SMOKE_CYCLE_MS - 1)).toEqual([]);
		expect(smokeAt(SMOKE_CYCLE_MS + 3_000).length).toBeGreaterThan(0);
		expect(smokeAt(SMOKE_CYCLE_MS - 1, true).length).toBeGreaterThan(0);
	});
});

describe("a block landing", () => {
	it("pops for 100 ms", () => {
		const landing = { block, at: 1000 };
		expect(popOf(landing, 999)).toBeNull();
		expect(popOf(landing, 1000)).toBe(block);
		expect(popOf(landing, 1000 + POP_MS - 1)).toBe(block);
		expect(popOf(landing, 1000 + POP_MS)).toBeNull();
		expect(popOf(null, 1000)).toBeNull();
	});
	it("throws six motes of dust from its foot, three each way, which fall and fade by 450 ms", () => {
		const landing = { block, at: 1000 };
		const first = dustAt(landing, 1000);
		expect(first).toHaveLength(DUST_MAX);
		const foot = { x: (block.x + 0.5) * TILE, y: (block.y + 1) * TILE - 1 };
		expect(first.filter((m) => m.x < foot.x)).toHaveLength(3);
		expect(first.filter((m) => m.x > foot.x)).toHaveLength(3);
		const late = dustAt(landing, 1000 + DUST_MS - 10);
		for (let j = 0; j < DUST_MAX; j++) {
			expect(Math.abs(late[j].x - foot.x)).toBeGreaterThan(Math.abs(first[j].x - foot.x));
			expect(late[j].alpha).toBeLessThan(first[j].alpha);
		}
		expect(dustAt(landing, 1000 + DUST_MS)).toEqual([]);
		expect(dustAt(landing, 999)).toEqual([]);
	});
});

describe("what the loop is asked for", () => {
	it("frames for a landing, the ambient pace for weather, smoke and birds, and nothing when the world is still", () => {
		expect(lifeWants(lifeAt({ ...base, wallMs: 50_000, chimney: false, landing: { block, at: 0 }, now: 50 }))).toBe("frames");
		expect(lifeWants(lifeAt({ ...base, wallMs: 20_000 }))).toBe("ambient");
		expect(lifeWants(lifeAt({ ...base, wallMs: 50_000, night: false, chimney: false }))).toBeNull();
		expect(lifeWants(NO_LIFE)).toBeNull();
	});
});

describe("the chimney in the big world (free-will spec 3.1)", () => {
	it("moves with the castle by the home offset", () => {
		expect(HOME_CHIMNEY).toEqual({ x: CHIMNEY.x + 445, y: CHIMNEY.y + 60 });
		expect(HOME_SMOKE_FROM).toEqual({ x: SMOKE_FROM.x + 445 * 16, y: SMOKE_FROM.y + 60 * 16 });
		const laid = shiftBlocks(CASTLE_BLOCKS.workshop, 445, 60);
		expect(chimneyLaid(laid)).toBe(false);
		expect(chimneyLaid(laid, HOME_CHIMNEY)).toBe(true);
		const here = smokeAt(5_000, true);
		const there = smokeAt(5_000, true, HOME_SMOKE_FROM);
		expect(there).toEqual(here.map((p) => ({ ...p, x: p.x + 445 * 16, y: p.y + 60 * 16 })));
	});
	it("sees the plume where the castle is", () => {
		const view = { w: 800, h: 600 };
		const at = (x: number, y: number) => ({ x, y, from: 1, to: 1, at: 0, aimX: x, aimY: y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY });
		expect(smokeSeen(at(HOME_SMOKE_FROM.x, HOME_SMOKE_FROM.y), view, 0, HOME_SMOKE_FROM)).toBe(true);
		expect(smokeSeen(at(HOME_SMOKE_FROM.x, HOME_SMOKE_FROM.y), view, 0)).toBe(false);
	});
	it("starts the plume of a frame's life where it is told", () => {
		const o = { wallMs: 5_000, now: 0, view: { w: 800, h: 600 }, scale: 1, day: true, night: false, chimney: true, landing: null, motion: true, force: "all" as const };
		expect(lifeAt({ ...o, smokeFrom: HOME_SMOKE_FROM }).smoke).toEqual(smokeAt(5_000, true, HOME_SMOKE_FROM));
		expect(lifeAt(o).smoke).toEqual(smokeAt(5_000, true));
	});
});
