import { describe, expect, it } from "vitest";
import { open, seal } from "./crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");
const W = { userId: "u1", provider: "google", column: "access_enc" };

describe("seal and open", () => {
	it("round trips", () => {
		expect(open(seal("tok", KEY, W), KEY, W)).toBe("tok");
		expect(open(seal("", KEY, W), KEY, W)).toBe("");
		const odd = "t" + String.fromCharCode(246) + "ken";
		expect(open(seal(odd, KEY, W), KEY, W)).toBe(odd);
	});

	it("two seals of one text differ", () => {
		expect(seal("tok", KEY, W)).not.toBe(seal("tok", KEY, W));
	});

	it("has the v1.iv.body shape", () => {
		expect(seal("tok", KEY, W)).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
	});

	it("binds the ciphertext to its row", () => {
		const s = seal("tok", KEY, W);
		expect(open(s, KEY, W)).toBe("tok");
		for (const w of [{ ...W, userId: "u2" }, { ...W, provider: "spotify" }, { ...W, column: "refresh_enc" }]) {
			expect(() => open(s, KEY, w)).toThrow("decrypt_failed");
		}
	});

	it("rejects a flipped ciphertext byte", () => {
		const [v, iv, body] = seal("tok", KEY, W).split(".");
		const raw = Buffer.from(body, "base64url");
		raw[0] ^= 1;
		expect(() => open(`${v}.${iv}.${raw.toString("base64url")}`, KEY, W)).toThrow("decrypt_failed");
	});

	it("rejects a wrong key, a wrong version and junk", () => {
		const s = seal("tok", KEY, W);
		expect(() => open(s, Buffer.alloc(32, 8).toString("base64"), W)).toThrow("decrypt_failed");
		expect(() => open(s.replace(/^v1\./, "v2."), KEY, W)).toThrow("decrypt_failed");
		expect(() => open("", KEY, W)).toThrow("decrypt_failed");
		expect(() => open("v1.x", KEY, W)).toThrow("decrypt_failed");
	});

	it("rejects a body too short to hold the 16-byte tag", () => {
		const [v, iv] = seal("tok", KEY, W).split(".");
		for (const n of [0, 10, 15]) {
			const body = Buffer.alloc(n, 1).toString("base64url");
			const run = () => open(`${v}.${iv}.${body || "A"}`, KEY, W);
			expect(run).toThrow("decrypt_failed");
		}
	});

	it("does not let a separator in a field move the boundary between fields", () => {
		const a = { userId: "u1|google", provider: "x", column: "c" };
		const b = { userId: "u1", provider: "google|x", column: "c" };
		expect(open(seal("tok", KEY, a), KEY, a)).toBe("tok");
		expect(() => open(seal("tok", KEY, a), KEY, b)).toThrow("decrypt_failed");
	});

	it("rejects a key that is not 32 bytes, without echoing it", () => {
		const short = Buffer.alloc(16, 7).toString("base64");
		for (const run of [() => seal("tok", short, W), () => open(seal("tok", KEY, W), short, W)]) {
			let message = "";
			try {
				run();
			} catch (e) {
				message = (e as Error).message;
			}
			expect(message).toBe("bad_key");
			expect(message).not.toContain(short);
		}
	});

	it("never puts the text in an error", () => {
		const s = seal("secret-text", KEY, W);
		let message = "";
		try {
			open(s, KEY, { ...W, userId: "u2" });
		} catch (e) {
			message = (e as Error).message;
		}
		expect(message).toBe("decrypt_failed");
	});
});
