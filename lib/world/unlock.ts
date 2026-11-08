// When each room may start (spec 4, "Unlocking"), pure. The hall starts on day one; the library when memory has its
// first fact or the first note exists; the workshop when the first thing he made exists; the study when the first
// idea or goal exists; the gate when the first reminder is set; the observatory when Settings has been opened in the
// new shell on this device. The counts are read once per visit (village-counts.ts); a room that has started stays in
// the queue whatever the counts say later (village.ts), so forgetting the last note never takes the library away.
import { CASTLE_ROOMS, type CastleRoom } from "./blueprints/types";

export type VillageCounts = { memories: number; notes: number; things: number; reminders: number; ideas: number; goals: number };
export const NO_COUNTS: VillageCounts = { memories: 0, notes: 0, things: 0, reminders: 0, ideas: 0, goals: 0 };
export type UnlockInput = { counts: VillageCounts; settingsOpened: boolean };
// The id under which the shell's per-device seen store keeps "Settings has been opened" (lib/shell/rail.ts).
export const SETTINGS_SEEN = "settings";

// A count as a whole number of at least 0: anything else (NaN, negative, a string) counts as none.
const whole = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
export function cleanCounts(raw: Partial<Record<keyof VillageCounts, unknown>>): VillageCounts {
	return {
		memories: whole(raw.memories),
		notes: whole(raw.notes),
		things: whole(raw.things),
		reminders: whole(raw.reminders),
		ideas: whole(raw.ideas),
		goals: whole(raw.goals),
	};
}

const RULES: Readonly<Record<CastleRoom, (i: UnlockInput) => boolean>> = {
	hall: () => true,
	library: (i) => i.counts.memories > 0 || i.counts.notes > 0,
	workshop: (i) => i.counts.things > 0,
	// Ideas and Goals are the shell's phase B, not built yet: their counts are 0 until a reader for them exists, and
	// then this rule needs no change.
	study: (i) => i.counts.ideas > 0 || i.counts.goals > 0,
	gate: (i) => i.counts.reminders > 0,
	observatory: (i) => i.settingsOpened,
};

// The rooms that may be built, in spec order.
export function openRooms(i: UnlockInput): CastleRoom[] {
	const counts = cleanCounts(i.counts);
	return CASTLE_ROOMS.filter((room) => RULES[room]({ counts, settingsOpened: i.settingsOpened === true }));
}
