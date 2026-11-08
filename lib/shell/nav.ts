import { navKind, parentRoute, parseRoute, routeHash, TALK, type PanelId, type Route } from "./route";
import type { RailId } from "./rail";

// The slice of `window` that navigation touches, so the state machine runs against a fake in tests.
export type NavWindow = {
	location: { pathname: string; search: string; hash: string };
	history: {
		state: unknown;
		pushState(state: unknown, title: string, url: string): void;
		replaceState(state: unknown, title: string, url: string): void;
		back(): void;
	};
};

export const NAVIGATE_EVENT = "osmo:navigate";

// Panel state is the page hash. Opening from Talk and into a page or row pushes one entry (marked
// osmoPush, so Back knows it can step back); rail to rail replaces. A deep link has no mark, so
// Back from it goes up one level instead of leaving the app.
export function createNav(win: NavWindow, notify: () => void) {
	const current = () => parseRoute(win.location.hash);

	function go(to: Route, kind?: "push" | "replace"): void {
		const how = kind ?? navKind(current(), to);
		const url = win.location.pathname + win.location.search + routeHash(to);
		if (how === "push") win.history.pushState({ osmoPush: true }, "", url);
		else win.history.replaceState(win.history.state, "", url);
		notify();
	}
	// Returns the panel it left, so the caller can put focus back on that rail link.
	function close(): PanelId | null {
		const previous = current().panel;
		go(TALK);
		return previous;
	}
	// Returns true when it closed the panel (Talk, or the active item with no page open).
	function navigate(id: RailId): boolean {
		const route = current();
		if (id === "talk" || (route.panel === id && !route.page && !route.item)) {
			close();
			return true;
		}
		go({ panel: id });
		return false;
	}
	function open(panel: PanelId, page?: string, item?: string): void {
		go({ panel, page, item });
	}
	function back(): void {
		const state = win.history.state as { osmoPush?: boolean } | null;
		if (state?.osmoPush) win.history.back();
		else go(parentRoute(current()), "replace");
	}
	return { go, close, navigate, open, back };
}
