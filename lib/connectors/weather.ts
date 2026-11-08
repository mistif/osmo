// Weather (spec 3.2, 6.3): Open-Meteo's forecast endpoint with a place's coordinates and nothing else.
// No key, no account. The saved place is used when none is named or when its own name is; any other name is looked up
// once through Open-Meteo's geocoding (the name only, never saved) and the forecast then gets its coordinates.
// The fetch comes in through the run context, so tests never touch the network.
import { clean, only } from "../actions/match";
import type { Def, Place, RunCtx } from "../actions/types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CURRENT_FIELDS = "temperature_2m,apparent_temperature,weather_code,wind_speed_10m";
const DAILY_FIELDS = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 5000;

const NO_PLACE = "Set your place in Settings first.";
const UNREACHABLE = "I could not reach the weather service just now.";

// WMO weather interpretation codes, in words. Anything else is "mixed weather".
const CODES: Record<number, string> = {
	0: "clear sky",
	1: "mainly clear",
	2: "partly cloudy",
	3: "overcast",
	45: "fog",
	48: "freezing fog",
	51: "light drizzle",
	53: "drizzle",
	55: "heavy drizzle",
	56: "light freezing drizzle",
	57: "freezing drizzle",
	61: "light rain",
	63: "rain",
	65: "heavy rain",
	66: "light freezing rain",
	67: "freezing rain",
	71: "light snow",
	73: "snow",
	75: "heavy snow",
	77: "snow grains",
	80: "light rain showers",
	81: "rain showers",
	82: "heavy rain showers",
	85: "light snow showers",
	86: "snow showers",
	95: "thunderstorm",
	96: "thunderstorm with hail",
	99: "thunderstorm with hail",
};
const words = (code: number) => CODES[code] ?? "mixed weather";

// One decimal at most; below zero is spoken, so "minus 3" and not a dash.
function deg(n: number): string {
	const r = Math.round(Math.abs(n) * 10) / 10,
		s = String(r);
	return n < 0 && r !== 0 ? `minus ${s}` : s;
}
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

// The ASCII, lower-case, punctuation-free form of a name, for comparing what was asked with what is saved.
const norm = (s: string) =>
	s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

type Located = { ok: true; place: Place; named: string | null } | { ok: false; say: string };

// The first hit of the geocoder for a name: a place, null for no hit, or undefined when the service failed or answered nonsense.
async function geocode(c: RunCtx, name: string): Promise<{ label: string; lat: number; lon: number } | null | undefined> {
	try {
		const res = await c.fetch(`${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=1&language=en`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) return undefined;
		const body = obj(await res.json());
		if (body === null) return undefined;
		if (body.results === undefined) return null;
		if (!Array.isArray(body.results)) return undefined;
		const hit = obj(body.results[0]);
		if (hit === null) return null;
		const label = typeof hit.name === "string" ? clean(hit.name, 60) : "";
		return label !== "" && num(hit.latitude) && num(hit.longitude) ? { label, lat: hit.latitude, lon: hit.longitude } : undefined;
	} catch {
		return undefined;
	}
}

// Where to look: the saved place for an empty name or its own name, else the geocoded one (named is its name, for the say line).
async function locate(c: RunCtx, asked: string): Promise<Located> {
	const saved = c.profile.place;
	if (asked === "") return saved === null ? { ok: false, say: NO_PLACE } : { ok: true, place: saved, named: null };
	const want = norm(asked);
	if (saved !== null && want !== "" && (want === norm(saved.label) || want === norm(saved.label.split(",")[0]))) return { ok: true, place: saved, named: null };
	const hit = await geocode(c, asked);
	if (hit === undefined) return { ok: false, say: UNREACHABLE };
	if (hit === null) return { ok: false, say: `I could not find a place called ${asked}.` };
	return { ok: true, place: hit, named: hit.label };
}

