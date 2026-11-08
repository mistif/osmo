import type { MetadataRoute } from "next";

// The installed app (spec 7.1). iOS allows Web Push only for an app added to the home screen whose
// manifest says "standalone". The colours are the room's dark base; the icons are made by
// scripts/make-icons.mjs from the figure (the heart with three dashed rings).
export const THEME_COLOR = "#0d0f14";

export const MANIFEST: MetadataRoute.Manifest = {
	name: "Osmo",
	short_name: "Osmo",
	description: "A personal companion.",
	start_url: "/",
	display: "standalone",
	theme_color: THEME_COLOR,
	background_color: THEME_COLOR,
	icons: [
		{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
		{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
		{ src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
	],
};
