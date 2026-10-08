export type PanelId = "ideas" | "goals" | "library" | "feed" | "search" | "settings";
export type Route = { panel: PanelId | null; page?: string; item?: string };
export const TALK: Route = { panel: null };
export const SHIPPED_PANELS: readonly PanelId[] = ["library", "feed", "settings"];
export const SETTINGS_PAGES = ["devices", "voice", "may-do", "place", "about"] as const;
export const LIBRARY_FILTERS = ["memory", "notes", "things", "links"] as const;
const ALL: readonly PanelId[] = ["ideas", "goals", "library", "feed", "search", "settings"];
const PAGES: Partial<Record<PanelId, readonly string[]>> = { library: LIBRARY_FILTERS, settings: SETTINGS_PAGES };
const ITEM_ONLY: readonly PanelId[] = ["ideas", "goals"];

function decode(s: string | undefined): string | null {
	if (!s) return null;
	try {
		const v = decodeURIComponent(s);
		return v && v.length <= 120 ? v : null;
	} catch {
		return null;
	}
}

export function parseRoute(hash: string, shipped: readonly PanelId[] = SHIPPED_PANELS): Route {
	const parts = hash.replace(/^#/, "").split("/");
	let name = parts[0];
	let rest = parts.slice(1);
	if (name === "memory") [name, rest] = ["library", ["memory"]];
	else if (name === "insights") [name, rest] = ["feed", []];
	const panel = ALL.find((p) => p === name);
	if (!panel || !shipped.includes(panel)) return TALK;
	if (ITEM_ONLY.includes(panel)) {
		const item = decode(rest[0]);
		return item ? { panel, item } : { panel };
	}
	const page = PAGES[panel]?.find((p) => p === rest[0]);
	if (!page) return { panel };
	const item = panel === "library" ? decode(rest[1]) : null;
	return item ? { panel, page, item } : { panel, page };
}

export function routeHash(r: Route): string {
	if (!r.panel) return "";
	const segs: string[] = [r.panel];
	if (r.page) segs.push(r.page);
	if (r.item && (r.page || ITEM_ONLY.includes(r.panel))) segs.push(encodeURIComponent(r.item));
	return `#${segs.join("/")}`;
}

export function parentRoute(r: Route): Route {
	if (r.panel && r.item) return r.page ? { panel: r.panel, page: r.page } : { panel: r.panel };
	if (r.panel === "settings" && r.page) return { panel: "settings" };
	return TALK;
}

// Talk to a place and into a page or row push one entry; rail to rail and filter changes replace it.
export function navKind(from: Route, to: Route): "push" | "replace" {
	if (from.panel === null) return "push";
	if (from.panel !== to.panel) return "replace";
	if (to.item !== from.item) return "push";
	if (from.panel === "settings" && !from.page && to.page) return "push";
	return "replace";
}
