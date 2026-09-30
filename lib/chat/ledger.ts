// The token ledger in `ai_calls`. Each model call books a reservation for its estimate before it's
// made, then a settling row with what OpenAI reported. Only rows the route signed can lower a
// count, so anything else holding Gur's token can only raise it.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "./allowance";

export type LedgerRow = {
	id: number;
	day: string;
	pool: Pool;
	model: string;
	input_tokens: number;
	cached_tokens: number;
	output_tokens: number;
	reasoning_tokens: number;
	settles: number | null;
	signature: string | null;
};
export type NewRow = Omit<LedgerRow, "id">;
export type StoreResult<T> = { ok: true; value: T } | { ok: false; code: string };
export type LedgerStore = {
	// Fails when the query errors, or when the exact count is more than the rows returned.
	readDay(day: string): Promise<StoreResult<LedgerRow[]>>;
	// The new row's id.
	insert(row: NewRow): Promise<StoreResult<number>>;
};
export type Counts = { input: number; cached: number; output: number; reasoning: number };
export type Reservation = { id: number; day: string; pool: Pool; model: string; estimate: number };
export type DayUse = { used: number; stopped: boolean };

export const ZERO: Counts = { input: 0, cached: 0, output: 0, reasoning: 0 };

const COLUMNS = "id,day,pool,model,input_tokens,cached_tokens,output_tokens,reasoning_tokens,settles,signature";

// The ledger through Gur's own token, so row-level security applies. Only a Postgres or PostgREST
// code comes back from a failure: an error's message, details and hint can quote the row.
export function supabaseLedger(client: SupabaseClient): LedgerStore {
	return {
		async readDay(day) {
			const { data, error, count } = await client.from("ai_calls").select(COLUMNS, { count: "exact" }).eq("day", day);
			if (error) return { ok: false, code: error.code ?? "" };
			const rows = (data ?? []) as LedgerRow[];
			// Fewer rows than exist, or a count that can't be read, would undercount the day.
			if (count === null || !Number.isInteger(count) || count > rows.length) return { ok: false, code: "count" };
			return { ok: true, value: rows };
		},
		async insert(row) {
			const { data, error } = await client.from("ai_calls").insert(row).select("id").single();
			if (error) return { ok: false, code: error.code ?? "" };
			const id = (data as { id?: unknown } | null)?.id;
			return typeof id === "number" ? { ok: true, value: id } : { ok: false, code: "" };
		},
	};
}

// The signing key lives only on the server, because it comes from the chat key.
export function ledgerKey(apiKey: string): Buffer {
	return createHmac("sha256", apiKey).update("osmo ai_calls v1").digest();
}

// Covers every field that decides a count, and whose reservation it settles.
export function signRow(key: Buffer, userId: string, row: NewRow): string {
	const fields = [userId, row.day, row.pool, row.model, row.input_tokens, row.cached_tokens, row.output_tokens, row.reasoning_tokens, row.settles];
	return createHmac("sha256", key).update(JSON.stringify(fields)).digest("hex");
}

// A reservation holds the estimate: the output cap as output, the rest as input.
export function reservationRow(r: { day: string; pool: Pool; model: string; estimate: number; maxOutput: number }): NewRow {
	return {
		day: r.day,
		pool: r.pool,
		model: r.model,
		input_tokens: r.estimate - r.maxOutput,
		cached_tokens: 0,
		output_tokens: r.maxOutput,
		reasoning_tokens: 0,
		settles: null,
		signature: null,
	};
}

// A settling row sits on its reservation's day and pool, even after midnight, and names the model that answered.
export function settlingRow(key: Buffer, userId: string, reservation: Reservation, counts: Counts, model: string): NewRow {
	const row: NewRow = {
		day: reservation.day,
		pool: reservation.pool,
		model,
		input_tokens: counts.input,
		cached_tokens: counts.cached,
		output_tokens: counts.output,
		reasoning_tokens: counts.reasoning,
		settles: reservation.id,
		signature: null,
	};
	return { ...row, signature: signRow(key, userId, row) };
}

function verified(key: Buffer, userId: string, row: LedgerRow): boolean {
	if (row.signature === null) return false;
	const expected = Buffer.from(signRow(key, userId, row));
	const given = Buffer.from(row.signature);
	return expected.length === given.length && timingSafeEqual(expected, given);
}

// Today's use of one pool: each reservation counts its first validly signed settling row, or its
// own estimate when it has none. A signed row naming another model than its reservation stops the day.
export function dayUse(rows: readonly LedgerRow[], pool: Pool, userId: string, key: Buffer): DayUse {
	const mine = rows.filter((row) => row.pool === pool).sort((a, b) => a.id - b.id);
	const settles = new Map<number, LedgerRow>();
	for (const row of mine) {
		if (row.settles === null || settles.has(row.settles) || !verified(key, userId, row)) continue;
		settles.set(row.settles, row);
	}
	let used = 0;
	let stopped = false;
	for (const row of mine) {
		if (row.settles !== null) continue;
		const settle = settles.get(row.id);
		const counted = settle ?? row;
		used += counted.input_tokens + counted.output_tokens;
		if (settle && settle.model !== row.model) stopped = true;
	}
	return { used, stopped };
}
