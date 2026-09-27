import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Osmo",
	// No name in link previews, and no place in search results: Osmo is one person's.
	description: "A personal companion.",
	robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