// One GET, never throws: null for a bad status, a timeout, a network error or a body that is not an object.
async function get(c: RunCtx, place: Place, extra: Record<string, string>): Promise<Record<string, unknown> | null> {
	try {
		const q = new URLSearchParams({ latitude: String(place.lat), longitude: String(place.lon), ...extra, timezone: "auto", wind_speed_unit: "kmh" });
		const res = await c.fetch(`${FORECAST_URL}?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) return null;
		return obj(await res.json());
	} catch {
		return null;
	}
}

const fail = (say: string) => ({ ok: false as const, say });
const placeArg = (a: Record<string, unknown>) => (typeof a.place === "string" ? clean(a.place, 60) : null);

export const weatherNow: Def = {
	name: "weather_now",
	connector: "weather",
	tier: 1,
	needsResult: true,
	voiceOk: true,
	line: 'weather_now {"place":"60 characters, empty for the saved place"} tier 1: the weather right now.',
	unclear: "I did not catch where you wanted the weather. Could you say it again?",
	check(a) {
		if (!only(a, ["place"])) return { ok: false };
		const place = placeArg(a);
		return place === null ? { ok: false } : { ok: true, args: { place } };
	},
	describe: () => "Check the weather",
	logLine: () => "Checked the weather",
	async run(a, c) {
		const where = await locate(c, (a as { place: string }).place);
		if (!where.ok) return fail(where.say);
		const body = await get(c, where.place, { current: CURRENT_FIELDS }),
			cur = obj(body?.current);
		if (!cur || !num(cur.temperature_2m) || !num(cur.apparent_temperature) || !num(cur.weather_code) || !num(cur.wind_speed_10m)) return fail(UNREACHABLE);
		const wind = Math.round(cur.wind_speed_10m),
			say = `${where.named === null ? "Now" : `In ${where.named} now`} ${deg(cur.temperature_2m)} degrees, feels like ${deg(cur.apparent_temperature)}, ${words(cur.weather_code)}, wind ${wind} ${wind === 1 ? "kilometre" : "kilometres"} per hour.`;
		return { ok: true, say, result: say };
	},
};

const WEEKDAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const weekday = (iso: string): string | null => {
	const m = WEEKDAY.exec(iso);
	return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }) : null;
};

export const weatherForecast: Def = {
	name: "weather_forecast",
	connector: "weather",
	tier: 1,
	needsResult: true,
	voiceOk: true,
	line: 'weather_forecast {"place":"60 characters, empty for the saved place","days":1 to 3} tier 1: the coming days.',
	unclear: "I did not catch where or how many days. Could you say it again?",
	check(a) {
		if (!only(a, ["place", "days"])) return { ok: false };
		const place = placeArg(a);
		return place !== null && typeof a.days === "number" && Number.isInteger(a.days) && a.days >= 1 && a.days <= 3 ? { ok: true, args: { place, days: a.days } } : { ok: false };
	},
	describe: () => "Check the forecast",
	logLine: () => "Checked the weather",
	async run(a, c) {
		const { place, days } = a as { place: string; days: number },
			where = await locate(c, place);
		if (!where.ok) return fail(where.say);
		const body = await get(c, where.place, { daily: DAILY_FIELDS, forecast_days: String(days) }),
			d = obj(body?.daily);
		if (!d) return fail(UNREACHABLE);
		const { time, weather_code: code, temperature_2m_max: hi, temperature_2m_min: lo, precipitation_probability_max: rain } = d;
		if (![time, code, hi, lo, rain].every(Array.isArray)) return fail(UNREACHABLE);
		const t = time as unknown[],
			n = Math.min(days, t.length, (code as unknown[]).length, (hi as unknown[]).length, (lo as unknown[]).length, (rain as unknown[]).length);
		if (n < 1) return fail(UNREACHABLE);
		const lines: string[] = [];
		for (let i = 0; i < n; i++) {
			const day = typeof t[i] === "string" ? weekday(t[i] as string) : null,
				c0 = (code as unknown[])[i],
				h = (hi as unknown[])[i],
				l = (lo as unknown[])[i],
				r = (rain as unknown[])[i];
			if (day === null || !num(c0) || !num(h) || !num(l)) return fail(UNREACHABLE);
			const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : day;
			lines.push(`${label}: ${words(c0)}, high ${deg(h)}, low ${deg(l)}${num(r) ? `, ${Math.round(r)} percent chance of rain` : ""}.`);
		}
		const say = (where.named === null ? "" : `In ${where.named}. `) + lines.join(" ");
		return { ok: true, say, result: say };
	},
};

export const weatherDefs: Def[] = [weatherNow, weatherForecast];
