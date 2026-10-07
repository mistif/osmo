/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "../actions/fake-db";
import type { Def, Place, Profile, RunCtx } from "../actions/types";
import { weatherDefs, weatherForecast, weatherNow } from "./weather";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const MALMO: Place = { label: "Malmo", lat: 55.6, lon: 13 };
const profile = (place: Place | null = MALMO): Profile => ({ timezone: "Europe/Stockholm", place, paused: false, hideReminderText: false, levels: {} });
const check = (d: Def, a: unknown) => d.check(a, { now: NOW, timezone: "Europe/Stockholm" });

const CURRENT = { current: { temperature_2m: 14.04, apparent_temperature: 11.6, weather_code: 61, wind_speed_10m: 4.8 } };
const DAILY = {
	daily: {
		time: ["2026-10-07", "2026-10-08", "2026-10-09"],
		weather_code: [61, 3, 71],
		temperature_2m_max: [15.2, 12, -1.5],
		temperature_2m_min: [9, 7.04, -6],
		precipitation_probability_max: [60, 10, null],
	},
};
const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });
function ctx(fetchImpl: (...a: any[]) => Promise<Response>, place: Place | null = MALMO) {
	const fetch = vi.fn(fetchImpl) as any;
	const db = fakeDb({}, "owner-1", () => NOW);
	const rc: RunCtx = { db, now: NOW, timezone: "Europe/Stockholm", profile: profile(place), fetch, env: {} };
	return { rc, fetch, db };
}
const urlOf = (fetch: any, i = 0) => new URL(String(fetch.mock.calls[i][0]));
const PLAIN = "I could not reach the weather service just now.";

describe("the weather defs", () => {
	it("are two tier 1 reads that need the result, on the weather connector", () => {
		expect(weatherDefs.map((d) => [d.name, d.tier, d.needsResult, d.connector])).toEqual([
			["weather_now", 1, true, "weather"],
			["weather_forecast", 1, true, "weather"],
		]);
		for (const d of weatherDefs) {
			expect(d.line).toContain(d.name);
			expect(d.line).toContain("tier 1");
			expect(d.unclear).not.toContain("!");
			expect(d.line + d.unclear).toMatch(/^[\x20-\x7e]*$/);
			expect(d.describe({ place: "Paris", days: 2 })).not.toContain("Paris");
			expect(d.logLine!({ place: "Paris", days: 2 }, { ok: true, say: "In Paris now 14 degrees.", result: null })).toBe("Checked the weather");
		}
	});
});

describe("the arg checks", () => {
	it("weather_now takes exactly a place of text, cut to 60, empty allowed", () => {
		expect(check(weatherNow, { place: "" })).toEqual({ ok: true, args: { place: "" } });
		expect(check(weatherNow, { place: "  Malmo \n" })).toEqual({ ok: true, args: { place: "Malmo" } });
		expect((check(weatherNow, { place: "x".repeat(90) }) as any).args.place).toHaveLength(60);
		for (const v of [{}, { place: 5 }, { place: null }, { place: "a", days: 1 }, null, "x", []]) expect(check(weatherNow, v)).toEqual({ ok: false });
	});
	it("weather_forecast takes a place and days from 1 to 3 as a whole number", () => {
		for (const days of [1, 2, 3]) expect(check(weatherForecast, { place: "", days })).toEqual({ ok: true, args: { place: "", days } });
		for (const days of [0, 4, "2", 1.5, null, NaN, -1]) expect(check(weatherForecast, { place: "", days })).toEqual({ ok: false });
		for (const v of [{ place: "" }, { days: 2 }, { place: "", days: 2, more: 1 }, null]) expect(check(weatherForecast, v)).toEqual({ ok: false });
	});
});

