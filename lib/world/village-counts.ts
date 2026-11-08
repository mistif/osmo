// What the unlock rules and the context line count (spec 4 and 5), read once per visit with the readers Library and
// Feed already use, so the counts match what their panels show (notes up to 100, things up to 200 versions, reminders
// up to 100). A reader that fails counts as none: its room simply waits for the next visit. Not unit-tested (network);
// the rules it feeds are (unlock.ts).
import { latestOfChains } from "@/lib/artifacts/things";
import { readMemoryDates, readNotes, readReminders, readThings } from "@/lib/shell/data";
import { cleanCounts, type VillageCounts } from "./unlock";

export async function readVillageCounts(): Promise<VillageCounts> {
	const [dates, notes, things, reminders] = await Promise.all([
		readMemoryDates().catch(() => ({})),
		readNotes().catch(() => null),
		readThings().catch(() => null),
		readReminders().catch(() => null),
	]);
	return cleanCounts({
		memories: Object.keys(dates).length,
		notes: notes?.rows.length ?? 0,
		things: things ? latestOfChains(things.rows).length : 0,
		reminders: reminders?.rows.length ?? 0,
		// Ideas and Goals (the shell's phase B) are not built yet: when they are, their readers fill these two.
		ideas: 0,
		goals: 0,
	});
}
