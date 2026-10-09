import { describe, expect, it } from "vitest";
import {
	CLOUD_SPEED, CLOUDS, cloudWidth, cloudX, daylight, hourOf, hslCss, isNight, phaseOf, skyAt, starField, sunAt,
} from "./sky";

describe("the clock", () => {
	it("is dark at night, light by day, half way at sunrise and sunset", () => {
		expect([0, 4.9, 6, 12, 20, 21, 23.5].map(daylight)).toEqual([0, 0, 0.5, 1, 0.5, 0, 0]);
	});
	it("wraps hours outside 0 to 24 (midnight, a daylight-saving jump)", () => {
		expect(daylight(24)).toBe(daylight(0));
		expect(daylight(-0.5)).toBe(daylight(23.5));
		expect(daylight(36)).toBe(daylight(12));
		expect(phaseOf(24)).toBe("night");
		expect(phaseOf(-1)).toBe("night");
		expect(sunAt(30)).toEqual(sunAt(6));
	});
	it("names the phases", () => {
		expect([5, 6.9, 7, 18.9, 19, 20.9, 21, 2].map(phaseOf)).toEqual(["dawn", "dawn", "day", "day", "dusk", "dusk", "night", "night"]);
	});
	it("calls 21:00 to 05:00 night", () => {
		expect([20.9, 21, 4.9, 5].map(isNight)).toEqual([false, true, true, false]);
		expect(isNight(24.5)).toBe(true);
	});
	it("reads the hour from a date", () => {
		expect(hourOf(new Date(2026, 9, 9, 13, 30))).toBe(13.5);
	});
});

describe("the sky", () => {
	const A = "hsl(42 95% 58%)";
	const B = "hsl(82 95% 58%)";
	it("keeps the mood's hues at night and drops their lightness", () => {
		const night = skyAt(A, B, 1);
		const day = skyAt(A, B, 12);
		expect(night.top[0]).toBe(42);
		expect(night.bottom[0]).toBe(82);
		expect(night.top[2]).toBeLessThan(day.top[2]);
		expect(night.bottom[2]).toBeLessThan(day.bottom[2]);
		expect(day.top[1]).toBeLessThanOrEqual(55);
	});
	it("shows the stars at night only", () => {
		expect(skyAt(A, B, 0).stars).toBe(1);
		expect(skyAt(A, B, 12).stars).toBe(0);
	});
	it("warms the horizon at sunset", () => {
		expect(Math.abs(skyAt(A, B, 20).bottom[0] - 24)).toBeLessThan(Math.abs(82 - 24));
	});
	it("falls back to calm for a colour it cannot read", () => {
		expect(skyAt("#123456", "nope", 12).top[0]).toBe(172);
	});
	it("writes css", () => {
		expect(hslCss([172, 38, 26])).toBe("hsl(172 38% 26%)");
	});
});

describe("the sun", () => {
	it("rises at 06:00 on the left, is highest at 13:00, and sets at 20:00 on the right", () => {
		expect(sunAt(6)).toEqual({ fx: 0.12, fy: 0.6, up: true });
		expect(sunAt(13).fx).toBeCloseTo(0.5);
		expect(sunAt(13).fy).toBeCloseTo(0.15);
		expect(sunAt(20).fx).toBeCloseTo(0.88);
	});
	it("is a dim heart low behind the castle when it is down", () => {
		expect(sunAt(22)).toEqual({ fx: 0.5, fy: 0.62, up: false });
		expect(sunAt(5)).toEqual({ fx: 0.5, fy: 0.62, up: false });
	});
});

describe("clouds and stars", () => {
	it("starts each cloud where it is placed and drifts it right, the near layer faster", () => {
		for (const c of CLOUDS) expect(cloudX(c, 0, 1024)).toBe(c.x);
		const [far] = CLOUDS.filter((c) => c.layer === 0);
		expect(cloudX(far, 1000, 1024) - far.x).toBeCloseTo(CLOUD_SPEED[0]);
		expect(CLOUD_SPEED[1]).toBeGreaterThan(CLOUD_SPEED[0]);
	});
	it("wraps round the world", () => {
		for (const c of CLOUDS) {
			const x = cloudX(c, 10 * 3_600_000, 1024);
			expect(x).toBeGreaterThanOrEqual(-cloudWidth(c));
			expect(x).toBeLessThan(1024);
		}
	});
	it("uses only cloud tiles", () => {
		expect(CLOUDS.flatMap((c) => c.parts).every((p) => p.tile.startsWith("cloud-"))).toBe(true);
	});
	it("places the same stars every time, in the upper sky", () => {
		expect(starField(20, 3)).toEqual(starField(20, 3));
		for (const s of starField()) {
			expect(s.fx).toBeGreaterThanOrEqual(0);
			expect(s.fx).toBeLessThan(1);
			expect(s.fy).toBeLessThan(0.55);
		}
	});
});
