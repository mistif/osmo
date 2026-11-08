import { type RefObject, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createNav, NAVIGATE_EVENT, type NavWindow } from "@/lib/shell/nav";
import { type RailId, railItems } from "@/lib/shell/rail";
import { type PanelId, parseRoute, type Route } from "@/lib/shell/route";
import { useRailDots } from "./use-rail-dots";

const TYPING = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea";

// Reads window only when a method runs, so building it during server render is safe.
const browser: NavWindow = {
	get location() {
		return window.location;
	},
	get history() {
		return window.history;
	},
};

function subscribe(onChange: () => void) {
	window.addEventListener("popstate", onChange);
	window.addEventListener("hashchange", onChange);
	window.addEventListener(NAVIGATE_EVENT, onChange);
	return () => {
		window.removeEventListener("popstate", onChange);
		window.removeEventListener("hashchange", onChange);
		window.removeEventListener(NAVIGATE_EVENT, onChange);
	};
}

// Panel state is the page hash, read with useSyncExternalStore and never a route. Everything below is
// inert when `enabled` is false: the hash reads as empty and no listener is added.
export function useShell(enabled: boolean, stageRef: RefObject<HTMLElement | null>, ready: boolean) {
	const getHash = useCallback(() => (enabled ? window.location.hash : ""), [enabled]);
	const hash = useSyncExternalStore(subscribe, getHash, () => "");
	const route = useMemo(() => parseRoute(hash), [hash]);

	const links = useRef<Partial<Record<RailId, HTMLAnchorElement | null>>>({});
	const refs = useRef<Partial<Record<RailId, (el: HTMLAnchorElement | null) => void>>>({});
	const linkRef = useCallback((id: RailId) => {
		return (refs.current[id] ??= (el: HTMLAnchorElement | null) => {
			links.current[id] = el;
		});
	}, []);

	const nav = useMemo(() => createNav(browser, () => window.dispatchEvent(new Event(NAVIGATE_EVENT))), []);
	// Closing returns focus to the rail link the panel belonged to.
	const focusBack = useCallback((previous: PanelId | null) => {
		requestAnimationFrame(() => links.current[previous ?? "talk"]?.focus());
	}, []);
	const close = useCallback(() => focusBack(nav.close()), [nav, focusBack]);
	const navigate = useCallback(
		(id: RailId) => {
			const previous = parseRoute(window.location.hash).panel;
			if (nav.navigate(id)) focusBack(previous);
		},
		[nav, focusBack],
	);

	useEffect(() => {
		const stage = stageRef.current;
		if (!enabled || !stage) return;
		const set = (on: boolean) => stage.toggleAttribute("data-typing", on);
		const onIn = (e: Event) => set(e.target instanceof Element && e.target.matches(TYPING));
		const onOut = () => set(false);
		stage.addEventListener("focusin", onIn);
		stage.addEventListener("focusout", onOut);
		return () => {
			stage.removeEventListener("focusin", onIn);
			stage.removeEventListener("focusout", onOut);
			stage.removeAttribute("data-typing");
		};
	}, [enabled, stageRef]);

	const dots = useRailDots(enabled, ready, route.panel);
	const items = useMemo(() => railItems(route, { library: dots.library }), [route, dots.library]);

	return {
		route,
		items,
		navigate,
		open: nav.open as (panel: PanelId, page?: string, item?: string) => void,
		go: nav.go as (to: Route, kind?: "push" | "replace") => void,
		close,
		back: nav.back,
		linkRef,
	};
}
