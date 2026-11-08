import { describe, expect, it } from "vitest";
import cfg from "../../next.config";

describe("next.config headers", () => {
	it("still forbids framing Osmo, and serves the runtime with a long cache", async () => {
		const rules = await cfg.headers!();
		const all = rules.find((r) => r.source === "/:path*");
		expect(all?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
		expect(all?.headers).toContainEqual({ key: "Content-Security-Policy", value: "frame-ancestors 'none'" });
		const artifact = rules.find((r) => r.source === "/artifact/:path*");
		expect(artifact?.headers.find((h) => h.key === "Cache-Control")?.value).toContain("immutable");
		expect(artifact?.headers).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
	});
});
