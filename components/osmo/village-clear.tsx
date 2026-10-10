"use client";

import { useState } from "react";
import { clearVillage } from "@/lib/world/village-data";
import panel from "./panels.module.css";

// "Clear the village" (spec 4, Reset), on Settings' About page, which is the observatory's: one line, a confirm, then
// the owner's village rows are deleted and the world, told by VILLAGE_CLEARED, starts the hall again.
export function VillageClear() {
	const [state, setState] = useState<"idle" | "asking" | "clearing" | "done" | "failed">("idle");
	const clear = async () => {
		setState("clearing");
		setState((await clearVillage()) ? "done" : "failed");
	};
	return (
		<section className={panel.section}>
			<h3 className={panel.sectionTitle}>The village</h3>
			{(state === "asking" || state === "clearing") && <p className={panel.note}>Clear everything I have built on the island? It cannot be undone, and I start the hall again.</p>}
			<div className={panel.actions}>
				{state === "asking" || state === "clearing" ? (
					<>
						<button type="button" className={panel.action} autoFocus disabled={state === "clearing"} onClick={() => void clear()}>
							Clear the village
						</button>
						<button type="button" className={panel.action} disabled={state === "clearing"} onClick={() => setState("idle")}>
							Keep it
						</button>
					</>
				) : (
					<button type="button" className={panel.action} onClick={() => setState("asking")}>
						Clear the village
					</button>
				)}
			</div>
			{state === "done" && (
				<p className={panel.note} role="status">
					The village is cleared. I have started the hall again.
				</p>
			)}
			{state === "failed" && (
				<p className={panel.error} role="alert">
					I could not clear the village just now. Please try again in a moment.
				</p>
			)}
		</section>
	);
}
