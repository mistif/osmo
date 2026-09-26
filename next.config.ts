import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// The room lives at "/" and the lock at "/lock"; old addresses still work.
	async redirects() {
		return [
			{ source: "/assistant", destination: "/", permanent: false },
			{ source: "/login", destination: "/lock", permanent: false },
		];
	},
};

export default nextConfig;
