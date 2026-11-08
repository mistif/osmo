// Local times to UTC and back (spec 3.2, 6.2). The model writes local time, YYYY-MM-DDTHH:MM, in the saved zone; code converts it.
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const YEAR_MS = 366 * 86_400_000;

// How far the zone's wall clock is ahead of UTC at this instant. Throws on an unknown zone.
function offsetMs(utc: number, tz: string): number {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
			.formatToParts(new Date(utc))
			.map((x) => [x.type, x.value]),
	);
	return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utc / 1000) * 1000;
}

export function localToUtc(local: string, tz: string): number | null {
	const m = LOCAL.exec(local);
	if (!m) return null;
	const [y, mo, d, h, mi] = m.slice(1).map(Number),
		naive = Date.UTC(y, mo - 1, d, h, mi),
		back = new Date(naive);
	// A date that rolled over (30 February, 24:00, minute 60) is not a time.
	if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi) return null;
	try {
		const utc = naive - offsetMs(naive - offsetMs(naive, tz), tz); // two passes settle a DST edge; a bad zone throws
		// A time the clocks skipped (the spring-forward gap) does not exist: it does not read back as itself in the zone.
		return utc + offsetMs(utc, tz) === naive ? utc : null;
	} catch {
		return null;
	}
}

// The UTC instant, only when it is after now and at most 366 days ahead.
export const validDue = (local: string, tz: string, now: number): number | null => {
	const t = localToUtc(local, tz);
	return t !== null && t > now && t <= now + YEAR_MS ? t : null;
};

function parts(utc: number, tz: string): Record<string, string> {
	const format = (timeZone: string) =>
		Object.fromEntries(
			new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
				.formatToParts(new Date(utc))
				.map((x) => [x.type, x.value]),
		);
	try {
		return format(tz);
	} catch {
		return format("UTC"); // an unknown zone falls back to UTC
	}
}

// "Thursday 8 October at 09:00", for a line Osmo says.
export const speak = (utc: number, tz: string): string => {
	const p = parts(utc, tz);
	return `${p.weekday} ${p.day} ${p.month} at ${p.hour}:${p.minute}`;
};

// What the model is told "now" is: the saved zone, UTC when none is saved.
export const todayLine = (now: number, tz: string | null): string => {
	const p = parts(now, tz ?? "UTC");
	return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
};
