// The clips of Osmo's voice this device has already heard, kept in IndexedDB.
// Because his replies come from a finite set of sentences, the same lines come back often, and a
// cached line costs nothing and plays at once. Storage can be missing or refused (a private window),
// so every call here fails quietly: no cache is slower, never broken.

import { evictions, type CacheEntry } from "../tts";

const DB_NAME = "osmo-voice";
const STORE = "clips";
const VERSION = 1;

type Row = CacheEntry & { blob: Blob };

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function open(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") return Promise.resolve(null);
	return new Promise((resolve) => {
		try {
			const opening = indexedDB.open(DB_NAME, VERSION);
			opening.onupgradeneeded = () => {
				const db = opening.result;
				if (!db.objectStoreNames.contains(STORE)) {
					db.createObjectStore(STORE, { keyPath: "key" }).createIndex("usedAt", "usedAt");
				}
			};
			opening.onsuccess = () => resolve(opening.result);
			opening.onerror = () => resolve(null);
			opening.onblocked = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
}

// The clip for this key, or null. Reading one marks it as just used, so eviction keeps what he says most.
export async function cachedClip(key: string): Promise<Blob | null> {
	const db = await open();
	if (!db) return null;
	try {
		const store = db.transaction(STORE, "readwrite").objectStore(STORE);
		const row = await request<Row | undefined>(store.get(key));
		if (!row) return null;
		store.put({ ...row, usedAt: Date.now() });
		return row.blob;
	} catch {
		return null;
	} finally {
		db.close();
	}
}

// Keeps a clip, then drops the longest unused ones if this device is holding too much.
export async function keepClip(key: string, blob: Blob): Promise<void> {
	const db = await open();
	if (!db) return;
	try {
		const store = db.transaction(STORE, "readwrite").objectStore(STORE);
		store.put({ key, blob, bytes: blob.size, usedAt: Date.now() } satisfies Row);
		const rows = await request<Row[]>(store.getAll());
		for (const stale of evictions(rows.map(({ key: k, bytes, usedAt }) => ({ key: k, bytes, usedAt })))) {
			store.delete(stale);
		}
	} catch {
		// A full or unavailable store just means he re-fetches this line next time.
	} finally {
		db.close();
	}
}
