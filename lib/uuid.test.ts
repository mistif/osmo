import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newId", () => {
	it("returns a v4 uuid", () => {
		expect(newId()).toMatch(V4);
	});

	it("still works when crypto.randomUUID is unavailable (insecure http origin)", () => {
		vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
		expect(newId()).toMatch(V4);
		expect(newId()).not.toBe(newId());
	});
});
