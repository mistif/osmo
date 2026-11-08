"use client";

import { useState } from "react";
import { BUILDS } from "@/lib/world/flags";
import { clearVillage } from "@/lib/world/village-data";
import panel from "./panels.module.css";

// "Clear the village" (spec 4, Reset), on Settings' About page, which is the observatory's: one line, a confirm, then
// the owner's village rows are deleted and the world, told by VILLAGE_CLEARED, starts the hall again. With the big
// world's builds on it reads Clear the world: every build goes, the islands stay (the clearing itself is the same).
const WHAT = BUILDS ? "world" : "village";

export function VillageClear() {
	const [state, setState] = useState<"idle" | "asking" | "clearing" | "done" | "failed">("idle");
	const clear = async () => {
		setState("clearing");
		setState((await clearVillage()) ? "done" : "failed");
	};
	return (
		<section className={panel.section}>
			<h3 className={panel.sectionTitle}>{BUILDS ? "The world" : "The village"}</h3>
			{(state === "asking" || state === "clearing") && <p className={panel.note}>{BUILDS ? "Clear everything I have built? The islands stay. It cannot be undone, and I start the hall again." : "Clear everything I have built on the island? It cannot be undone, and I start the hall again."}</p>}
			<div className={panel.actions}>
				{state === "asking" || state === "clearing" ? (
					<>
						<button type="button" className={panel.action} disabled={state === "clearing"} onClick={() => void clear()}>
							Clear the {WHAT}
						</button>
						<button type="button" className={panel.action} autoFocus disabled={state === "clearing"} onClick={() => setState("idle")}>
							Keep it
						</button>
					</>
				) : (
					<button type="button" className={panel.action} onClick={() => setState("asking")}>
						Clear the {WHAT}
					</button>
				)}
			</div>
			{state === "done" && (
				<p className={panel.note} role="status">
					The {WHAT} is cleared.
				</p>
			)}
			{state === "failed" && (
				<p className={panel.error} role="alert">
					I could not clear the {WHAT} just now. Please try again in a moment.
				</p>
			)}
		</section>
	);
}
