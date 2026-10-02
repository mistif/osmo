import { relaxMood } from "./slow-mood";
import { defaultState, sanitizeState, type AgentState } from "./state";

type Result<T> = { data: T | null; error: unknown };

export type Loaded = { state: AgentState; ok: boolean; lastAt: number | null };

// Pure so it can be tested. `ok` is false if ANY query failed: callers must not save
// (and so overwrite real data with defaults) until a load has succeeded.
export function stateFromRows(
	row: Result<Record<string, unknown>>,
	assoc: Result<{ kind: string; count: number; tendencies: unknown }[]>,
	history: Result<{ event_id: string; valence: string }[]>,
	now = Date.now(),
): Loaded {
	if (row.error || assoc.error || history.error) {
		return { state: defaultState(), ok: false, lastAt: null };
	}
	const updatedAt = typeof row.data?.updated_at === "string" ? Date.parse(row.data.updated_at) : NaN;
	const state = sanitizeState({
		...(row.data ?? {}),
		associations: Object.fromEntries(
			(assoc.data ?? []).map((r) => [r.kind, { count: r.count, tendencies: r.tendencies }]),
		),
		history: [...(history.data ?? [])].reverse().map((r) => ({ id: r.event_id, valence: r.valence })),
	});
	// The slow mood fades by the clock, so it is relaxed to now as it loads; a missing column is null (resting).
	state.mood = state.mood ? relaxMood(state.mood, now) : null;
	return {
		state,
		ok: true,
		lastAt: Number.isFinite(updatedAt) ? updatedAt : null,
	};
}
