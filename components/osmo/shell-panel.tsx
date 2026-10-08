"use client";

import { type ReactNode, useEffect, useRef } from "react";
import s from "./shell.module.css";

// The panel for shell v2: the same shape as Panel in panel.tsx, plus an optional Back.
export function ShellPanel({ title, onBack, onClose, children }: { title: string; onBack?: () => void; onClose: () => void; children: ReactNode }) {
	const titleRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		titleRef.current?.focus();
	}, [title]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			// A field that already used Escape (to cancel a rename, say) marks the event defaultPrevented.
			if (event.key === "Escape" && !event.defaultPrevented) onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<aside id="osmo-panel" className={s.panel} aria-labelledby="osmo-panel-title">
			<div className={s.top}>
				<div className={s.heading}>
					{onBack && (
						<button type="button" className={s.back} onClick={onBack}>
							Back
						</button>
					)}
					<h2 id="osmo-panel-title" ref={titleRef} tabIndex={-1} className={s.title}>
						{title}
					</h2>
				</div>
				<button type="button" className={s.close} onClick={onClose}>
					Close
				</button>
			</div>
			{children}
		</aside>
	);
}
