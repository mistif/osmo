/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { BUILD_PRIVACY, ensureTimezone, geocode, LEVEL_WORDS, levelDescription, levelsFor, loadProfileRow, roundCoord, saveProfile } from "./profile-client";

describe("roundCoord", () => {
	it("keeps two decimals", () => {
		expect(roundCoord(59.329323)).toBe(59.33);
		expect(roundCoord(-18.0686)).toBe(-18.07);
		expect(roundCoord(10)).toBe(10);
		expect(roundCoord(0.004)).toBe(0);
	});
});

describe("LEVEL_WORDS", () => {
	it("gives each level its plain meaning", () => {
		expect(LEVEL_WORDS.off).toBe("off: nothing");
		expect(LEVEL_WORDS.read).toBe("read: I may look, never change anything");
		expect(LEVEL_WORDS.ask).toBe("ask: I ask before changing anything");
		expect(LEVEL_WORDS.act).toBe("act: small things happen at once; deleting and sending always ask");
	});

	it("says plainly that weather runs at ask and act too, because it only looks", () => {
		expect(levelDescription("weather", "off")).toMatch(/not/i);
		for (const level of ["read", "ask", "act"] as const) {
			expect(levelDescription("weather", level)).toMatch(/only looks/i);
			expect(levelDescription("weather", level)).toMatch(/without asking|never need to ask/i);
		}
		expect(levelDescription("weather", "ask")).toMatch(/ask/);
	});

	it("uses the general words for reminders and notes", () => {
		expect(levelDescription("reminders", "ask")).toBe(LEVEL_WORDS.ask);
		expect(levelDescription("notes", "act")).toBe(LEVEL_WORDS.act);
	});

	it("offers Building things only Off and Act, and every other connector all four", () => {
		expect(levelsFor("artifacts")).toEqual(["off", "act"]);
		for (const c of ["reminders", "notes", "weather"]) expect(levelsFor(c)).toEqual(["off", "read", "ask", "act"]);
	});

	it("describes Building things in his own words and falls back to off for a level it does not offer", () => {
		expect(levelDescription("artifacts", "off")).toMatch(/not build/);
		expect(levelDescription("artifacts", "act")).toMatch(/keep it unless you discard/);
		expect(levelDescription("artifacts", "ask")).toBe(levelDescription("artifacts", "off"));
	});

	it("carries the privacy line for building, word for word", () => {
		expect(BUILD_PRIVACY).toBe("Osmo writes what he builds with an OpenAI model. It is sent your request, and your earlier version when you ask for a change, and nothing else about you.");
	});

	it("is plain, speakable text", () => {
		for (const level of ["off", "read", "ask", "act"] as const) {
			for (const c of ["reminders", "notes", "weather"]) expect(levelDescription(c, level)).toMatch(/^[\x20-\x7e]+$/);
		}
	});
});

describe("geocode", () => {
	const okFetch = (body: unknown, status = 200) => vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

	it("returns the first hit with rounded coordinates and a readable label", async () => {
		const f = okFetch({
			results: [
				{ name: "Stockholm", country: "Sweden", admin1: "Stockholm", latitude: 59.32938, longitude: 18.06871 },
				{ name: "Stockholm", country: "United States", latitude: 44.9, longitude: -68.1 },
			],
		});
		expect(await geocode("Stockholm", f)).toEqual({ label: "Stockholm, Sweden", lat: 59.33, lon: 18.07 });
		const url = String((f as any).mock.calls[0][0]);
		expect(url).toContain("geocoding-api.open-meteo.com");
		expect(url).toContain("name=Stockholm");
		expect(url).toContain("count=1");
	});

	it("is null for no result, a bad status, a throw, a bad body and empty input; it never throws", async () => {
		expect(await geocode("Nowhereville", okFetch({}))).toBeNull();
		expect(await geocode("Nowhereville", okFetch({ results: [] }))).toBeNull();
		expect(await geocode("Stockholm", okFetch({}, 500))).toBeNull();
		expect(
			await geocode("Stockholm", (async () => {
				throw new Error("offline");
			}) as unknown as typeof fetch),
		).toBeNull();
		expect(await geocode("Stockholm", okFetch({ results: [{ name: "X", latitude: "no", longitude: 1 }] }))).toBeNull();
		const never = vi.fn();
		expect(await geocode("   ", never as unknown as typeof fetch)).toBeNull();
		expect(never).not.toHaveBeenCalled();
	});

	it("encodes the name and sends only the name", async () => {
		const f = okFetch({ results: [] });
		await geocode("Sao Paulo & more", f);
		const url = String((f as any).mock.calls[0][0]);
		expect(url).toContain("name=Sao%20Paulo%20%26%20more");
		expect((f as any).mock.calls[0][1]).toBeUndefined();
	});
});

