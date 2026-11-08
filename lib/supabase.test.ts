import { afterEach, describe, expect, it, vi } from "vitest";

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("the browser Supabase client", () => {
	it("importing the module without Supabase settings does not throw (a build with no env, such as CI or a preview)", async () => {
		vi.stubEnv(URL_KEY, "");
		vi.stubEnv(ANON_KEY, "");
		await expect(import("./supabase")).resolves.toBeDefined();
	});

	it("using it without Supabase settings throws a clear error that names the missing settings", async () => {
		vi.stubEnv(URL_KEY, "");
		vi.stubEnv(ANON_KEY, "");
		const { supabase, ensureSession } = await import("./supabase");
		expect(() => supabase.auth).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
		await expect(ensureSession()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
	});

	it("builds the client on first use and then keeps the one it built", async () => {
		vi.stubEnv(URL_KEY, "https://example.supabase.co");
		vi.stubEnv(ANON_KEY, "publishable-test-key");
		const { supabase } = await import("./supabase");
		expect(typeof supabase.from).toBe("function");
		expect(supabase.auth).toBe(supabase.auth);
	});
});
