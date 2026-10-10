import { useCallback, useEffect, useRef, useState } from "react";
import { latestLibraryStamp } from "@/lib/shell/data";
import { createSeenStore, hasNew, type KeyValue } from "@/lib/shell/rail";
import { SETTINGS_SEEN } from "@/lib/world/unlock";
import type { PanelId } from "@/lib/shell/route";

// Storage can be missing or throw (private windows, blocked site data): then there is no dot. The village reads the
// same store (components/osmo/world.tsx).
export function safeLocalStorage(): KeyValue | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

// The Library dot: something was added since Gur last opened Library on this device.
export function useRailDots(enabled: boolean, ready: boolean, panel: PanelId | null) {
	const [library, setLibrary] = useState(false);
	// Created on first use inside an effect or callback, so render never touches storage.
	const storeRef = useRef<ReturnType<typeof createSeenStore> | null>(null);
	const store = useCallback(() => (storeRef.current ??= createSeenStore(safeLocalStorage(), () => new Date().toISOString())), []);
	// Resolves to whether something is newer than last seen; never rejects.
	const newer = useCallback(async (): Promise<boolean> => {
		try {
			return hasNew(store().get("library"), await latestLibraryStamp());
		} catch {
			return false;
		}
	}, [store]);

	useEffect(() => {
		if (!enabled || !ready) return;
		let live = true;
		const check = () => void newer().then((v) => live && setLibrary(v));
		check();
		window.addEventListener("focus", check);
		return () => {
			live = false;
			window.removeEventListener("focus", check);
		};
	}, [enabled, ready, newer]);

	useEffect(() => {
		if (!enabled || !ready || panel !== "library") return;
		let live = true;
		store().mark("library");
		void newer().then((v) => live && setLibrary(v));
		return () => {
			live = false;
		};
	}, [enabled, ready, panel, store, newer]);

	// Settings opened in the new shell, kept per device: the village's observatory unlocks on it (lib/world/unlock.ts).
	useEffect(() => {
		if (enabled && ready && panel === "settings") store().mark(SETTINGS_SEEN);
	}, [enabled, ready, panel, store]);

	return { library };
}