describe("saveProfile and loadProfileRow", () => {
	function client(result: { data?: unknown; error?: unknown } = { error: null }) {
		const upsert = vi.fn<(row: unknown, opts: unknown) => Promise<{ error: unknown }>>(async () => ({ error: result.error ?? null }));
		const maybeSingle = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
		const select = vi.fn<(cols: string) => { maybeSingle: typeof maybeSingle }>(() => ({ maybeSingle }));
		return { c: { from: vi.fn<(t: string) => unknown>(() => ({ upsert, select })) } as any, upsert, select, maybeSingle };
	}

	it("upserts with the user id, the patch and updated_at, on user_id", async () => {
		const { c, upsert } = client();
		expect(await saveProfile(c, "u1", { paused: true })).toBe(true);
		expect(c.from).toHaveBeenCalledWith("profile");
		const [row, opts] = upsert.mock.calls[0] as any[];
		expect(row).toMatchObject({ user_id: "u1", paused: true });
		expect(typeof row.updated_at).toBe("string");
		expect(Number.isNaN(Date.parse(row.updated_at))).toBe(false);
		expect(opts).toEqual({ onConflict: "user_id" });
	});

	it("rounds a place's coordinates before saving, even when handed long ones", async () => {
		const { c, upsert } = client();
		await saveProfile(c, "u1", { place: "Stockholm, Sweden", lat: 59.329323, lon: 18.068581 });
		expect((upsert.mock.calls[0] as any[])[0]).toMatchObject({ place: "Stockholm, Sweden", lat: 59.33, lon: 18.07 });
	});

	it("returns false on an error and never throws", async () => {
		expect(await saveProfile(client({ error: { message: "no" } }).c, "u1", { paused: false })).toBe(false);
		const boom: any = {
			from: () => {
				throw new Error("down");
			},
		};
		expect(await saveProfile(boom, "u1", { paused: false })).toBe(false);
	});

	it("loads the row as a clean shape, null when there is none, and 'error' when it cannot be read", async () => {
		const row = { timezone: "Europe/Stockholm", place: "Stockholm, Sweden", lat: 59.33, lon: 18.07, paused: true, hide_reminder_text: true, levels: { reminders: "act", notes: "bogus", weather: "read" } };
		expect(await loadProfileRow(client({ data: row }).c)).toEqual({
			timezone: "Europe/Stockholm",
			place: "Stockholm, Sweden",
			lat: 59.33,
			lon: 18.07,
			paused: true,
			hideReminderText: true,
			levels: { reminders: "act", weather: "read" },
		});
		expect(await loadProfileRow(client({ data: null }).c)).toEqual({ timezone: null, place: null, lat: null, lon: null, paused: false, hideReminderText: false, levels: {} });
		expect(await loadProfileRow(client({ error: { message: "x" } }).c)).toBe("error");
	});
});

describe("ensureTimezone", () => {
	it("saves the zone when the row has none, and only then", async () => {
		const upsert = vi.fn<(r: unknown, o: unknown) => Promise<{ error: null }>>(async () => ({ error: null }));
		const mk = (data: unknown) => ({ from: () => ({ upsert, select: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) }) as any;
		await ensureTimezone(mk(null), "u1", "Europe/Stockholm");
		expect(upsert).toHaveBeenCalledTimes(1);
		expect((upsert.mock.calls[0] as any[])[0]).toMatchObject({ user_id: "u1", timezone: "Europe/Stockholm" });
		upsert.mockClear();
		await ensureTimezone(mk({ timezone: "Europe/London" }), "u1", "Europe/Stockholm");
		expect(upsert).not.toHaveBeenCalled();
	});

	it("saves nothing, and never throws, when the row cannot be read or the zone is empty", async () => {
		const upsert = vi.fn<(r: unknown, o: unknown) => Promise<{ error: null }>>(async () => ({ error: null }));
		const bad = { from: () => ({ upsert, select: () => ({ maybeSingle: async () => ({ data: null, error: { message: "no table" } }) }) }) } as any;
		await ensureTimezone(bad, "u1", "Europe/Stockholm");
		const ok = { from: () => ({ upsert, select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) } as any;
		await ensureTimezone(ok, "u1", "");
		expect(upsert).not.toHaveBeenCalled();
		const thrower: any = {
			from: () => {
				throw new Error("x");
			},
		};
		await expect(ensureTimezone(thrower, "u1", "Europe/Stockholm")).resolves.toBeUndefined();
	});
});
