import type { Metadata, Viewport } from "next";
import { THEME_COLOR } from "@/lib/shell/pwa";
import "./globals.css";

export const metadata: Metadata = {
	title: "Osmo",
	// No name in link previews, and no place in search results: Osmo is one person's.
	description: "A personal companion.",
	robots: { index: false, follow: false },
	// The installed iPhone app (spec 7.1): full screen, named Osmo, no browser bar.
	appleWebApp: { capable: true, title: "Osmo", statusBarStyle: "black-translucent" },
};

// viewport-fit=cover is what env(safe-area-inset-bottom) needs for the shell v2 bar; it stays off unless the switch is on,
// so today's shell is unchanged on a notched phone.
export const viewport: Viewport = {
	themeColor: THEME_COLOR,
	...(process.env.NEXT_PUBLIC_OSMO_SHELL2 === "on" ? { viewportFit: "cover" as const } : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
