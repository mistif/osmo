import { describe, expect, it } from "vitest";
import { bearerToken, requireUser } from "./auth";

const withHeader = (value?: string) => new Request("https://osmo.test/api/speak", value ? { headers: { authorization: value } } : undefined);

describe("bearerToken", () => {
	it("reads the token out of the header", () => {
		expect(bearerToken(withHeader("Bearer abc.def"))).toBe("abc.def");
	});

	it("doesn't care how Bearer is spelled", () => {
		expect(bearerToken(withHeader("bearer abc"))).toBe("abc");
	});

	it("is null when the header is missing, empty or another scheme", () => {
		expect(bearerToken(withHeader())).toBeNull();
		expect(bearerToken(withHeader("Bearer "))).toBeNull();
		expect(bearerToken(withHeader("Basic abc"))).toBeNull();
		expect(bearerToken(withHeader("abc"))).toBeNull();
	});
});

describe("requireUser", () => {
	it("gives the user the token belongs to", async () => {
		const lookup = async (token: string) => (token === "good" ? { id: "gur" } : null);
		await expect(requireUser(withHeader("Bearer good"), lookup)).resolves.toEqual({ id: "gur" });
	});

	it("is null for a token nobody owns", async () => {
		await expect(requireUser(withHeader("Bearer bad"), async () => null)).resolves.toBeNull();
	});

	it("never asks about a missing token", async () => {
		let asked = false;
		const lookup = async () => {
			asked = true;
			return { id: "gur" };
		};
		await expect(requireUser(withHeader(), lookup)).resolves.toBeNull();
		expect(asked).toBe(false);
	});

	it("is null when the check itself fails, rather than throwing", async () => {
		const lookup = async () => {
			throw new Error("supabase unreachable");
		};
		await expect(requireUser(withHeader("Bearer good"), lookup)).resolves.toBeNull();
	});
});
