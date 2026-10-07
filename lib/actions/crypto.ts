// AES-256-GCM sealing for connector tokens (spec 6.1). The row's identity is the authenticated extra data,
// so a ciphertext copied to another user, provider or column does not open. Errors never hold a key or a text.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type Where = { userId: string; provider: string; column: string };

const keyOf = (b64: string) => {
	const k = Buffer.from(b64, "base64");
	if (k.length !== 32) throw new Error("bad_key");
	return k;
};
const aad = (w: Where) => Buffer.from(`${w.userId}|${w.provider}|${w.column}`);

export function seal(plain: string, keyB64: string, where: Where): string {
	const iv = randomBytes(12),
		c = createCipheriv("aes-256-gcm", keyOf(keyB64), iv);
	c.setAAD(aad(where));
	const body = Buffer.concat([c.update(plain, "utf8"), c.final(), c.getAuthTag()]);
	return `v1.${iv.toString("base64url")}.${body.toString("base64url")}`;
}

export function open(sealed: string, keyB64: string, where: Where): string {
	const [v, iv, body] = sealed.split(".");
	try {
		if (v !== "v1" || !iv || !body) throw new Error();
		const raw = Buffer.from(body, "base64url"),
			d = createDecipheriv("aes-256-gcm", keyOf(keyB64), Buffer.from(iv, "base64url"));
		d.setAAD(aad(where));
		d.setAuthTag(raw.subarray(raw.length - 16));
		return Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8");
	} catch (e) {
		throw new Error((e as Error).message === "bad_key" ? "bad_key" : "decrypt_failed");
	}
}
