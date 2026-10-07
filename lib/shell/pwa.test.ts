import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
		expect(Object.keys(listeners).sort()).toEqual(["activate", "install"]);
		listeners.install({ waitUntil: () => {} });
		listeners.activate({ waitUntil: () => {} });
		expect(calls).toEqual(["skipWaiting", "claim"]);
		expect(listeners.fetch).toBeUndefined();
	});
});
