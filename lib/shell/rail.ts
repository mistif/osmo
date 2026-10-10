import { SHIPPED_PANELS, type PanelId, type Route } from "./route";

export type RailId = "talk" | PanelId;
export type RailItem = { id: RailId; label: string; href: string; active: boolean; dot: boolean; sr: string };
const ORDER: { id: RailId; label: string }[] = [
	{ id: "talk", label: "Talk" }, { id: "ideas", label: "Ideas" }, { id: "goals", label: "Goals" }, { id: "library", label: "Library" },
	{ id: "feed", label: "Feed" }, { id: "search", label: "Search" }, { id: "settings", label: "Settings" },
];
const SHIPPED: readonly RailId[] = ["talk", ...SHIPPED_PANELS];
const DOTTED: readonly RailId[] = ["library", "goals"];

export function railItems(route: Route, dots: Partial<Record<RailId, boolean>>, shipped: readonly RailId[] = SHIPPED): RailItem[] {
	return ORDER.filter((o) => shipped.includes(o.id)).map(({ id, label }) => {
		const active = (route.panel ?? "talk") === id;
		const dot = !active && DOTTED.includes(id) && dots[id] === true;
		return { id, label, href: `#${id}`, active, dot, sr: dot ? ", something new" : "" };
	});
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
export function hasNew(seen: string | null, latest: string | null): boolean {
	const a = time(seen), b = time(latest);
	return Number.isFinite(a) && Number.isFinite(b) && b > a;
}

// "Last seen" is a per-device convenience: any storage failure means no dot, never an error.
export type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export function createSeenStore(storage: KeyValue | null, now: () => string) {
	const key = (id: string) => `osmo-seen-${id}`;
	return {
		get(id: string): string | null {
			if (!storage) return null;
			try {
				const saved = storage.getItem(key(id));
				if (saved) return saved;
				const baseline = now(); // a first visit starts quiet
				storage.setItem(key(id), baseline);
				return baseline;
			} catch {
				return null;
			}
		},
		// What was stored for this id, without starting a baseline: null when nothing was, or storage fails.
		peek(id: string): string | null {
			try {
				return storage?.getItem(key(id)) ?? null;
			} catch {
				return null;
			}
		},
		mark(id: string): void {
			try {
				storage?.setItem(key(id), now());
			} catch {
				/* best-effort */
			}
		},
	};
}
