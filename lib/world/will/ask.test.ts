import { describe, expect, it, vi } from "vitest";
import { askWill, WILL_URL } from "./ask";
import type { WillBody } from "./types";

const BODY: WillBody = {
	candidates: [
		{ name: "well", place: "on the east island", size: "small", parts: [], fresh: false },
		{ name: "tower", place: "on the east island", size: "medium", parts: [], fresh: true },
		{ name: "garden", place: "on the home island", size: "small", parts: [], fresh: false },
	],
	mood: "calm",
	recent: [],
};
const USAGE = { usedToday: 641, usable: 630_000 };
const answering = (status: number, body: unknown) => vi.fn<typeof fetch>(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("asking the will (spec 5)", () => {
	it("posts the body with Gur's token and reads the model's pick and line", async () => {
		const f = answering(200, { source: "model", pick: 2, line: "I wanted something growing beside the houses.", usage: USAGE });
		expect(await askWill(f, "tok", BODY)).toEqual({ source: "model", pick: 2, line: "I wanted something growing beside the houses.", usage: USAGE });
		expect(f.mock.calls[0][0]).toBe(WILL_URL);
		const init = f.mock.calls[0][1];
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
		expect(JSON.parse(String(init?.body))).toEqual(BODY);
	});
	it("keeps a pick whose line the route dropped", async () => {
		expect(await askWill(answering(200, { source: "model", pick: 0, line: null, usage: USAGE }), "tok", BODY)).toEqual({ source: "model", pick: 0, line: null, usage: USAGE });
	});
	it("passes the route's own fallbacks on", async () => {
		expect(await askWill(answering(200, { source: "fallback", reason: "off", usage: null }), "tok", BODY)).toEqual({ source: "fallback", reason: "off", usage: null });
		expect(await askWill(answering(200, { source: "fallback", reason: "allowance", usage: USAGE }), "tok", BODY)).toEqual({ source: "fallback", reason: "allowance", usage: USAGE });
	});
	it("falls back, never throws, on an HTTP error, a bad answer, a network error or the time running out", async () => {
		expect(await askWill(answering(500, "oops"), "tok", BODY)).toEqual({ source: "fallback", reason: "http", usage: null });
		for (const bad of ["not json", { source: "model", pick: 3, line: "x", usage: USAGE }, { source: "model", pick: 1, line: "x".repeat(141), usage: USAGE }, { source: "model", pick: 1, line: "ok", usage: null }, { source: "fallback", reason: "gone", usage: null }]) {
			expect(await askWill(answering(200, bad), "tok", BODY), JSON.stringify(bad)).toEqual({ source: "fallback", reason: "bad_answer", usage: null });
		}
		const broken = vi.fn<typeof fetch>(async () => {
			throw new TypeError("network");
		});
		expect(await askWill(broken, "tok", BODY)).toEqual({ source: "fallback", reason: "network", usage: null });
		const never = vi.fn<typeof fetch>((_u, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
		expect(await askWill(never, "tok", BODY, 10)).toEqual({ source: "fallback", reason: "timeout", usage: null });
	});
});
