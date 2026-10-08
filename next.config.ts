import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
