import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// The build's identity, shown in Settings (lib/shell/version.ts): the package version, the commit
// (Vercel's on a deploy, git's locally) and the moment of the build. None of these is a secret.
const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;
const build = (() => {
	const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
	if (fromVercel) return fromVercel.slice(0, 7);
	try {
		return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local";
	} catch {
		return "local";
	}
})();

const nextConfig: NextConfig = {
	env: {
		NEXT_PUBLIC_OSMO_VERSION: version,
		NEXT_PUBLIC_OSMO_BUILD: build,
		NEXT_PUBLIC_OSMO_BUILT_AT: new Date().toISOString(),
	},
	// The room lives at "/" and the lock at "/lock"; old addresses still work.
	async redirects() {
		return [
			{ source: "/assistant", destination: "/", permanent: false },
			{ source: "/login", destination: "/lock", permanent: false },
		];
	},
	// No other site may show Osmo inside a frame, so nobody can trick a click on him.
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
				],
			},
			// The artifact runtime is named by its hash, so it can be cached for good.
			{
				source: "/artifact/:path*",
				headers: [
					{ key: "Cache-Control", value: "public, max-age=31536000, immutable" },
					{ key: "X-Content-Type-Options", value: "nosniff" },
				],
			},
			// The service worker must never be cached, or an old one could outlive a fix.
			{
				source: "/sw.js",
				headers: [
					{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
					{ key: "Content-Type", value: "application/javascript; charset=utf-8" },
				],
			},
		];
	},
};

export default nextConfig;
