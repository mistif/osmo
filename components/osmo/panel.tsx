"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import styles from "./panels.module.css";

export type PanelId = "memory" | "insights" | "settings";

export const PANEL_TITLES: Record<PanelId, string> = {
	memory: "What I remember",
	insights: "How I've been",
	settings: "Settings",
};

const LINK_LABELS: Record<PanelId, string> = { memory: "Memory", insights: "Insights", settings: "Settings" };
const ORDER: PanelId[] = ["memory", "insights", "settings"];

// One panel at a time; closing returns focus to the link that opened it.
export function usePanels() {
	const [panel, setPanel] = useState<PanelId | null>(null);
	const links = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({});

	const close = useCallback(() => {
		setPanel((current) => {
			if (current) requestAnimationFrame(() => links.current[current]?.focus());
			return null;
		});
	}, []);
	const toggle = useCallback((id: PanelId) => {
		setPanel((current) => {
			if (current === id) {
				requestAnimationFrame(() => links.current[id]?.focus());
				return null;
			}
			return id;
		});
	}, []);
	const linkRef = useCallback((id: PanelId) => (el: HTMLButtonElement | null) => {
		links.current[id] = el;
	}, []);

	return { panel, toggle, close, linkRef };
}

export function PanelLinks({ panel, toggle, linkRef }: Pick<ReturnType<typeof usePanels>, "panel" | "toggle" | "linkRef">) {
	return (
		<nav className={styles.links} aria-label="Osmo">
			{ORDER.map((id) => (
				<button
					key={id}
					ref={linkRef(id)}
					type="button"
					className={styles.link}
					aria-expanded={panel === id}
					aria-controls="osmo-panel"
					onClick={() => toggle(id)}
				>
					{LINK_LABELS[id]}
				</button>
			))}
		</nav>
	);
}

export function Panel({ id, onClose, children }: { id: PanelId; onClose: () => void; children: ReactNode }) {
	const titleRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		titleRef.current?.focus();
	}, [id]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<aside id="osmo-panel" className={styles.panel} aria-labelledby="osmo-panel-title">
			<div className={styles.top}>
				<h2 id="osmo-panel-title" ref={titleRef} tabIndex={-1} className={styles.title}>
					{PANEL_TITLES[id]}
				</h2>
				<button type="button" className={styles.close} onClick={onClose}>
					Close
				</button>
			</div>
			{children}
		</aside>
	);
}
