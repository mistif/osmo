"use client";

import type { CSSProperties, ReactNode } from "react";
import type { RailId, RailItem } from "@/lib/shell/rail";
import s from "./rail.module.css";

const vars = (v: Record<string, number>) => v as CSSProperties;

// Talk is his heart; the others are inline SVG that settle into their resting shape and play once.
function icon(id: RailId, fill = 70): ReactNode {
	if (id === "talk") return <span className={s.heart} />;
	const svg = (children: ReactNode) => (
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
			{children}
		</svg>
	);
	switch (id) {
		case "ideas":
			return svg(
				<>
					<circle className={s.core} cx="12" cy="12" r="2.2" />
					{["M12 7V3.5", "M17 12h3.5", "M12 17v3.5", "M7 12H3.5"].map((d, i) => (
						<path key={d} className={s.ray} pathLength={1} d={d} style={vars({ "--i": i })} />
					))}
				</>,
			);
		case "goals":
			return svg(
				<>
					<circle cx="12" cy="12" r="9" opacity=".25" />
					<circle className={s.arc} cx="12" cy="12" r="9" pathLength={100} style={vars({ "--fill": fill })} />
				</>,
			);
		case "library":
			return svg(
				<>
					<g className={s.shelf} style={vars({ "--dir": 1 })}>
						<path d="M4 7h16" />
						<rect x="6.5" y="3.2" width="2.2" height="3.8" />
						<rect x="10" y="4.4" width="2" height="2.6" />
					</g>
					<g className={s.shelf} style={vars({ "--dir": -1 })}>
						<path d="M4 13h16" />
						<rect x="12.5" y="9.2" width="2.2" height="3.8" />
						<rect x="16" y="10.4" width="2" height="2.6" />
					</g>
					<g className={s.shelf} style={vars({ "--dir": 1 })}>
						<path d="M4 19h16" />
						<rect x="6.5" y="15.2" width="2.2" height="3.8" />
						<rect x="10" y="16.4" width="2" height="2.6" />
					</g>
				</>,
			);
		case "feed":
			return svg(
				<>
					<polyline className={s.trace} pathLength={1} points="3 17 8 12 12.5 14.5 18.5 8" />
					<circle className={s.land} cx="20.5" cy="6.2" r="1.7" fill="currentColor" stroke="none" />
				</>,
			);
		case "search":
			return svg(
				<>
					<g className={s.lens}>
						<circle cx="10.5" cy="10.5" r="6.5" />
					</g>
					<path d="M15.5 15.5l5 5" />
				</>,
			);
		case "settings":
			return svg(
				<>
					<path d="M12 1.5v1.8M12 20.7v1.8M1.5 12h1.8M20.7 12h1.8" />
					<g className={s.dial}>
						<circle cx="12" cy="12" r="6.5" />
						<path d="M12 12V7.5" />
					</g>
				</>,
			);
	}
}

export type RailProps = {
	items: RailItem[];
	// Goals ring fill, 0 to 100 (70 is a plain decorative ring).
	fill?: number;
	onNavigate: (id: RailId) => void;
	linkRef: (id: RailId) => (el: HTMLAnchorElement | null) => void;
	// Plays every item's motion once (the dev page).
	play?: boolean;
};

export function Rail({ items, fill, onNavigate, linkRef, play }: RailProps) {
	return (
		<nav className={s.rail} aria-label="Osmo">
			<ul className={s.list}>
				{items.map((item) => (
					<li key={item.id} className={item.id === "settings" ? s.pinned : undefined}>
						<a
							href={item.href}
							ref={linkRef(item.id)}
							className={s.link}
							data-id={item.id}
							data-dot={item.dot ? "" : undefined}
							data-play={play ? "" : undefined}
							aria-current={item.active ? "page" : undefined}
							onClick={(e) => {
								if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
								e.preventDefault();
								onNavigate(item.id);
							}}
						>
							<span className={s.icon}>{icon(item.id, fill)}</span>
							<span className={s.label}>
								{item.label}
								{item.sr && <span className={s.sr}>{item.sr}</span>}
							</span>
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
