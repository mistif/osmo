import type { OwnerDb } from "../server/admin";
import type { Level, Profile } from "./types";

export const DEFAULT_PROFILE: Profile = { timezone: null, place: null, paused: false, hideReminderText: false, levels: {} };

export const levelOf = (p: Profile, connector: string): Level => p.levels[connector] ?? "off";

export async function loadProfile(db: OwnerDb): Promise<Profile> {
	const { data, error } = await db.from("profile").select("timezone,place,lat,lon,paused,hide_reminder_text,levels").maybeSingle();
	if (error) return { ...DEFAULT_PROFILE, paused: true }; // a check that broke refuses
	if (!data) return DEFAULT_PROFILE;
	const d = data as Record<string, unknown>,
		levels: Record<string, Level> = {};
	for (const [k, v] of Object.entries((d.levels ?? {}) as Record<string, unknown>)) {
		if (v === "off" || v === "read" || v === "ask" || v === "act") levels[k] = v;
	}
	const place = typeof d.place === "string" && typeof d.lat === "number" && typeof d.lon === "number" ? { label: d.place, lat: d.lat, lon: d.lon } : null;
	return {
		timezone: typeof d.timezone === "string" ? d.timezone : null,
		place,
		paused: d.paused === true,
		hideReminderText: d.hide_reminder_text === true,
		levels,
	};
}
