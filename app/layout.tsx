import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Osmo",
	description: "Gur's companion.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
