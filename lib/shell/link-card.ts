// The card title for an address in a line (spec 2.6): the words before "Name: <address>", else the host.
export function linkTitle(text: string, index: number, host: string): string {
	const fallback = host.replace(/^www\./, "");
	const before = text.slice(0, index).trimEnd();
	if (!before.endsWith(":")) return fallback;
	const fragment = before.slice(0, -1).split(/[.!?]\s+|\n/).pop()?.trim() ?? "";
	return fragment ? Array.from(fragment).slice(0, 60).join("") : fallback;
}