describe("the place", () => {
	it("without a saved place there is no request and a plain line", async () => {
		for (const place of ["", "Paris"]) {
			const { rc, fetch } = ctx(ok(CURRENT), null);
			expect(await weatherNow.run({ place }, rc)).toEqual({ ok: false, say: "Set your place in Settings first." });
			expect(fetch).not.toHaveBeenCalled();
		}
	});
	it("another place gets the saved-place line and no request, in phase 1", async () => {
		const { rc, fetch } = ctx(ok(CURRENT));
		expect(await weatherNow.run({ place: "Paris" }, rc)).toEqual({ ok: false, say: "I only know your saved place for now." });
		expect(await weatherForecast.run({ place: "Paris", days: 2 }, rc)).toEqual({ ok: false, say: "I only know your saved place for now." });
		expect(fetch).not.toHaveBeenCalled();
	});
	it("the saved place by name, in any case, with or without accents or its region, is the saved place", async () => {
		for (const [label, asked] of [
			["Malmo", "malmo"],
			["Malm\u00f6", "Malmo"],
			["Malmo, Sweden", "MALMO"],
			["Malmo", "Malm\u00f6"],
			["Malmo, Sweden", "Malmo, Sweden"],
		]) {
			const { rc, fetch } = ctx(ok(CURRENT), { ...MALMO, label });
			expect((await weatherNow.run({ place: asked }, rc)).ok).toBe(true);
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	});
	it("part of a name is not the saved place", async () => {
		const { rc, fetch } = ctx(ok(CURRENT), { ...MALMO, label: "Malmo, Sweden" });
		expect((await weatherNow.run({ place: "Sweden" }, rc)).ok).toBe(false);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("the request", () => {
	it("goes to the Open-Meteo forecast endpoint with coordinates and field lists only", async () => {
		const { rc, fetch, db } = ctx(ok(CURRENT));
		await weatherNow.run({ place: "" }, rc);
		const u = urlOf(fetch);
		expect(u.origin + u.pathname).toBe("https://api.open-meteo.com/v1/forecast");
		expect(u.searchParams.get("latitude")).toBe("55.6");
		expect(u.searchParams.get("longitude")).toBe("13");
		expect(u.searchParams.get("current")).toBe("temperature_2m,apparent_temperature,weather_code,wind_speed_10m");
		expect([...u.searchParams.keys()].sort()).toEqual(["current", "latitude", "longitude", "timezone", "wind_speed_unit"]);
		expect(u.searchParams.get("wind_speed_unit")).toBe("kmh");
		expect(u.href).not.toMatch(/Malmo|owner-1|key|token/i);
		expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
		expect(db.tables).toEqual({}); // nothing is stored
	});
	it("a forecast asks for the daily fields and the number of days", async () => {
		const { rc, fetch } = ctx(ok(DAILY));
		await weatherForecast.run({ place: "malmo", days: 2 }, rc);
		const u = urlOf(fetch);
		expect(u.searchParams.get("daily")).toBe("weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
		expect(u.searchParams.get("forecast_days")).toBe("2");
		expect(u.searchParams.get("timezone")).toBe("auto");
		expect(u.searchParams.has("current")).toBe(false);
		expect(u.href).not.toMatch(/Malmo|owner-1/i);
	});
});

describe("the lines", () => {
	it("now: built by code from the numbers, say and result equal", async () => {
		const { rc } = ctx(ok(CURRENT));
		const out = await weatherNow.run({ place: "" }, rc);
		expect(out).toEqual({ ok: true, say: "Now 14 degrees, feels like 11.6, light rain, wind 5 kilometres per hour.", result: "Now 14 degrees, feels like 11.6, light rain, wind 5 kilometres per hour." });
	});
	it("below zero is said as minus; one decimal at most", async () => {
		const body = { current: { temperature_2m: -3.04, apparent_temperature: -8.46, weather_code: 0, wind_speed_10m: 1 } };
		const out = (await weatherNow.run({ place: "" }, ctx(ok(body)).rc)) as any;
		expect(out.say).toBe("Now minus 3 degrees, feels like minus 8.5, clear sky, wind 1 kilometre per hour.");
		expect(out.say).not.toContain("-");
	});
	it("an unknown weather code is mixed weather", async () => {
		const body = { current: { temperature_2m: 10, apparent_temperature: 10, weather_code: 4, wind_speed_10m: 0 } };
		expect(((await weatherNow.run({ place: "" }, ctx(ok(body)).rc)) as any).say).toContain("mixed weather");
	});
	it("describes the common codes in words", async () => {
		const expected: [number, string][] = [
			[0, "clear sky"], [1, "mainly clear"], [2, "partly cloudy"], [3, "overcast"], [45, "fog"], [51, "light drizzle"], [55, "heavy drizzle"],
			[61, "light rain"], [63, "rain"], [65, "heavy rain"], [71, "light snow"], [75, "heavy snow"], [80, "light rain showers"], [95, "thunderstorm"], [99, "thunderstorm with hail"],
		];
		for (const [code, words] of expected) {
			const body = { current: { temperature_2m: 10, apparent_temperature: 10, weather_code: code, wind_speed_10m: 10 } };
			expect(((await weatherNow.run({ place: "" }, ctx(ok(body)).rc)) as any).say).toContain(`, ${words},`);
		}
	});
	it("forecast: today, tomorrow, then the weekday; the chance of rain only when there is one", async () => {
		const out = (await weatherForecast.run({ place: "", days: 3 }, ctx(ok(DAILY)).rc)) as any;
		expect(out.say).toBe(
			"Today: light rain, high 15.2, low 9, 60 percent chance of rain. Tomorrow: overcast, high 12, low 7, 10 percent chance of rain. Friday: light snow, high minus 1.5, low minus 6.",
		);
		expect(out.result).toBe(out.say);
	});
	it("forecast: one day is only today; asking for more than came back uses what came back", async () => {
		const one = (await weatherForecast.run({ place: "", days: 1 }, ctx(ok(DAILY)).rc)) as any;
		expect(one.say.startsWith("Today:")).toBe(true);
		expect(one.say).not.toContain("Tomorrow");
		const short = { daily: { ...DAILY.daily, time: ["2026-10-07"], weather_code: [0], temperature_2m_max: [1], temperature_2m_min: [0], precipitation_probability_max: [0] } };
		const two = (await weatherForecast.run({ place: "", days: 2 }, ctx(ok(short)).rc)) as any;
		expect(two.say).toBe("Today: clear sky, high 1, low 0, 0 percent chance of rain.");
	});
	it("no exclamation marks, no symbols", async () => {
		const out = (await weatherForecast.run({ place: "", days: 3 }, ctx(ok(DAILY)).rc)) as any;
		expect(out.say).toMatch(/^[A-Za-z0-9 .,:]*$/);
	});
});

describe("when the service fails", () => {
	const failures: [string, (...a: any[]) => Promise<Response>][] = [
		["a 500", async () => new Response("oops", { status: 500 })],
		["a 503", async () => new Response("oops", { status: 503 })],
		["a 429", async () => new Response("slow down", { status: 429 })],
		["a 404", async () => new Response("no", { status: 404 })],
		["a timeout", async () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
		["a network error", async () => Promise.reject(new TypeError("fetch failed"))],
		["a body that is not JSON", async () => new Response("<html>", { status: 200 })],
		["a body that is not an object", async () => new Response("null", { status: 200 })],
		["an empty object", ok({})],
		["a current block without numbers", ok({ current: { temperature_2m: "warm", apparent_temperature: 1, weather_code: 1, wind_speed_10m: 1 } })],
		["a current block with a missing field", ok({ current: { temperature_2m: 1, apparent_temperature: 1, weather_code: 1 } })],
		["a current temperature that is null", ok({ current: { temperature_2m: null, apparent_temperature: 1, weather_code: 1, wind_speed_10m: 1 } })],
	];
	for (const [label, impl] of failures) {
		it(`weather_now says one plain line on ${label}`, async () => {
			expect(await weatherNow.run({ place: "" }, ctx(impl).rc)).toEqual({ ok: false, say: PLAIN });
		});
	}
	it("weather_forecast says the plain line on a bad daily block", async () => {
		const bad = [
			{ daily: {} },
			{ daily: { ...DAILY.daily, time: ["not a date", "x", "y"] } },
			{ daily: { ...DAILY.daily, temperature_2m_max: "hot" } },
			{ daily: { ...DAILY.daily, weather_code: [61, "x", 3] } },
			{ daily: { ...DAILY.daily, time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [] } },
		];
		for (const body of bad) expect(await weatherForecast.run({ place: "", days: 3 }, ctx(ok(body)).rc)).toEqual({ ok: false, say: PLAIN });
		for (const [, impl] of failures.slice(0, 7)) expect(await weatherForecast.run({ place: "", days: 2 }, ctx(impl).rc)).toEqual({ ok: false, say: PLAIN });
	});
	it("never throws, even when fetch throws a non-error", async () => {
		const impl = async () => {
			throw "boom";
		};
		expect(await weatherNow.run({ place: "" }, ctx(impl as any).rc)).toEqual({ ok: false, say: PLAIN });
	});
});
