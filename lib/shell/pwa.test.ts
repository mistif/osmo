import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { MANIFEST } from "./pwa";

const root = join(__dirname, "..", "..");

describe("the manifest", () => {
	it("makes Osmo an installable standalone app", () => {
		expect(MANIFEST.name).toBe("Osmo");
		expect(MANIFEST.start_url).toBe("/");
		expect(MANIFEST.display).toBe("standalone");
		expect(typeof MANIFEST.theme_color).toBe("string");
		expect(typeof MANIFEST.background_color).toBe("string");
	});

	it("lists 192 and 512 icons for any, and one 512 maskable", () => {
		const icons = MANIFEST.icons ?? [];
		const any = icons.filter((i) => i.purpose === "any").map((i) => i.sizes);
		expect(any).toContain("192x192");
		expect(any).toContain("512x512");
		const maskable = icons.filter((i) => i.purpose === "maskable");
		expect(maskable).toHaveLength(1);
		expect(maskable[0].sizes).toBe("512x512");
	});

	it("points every icon at a file under public/", () => {
		for (const icon of MANIFEST.icons ?? []) {
			expect(existsSync(join(root, "public", icon.src)), icon.src).toBe(true);
		}
		expect(existsSync(join(root, "app", "apple-icon.png"))).toBe(true);
	});
});

describe("next.config headers", () => {
	it("never caches /sw.js and keeps the global frame ban", async () => {
		const entries = (await nextConfig.headers?.()) ?? [];
		const sw = entries.find((e) => e.source === "/sw.js");
		expect(sw?.headers).toContainEqual({
			key: "Cache-Control",
			value: "no-cache, no-store, must-revalidate",
		});
		const all = entries.find((e) => e.source === "/:path*");
		expect(all?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
	});
});

describe("public/sw.js", () => {
	it("takes over at once and never serves a cached page", () => {
		const source = readFileSync(join(root, "public", "sw.js"), "utf8");
		const listeners: Record<string, (e: { waitUntil: (p: unknown) => void }) => void> = {};
		const calls: string[] = [];
		const self = {
			addEventListener: (type: string, fn: (e: { waitUntil: (p: unknown) => void }) => void) => {
				listeners[type] = fn;
			},
			skipWaiting: () => calls.push("skipWaiting"),
			clients: { claim: () => calls.push("claim") },
		};
		new Function("self", source)(self);
		expect(Object.keys(listeners).sort()).toEqual(["activate", "install", "notificationclick", "push"]);
		listeners.install({ waitUntil: () => {} });
		listeners.activate({ waitUntil: () => {} });
		expect(calls).toEqual(["skipWaiting", "claim"]);
		expect(listeners.fetch).toBeUndefined();
	});
});

// public/sw.js evaluated with a fake self, for the push and click handlers.
type Ev = { waitUntil: (p: Promise<unknown>) => void; data?: { json(): unknown } | null; notification?: { close(): void } };
function loadWorker(windows: { focus(): unknown }[] = []) {
	const source = readFileSync(join(root, "public", "sw.js"), "utf8");
	const listeners: Record<string, (e: Ev) => void> = {};
	const shown: { title: string; options: Record<string, unknown> }[] = [];
	const opened: string[] = [];
	const self = {
		addEventListener: (type: string, fn: (e: Ev) => void) => {
			listeners[type] = fn;
		},
		skipWaiting: () => {},
		registration: {
			showNotification: (title: string, options: Record<string, unknown>) => {
				shown.push({ title, options });
				return Promise.resolve();
			},
		},
		clients: {
			claim: () => {},
			matchAll: () => Promise.resolve(windows),
			openWindow: (url: string) => {
				opened.push(url);
				return Promise.resolve();
			},
		},
	};
	new Function("self", source)(self);
	const fire = async (type: string, e: Partial<Ev>) => {
		const waits: Promise<unknown>[] = [];
		listeners[type]({ waitUntil: (p) => waits.push(p), ...e });
		await Promise.all(waits);
		return waits.length;
	};
	return { fire, shown, opened };
}

describe("public/sw.js push", () => {
	it("shows the pushed title and body inside waitUntil", async () => {
		const w = loadWorker();
		const waits = await w.fire("push", { data: { json: () => ({ title: "Osmo", body: "Call Dad" }) } });
		expect(waits).toBe(1);
		expect(w.shown).toHaveLength(1);
		expect(w.shown[0].title).toBe("Osmo");
		expect(w.shown[0].options).toMatchObject({ body: "Call Dad" });
	});

	it("still shows a notification when there is no data or the data is bad", async () => {
		const w = loadWorker();
		await w.fire("push", { data: null });
		await w.fire("push", {
			data: {
				json: () => {
					throw new Error("bad json");
				},
			},
		});
		await w.fire("push", { data: { json: () => "just text" } });
		expect(w.shown.map((n) => n.title)).toEqual(["Osmo", "Osmo", "Osmo"]);
		expect(w.shown[0].options).toMatchObject({ body: "" });
	});

	it("closes the notification on a tap and focuses an open window", async () => {
		const focus = vi.fn();
		const w = loadWorker([{ focus }]);
		const close = vi.fn();
		await w.fire("notificationclick", { notification: { close } });
		expect(close).toHaveBeenCalled();
		expect(focus).toHaveBeenCalled();
		expect(w.opened).toEqual([]);
	});

	it("opens Osmo when no window is open", async () => {
		const w = loadWorker([]);
		const close = vi.fn();
		await w.fire("notificationclick", { notification: { close } });
		expect(close).toHaveBeenCalled();
		expect(w.opened).toEqual(["/"]);
	});
});
