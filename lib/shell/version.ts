// What build this is, for Settings: the package version, the commit it was built from and the day.
// next.config.ts fills the three public variables at build time; a dev build has whatever git says locally.

export const OSMO_VERSION = process.env.NEXT_PUBLIC_OSMO_VERSION ?? "0.0.0";
export const OSMO_BUILD = process.env.NEXT_PUBLIC_OSMO_BUILD ?? "local";
export const OSMO_BUILT_AT = process.env.NEXT_PUBLIC_OSMO_BUILT_AT ?? "";

// "Version 0.2.0, build 8b16119, 8 October 2026." A missing date leaves it out; a bad one too.
export function versionLine(version: string, build: string, builtAt: string): string {
	const day = dayOf(builtAt);
	const parts = [`Version ${version}`, `build ${build}`];
	if (day) parts.push(day);
	return parts.join(", ") + ".";
}

function dayOf(iso: string): string | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return null;
	return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(t));
}
