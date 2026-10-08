"use client";

import { useRef } from "react";
import panel from "./panels.module.css";
import s from "./shell.module.css";

// The one-step inline Forget used by Library and Feed: "Forget" asks, then "Forget this?" with Forget or Keep.
// The caller owns `confirming` so only one row asks at a time; Keep returns focus to the first button.
export function ForgetButtons({ label, confirming, onAsk, onKeep, onForget }: { label: string; confirming: boolean; onAsk(): void; onKeep(): void; onForget(): void }) {
	const ask = useRef<HTMLButtonElement>(null);
	if (confirming) {
		return (
			<>
				<span className={s.meta}>Forget this?</span>
				<button type="button" className={panel.action} autoFocus onClick={onForget}>
					Forget
				</button>
				<button
					type="button"
					className={panel.action}
					onClick={() => {
						onKeep();
						requestAnimationFrame(() => ask.current?.focus());
					}}
				>
					Keep
				</button>
			</>
		);
	}
	return (
		<button type="button" className={panel.action} ref={ask} aria-label={`Forget: ${label}`} onClick={onAsk}>
			Forget
		</button>
	);
}
