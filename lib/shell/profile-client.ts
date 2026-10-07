// The browser's side of the profile table (spec 4.4, 6.3, 10): levels, the place, Pause and the time zone.
// Gur's own client is used, so row-level security applies. Nothing here throws.
import type { Level } from "../actions/types";

export type { Level } from "../actions/types";

export const roundCoord = (n: number): number => {
	const r = Math.round(n * 100) / 100;
	return Object.is(r, -0) ? 0 : r;
};

// What each level means, in plain words (spec 4.1).
export const LEVEL_WORDS: Record<Level, string> = {
	off: "off: nothing",
	read: "read: I may look, never change anything",
	ask: "ask: I ask before changing anything",
	act: "act: small things happen at once; deleting and sending always ask",
};

// Weather only looks, so it is a tier 1 action and runs at every level but off. Say so, rather than let "ask" mislead.
const WEATHER_WORDS: Record<Level, string> = {
	off: "off: I will not look up the weather",
	read: "read: I look up the weather when you ask. Weather only looks, so I never need to ask first",
	ask: "ask: the same as read. Weather only looks, so I never need to ask first",
	act: "act: the same as read. Weather only looks, so I never need to ask first",
};

export const levelDescription = (connector: string, level: Level): string => (connector === "weather" ? WEATHER_WORDS[level] : LEVEL_WORDS[level]);

export type Place = { label: string; lat: number; lon: number };

// Open-Meteo's city search: the first hit, or null. The browser sends the city name and nothing else.
export async function geocode(city: string, fetchFn: typeof fetch): Promise<Place | null> {
	const name = city.trim();
	if (name === "") return null;
	try {
		const res = await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
		if (!res.ok) return null;
		const body = (await res.json()) as { results?: unknown };
		const first = Array.isArray(body.results) ? (body.results[0] as Record<string, unknown> | undefined) : undefined;
		if (!first || typeof first.latitude !== "number" || typeof first.longitude !== "number" || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)) return null;
		const town = typeof first.name === "string" && first.name !== "" ? first.name : name;
		const label = typeof first.country === "string" && first.country !== "" ? `${town}, ${first.country}` : town;
		return { label, lat: roundCoord(first.latitude), lon: roundCoord(first.longitude) };
	} catch {
		return null;
	}
}

export type ProfilePatch = Partial<{
	timezone: string | null;
	place: string | null;
	lat: number | null;
	lon: number | null;
	paused: boolean;
	hide_reminder_text: boolean;
	levels: Record<string, Level>;
}>;

export type ProfileRow = {
	timezone: string | null;
	place: string | null;
	lat: number | null;
	lon: number | null;
	paused: boolean;
	hideReminderText: boolean;
	levels: Record<string, Level>;
};

// The two calls used, so a test can pass a small fake. The real supabase client fits it.
type Result = PromiseLike<{ data?: unknown; error: unknown }>;
export type ProfileClient = {
	from(table: string): {
		upsert(row: Record<string, unknown>, options: { onConflict: string }): Result;
		select(columns: string): { maybeSingle(): Result };
	};
};

// Saves part of the profile (an upsert on user_id, so the first save creates the row). True when it saved.
export async function saveProfile(client: ProfileClient, userId: string, patch: ProfilePatch): Promise<boolean> {
	try {
		const row: Record<string, unknown> = { ...patch };
		if (typeof patch.lat === "number") row.lat = roundCoord(patch.lat);
		if (typeof patch.lon === "number") row.lon = roundCoord(patch.lon);
		const { error } = await client.from("profile").upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
		return !error;
	} catch {
		return false;
	}
}

const COLUMNS = "timezone,place,lat,lon,paused,hide_reminder_text,levels";

// The saved profile, an empty one when there is no row yet, or "error" when it cannot be read.
export async function loadProfileRow(client: ProfileClient): Promise<ProfileRow | "error"> {
	try {
		const { data, error } = await client.from("profile").select(COLUMNS).maybeSingle();
		if (error) return "error";
		const d = (data ?? {}) as Record<string, unknown>;
		const levels: Record<string, Level> = {};
		for (const [k, v] of Object.entries(d.levels && typeof d.levels === "object" ? (d.levels as Record<string, unknown>) : {})) {
			if (v === "off" || v === "read" || v === "ask" || v === "act") levels[k] = v;
		}
		const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
		return {
			timezone: typeof d.timezone === "string" ? d.timezone : null,
			place: typeof d.place === "string" ? d.place : null,
			lat: num(d.lat),
			lon: num(d.lon),
			paused: d.paused === true,
			hideReminderText: d.hide_reminder_text === true,
			levels,
		};
	} catch {
		return "error";
	}
}

// Once per load (spec 6.2): if the profile has no time zone yet, save the browser's. Silent; a failure is ignored.
export async function ensureTimezone(client: ProfileClient, userId: string, zone: string): Promise<void> {
	try {
		if (zone.trim() === "") return;
		const row = await loadProfileRow(client);
		if (row === "error" || row.timezone !== null) return;
		await saveProfile(client, userId, { timezone: zone });
	} catch {
		// nothing to do
	}
}
