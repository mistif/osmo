import type { OwnerDb } from "../server/admin";
import type { Level, Profile } from "./types";

export const DEFAULT_PROFILE: Profile = { timezone: null, place: null, paused: false, hideReminderText: false, levels: {} };

// The crisis marker (a crisis cancel was made at this time, epoch ms) lives in profile.levels under this reserved key,
// because a column would need a migration. loadProfile ignores it (it is not a level), and the browser's own levels
// save, which writes the whole object, may drop it: that is fine, it only matters for the seconds after a crisis.
export const CRISIS_KEY = "_crisis_at";

export const levelOf = (p: Profile, connector: string): Level => p.levels[connector] ?? "off";

// Records a crisis at "at", keeping the levels as they are. Throws if the db does; callers decide whether that matters.
export async function markCrisis(db: OwnerDb, at: number): Promise<void> {
	const { data, error } = await db.from("profile").select("levels").maybeSingle();
	if (error) throw new Error("profile_read");
	const old = (data as { levels?: unknown } | null)?.levels;
	const levels = old && typeof old === "object" && !Array.isArray(old) ? (old as Record<string, unknown>) : {};
	const { error: failed } = await db.from("profile").upsert({ levels: { ...levels, [CRISIS_KEY]: at } }, "user_id");
	if (failed) throw new Error("profile_write");
}

// True when a crisis was recorded after "since". A profile that cannot be read says false: the run was already allowed to start.
export async function crisisSince(db: OwnerDb, since: number): Promise<boolean> {
	try {
		const { data, error } = await db.from("profile").select("levels").maybeSingle();
		if (error || !data) return false;
		const at = ((data as { levels?: unknown }).levels as Record<string, unknown> | null | undefined)?.[CRISIS_KEY];
		return typeof at === "number" && Number.isFinite(at) && at > since;
	} catch {
		return false;
	}
}

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
