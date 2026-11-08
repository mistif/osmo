import { afterEach, describe, expect, it, vi } from "vitest";

const ALL = { NEXT_PUBLIC_OSMO_SHELL2: "on", NEXT_PUBLIC_OSMO_WORLD: "on", NEXT_PUBLIC_OSMO_BIGWORLD: "on", NEXT_PUBLIC_OSMO_BUILDS: "on" };
const load = async (env: Record<string, string>) => {
	vi.unstubAllEnvs();
	for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
	vi.resetModules();
	return import("./flags");
};
afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("the free-will switches", () => {
	it("are off with nothing set", async () => {
		const f = await load({});
		expect([f.BIGWORLD, f.BUILDS]).toEqual([false, false]);
	});
	it("are on only when every switch up the chain is exactly on", async () => {
		const pair = async (env: Record<string, string>) => {
			const f = await load(env);
			return [f.BIGWORLD, f.BUILDS];
		};
		expect(await pair(ALL)).toEqual([true, true]);
		expect(await pair({ ...ALL, NEXT_PUBLIC_OSMO_WORLD: "off" })).toEqual([false, false]);
		expect(await pair({ ...ALL, NEXT_PUBLIC_OSMO_BIGWORLD: "ON" })).toEqual([false, false]);
		expect(await pair({ ...ALL, NEXT_PUBLIC_OSMO_BUILDS: "on " })).toEqual([true, false]);
	});
});
