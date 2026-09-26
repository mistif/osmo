import { ensureSession, supabase } from "../supabase";
import { mergeBond, sanitizeBond, type Bond } from "./bond/bond";
import { stateFromRows, type Loaded } from "./load";
import type { Effect } from "./mind";
import { defaultState, type AgentState } from "./state";

export async function loadState(): Promise<Loaded> {
	const failed: Loaded = { state: defaultState(), ok: false, lastAt: null };
	try {
		const session = await ensureSession();
		if (!session) return failed;
		const [row, assoc, history] = await Promise.all([
			supabase.from("agent_state").select("activations,coupling,weights,outlook,updated_at,genome,bond").maybeSingle(),
			supabase.from("emotion_associations").select("kind,tendencies,count"),
			supabase
				.from("event_log")
				.select("event_id,valence")
				.order("created_at", { ascending: false })
				.order("id", { ascending: false })
				.limit(200),
		]);
		return stateFromRows(row, assoc, history);
	} catch (error) {
		console.error("Could not load agent state", error);
		return failed;
	}
}

// Another tab may have saved a bigger bond since this one loaded, so merge instead of overwriting.
// If the saved bond cannot be read, this tab's bond is saved as it is.
async function bondToSave(bond: Bond): Promise<Bond> {
	try {
		const { data, error } = await supabase.from("agent_state").select("bond").maybeSingle();
		return error || !data ? bond : mergeBond(sanitizeBond(data.bond), bond);
	} catch {
		return bond;
	}
}

export async function persistTurn(state: AgentState, effects: Effect[]): Promise<void> {
	try {
		const session = await ensureSession();
		if (!session) return;
		const userId = session.user.id;
		const failures: unknown[] = [];
		const check = (result: { error: unknown }) => {
			if (result.error) failures.push(result.error);
		};

		const bond = await bondToSave(state.bond);
		check(
			await supabase.from("agent_state").upsert(
				{
					user_id: userId,
					activations: state.activations,
					coupling: state.coupling,
					weights: state.weights,
					outlook: state.outlook,
					genome: state.genome,
					bond,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: "user_id" },
			),
		);

		for (const effect of effects) {
			if (effect.type === "event") {
				const { event } = effect;
				check(
					await supabase.from("event_log").insert({
						user_id: userId,
						event_id: event.id,
						kind: event.kind,
						valence: event.valence,
						shifts: event.shifts,
					}),
				);
				const assoc = state.associations[event.kind];
				if (assoc) {
					check(
						await supabase.from("emotion_associations").upsert(
							{ user_id: userId, kind: event.kind, tendencies: assoc.tendencies, count: assoc.count },
							{ onConflict: "user_id,kind" },
						),
					);
				}
			} else if (effect.type === "dilemma") {
				check(
					await supabase.from("dilemma_log").insert({
						id: effect.logId,
						user_id: userId,
						dilemma_id: effect.dilemmaId,
						option_chosen: effect.option,
					}),
				);
			} else if (effect.type === "verdict") {
				check(await supabase.from("dilemma_log").update({ agreed: effect.agreed }).eq("id", effect.logId));
			}
		}
		if (failures.length > 0) console.error("Some agent state could not be saved", failures);
	} catch (error) {
		console.error("Could not save agent state", error);
	}
}
