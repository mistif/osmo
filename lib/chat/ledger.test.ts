import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MAX_OUTPUT_TOKENS, modelEntry } from "./allowance";
import {
	dayUse,
	ledgerKey,
	reservationRow,
	settlingRow,
	signRow,
	supabaseLedger,
	ZERO,
	type Counts,
	type LedgerRow,
	type NewRow,
} from "./ledger";

const KEY = ledgerKey("sk-test-chat-key");
const USER = "5b0c1f2e-8d3a-4c7b-9e21-6f4a2d9c0b17";
const DAY = "2026-09-30";
const MODEL = DEFAULT_MODEL;

// Rows as the database holds them: a reservation per call, and a settling row once it's known.
function reserved(id: number, estimate: number, over: Partial<NewRow> = {}): LedgerRow {
	return { id, ...reservationRow({ day: DAY, pool: "mini", model: MODEL, estimate, maxOutput: MAX_OUTPUT_TOKENS }), ...over };
}
function settled(id: number, of: LedgerRow, counts: Counts, model = of.model): LedgerRow {
	const reservation = { id: of.id, day: of.day, pool: of.pool, model: of.model, estimate: of.input_tokens + of.output_tokens };
	return { id, ...settlingRow(KEY, USER, reservation, counts, model) };
}

describe("ledgerKey and signRow", () => {
	const row: NewRow = {
		day: DAY,
		pool: "mini",
		model: MODEL,
		input_tokens: 1200,
		cached_tokens: 1024,
		output_tokens: 40,
		reasoning_tokens: 0,
		settles: 7,
		signature: null,
	};

	it("derives the signing key from the chat key, so only the server can sign", () => {
		const expected = createHmac("sha256", "sk-test-chat-key").update("osmo ai_calls v1").digest();
		expect(ledgerKey("sk-test-chat-key").equals(expected)).toBe(true);
		expect(ledgerKey("sk-test-chat-key")).toHaveLength(32);
		expect(ledgerKey("sk-other-key").equals(KEY)).toBe(false);
	});

	it("signs the user, day, pool, model, the four counts and the reservation, as hex", () => {
		const expected = createHmac("sha256", KEY).update(JSON.stringify([USER, DAY, "mini", MODEL, 1200, 1024, 40, 0, 7])).digest("hex");
		expect(signRow(KEY, USER, row)).toBe(expected);
		expect(signRow(KEY, USER, row)).toMatch(/^[0-9a-f]{64}$/);
	});

	it("changes the signature when any signed field changes, but not for the signature itself", () => {
		const base = signRow(KEY, USER, row);
		const changed: NewRow[] = [
			{ ...row, day: "2026-09-29" },
			{ ...row, pool: "large" },
			{ ...row, model: "gpt-4.1-mini-2025-04-14" },
			{ ...row, input_tokens: 1201 },
			{ ...row, cached_tokens: 0 },
			{ ...row, output_tokens: 0 },
			{ ...row, reasoning_tokens: 1 },
			{ ...row, settles: 8 },
		];
		for (const other of changed) {
			expect(signRow(KEY, USER, other), JSON.stringify(other)).not.toBe(base);
		}
		expect(signRow(KEY, "someone-else", row)).not.toBe(base);
		expect(signRow(ledgerKey("sk-other-key"), USER, row)).not.toBe(base);
		expect(signRow(KEY, USER, { ...row, signature: "anything" })).toBe(base);
	});
});

describe("reservationRow and settlingRow", () => {
	it("books the estimate in the model's pool: the output cap as output, the rest as input", () => {
		const entry = modelEntry(DEFAULT_MODEL);
		if (!entry) throw new Error("the default model is not on the allowlist");
		expect(reservationRow({ day: DAY, pool: entry.pool, model: entry.model, estimate: 4376, maxOutput: MAX_OUTPUT_TOKENS })).toEqual({
			day: DAY,
			pool: "mini",
			model: "gpt-5.4-mini-2026-03-17",
			input_tokens: 4016,
			cached_tokens: 0,
			output_tokens: 360,
			reasoning_tokens: 0,
			settles: null,
			signature: null,
		});
	});

	it("settles on the reservation's day and pool, names the served model, and signs the row", () => {
		const reservation = { id: 41, day: "2026-09-29", pool: "mini" as const, model: MODEL, estimate: 4316 };
		const row = settlingRow(KEY, USER, reservation, { input: 1200, cached: 1024, output: 38, reasoning: 0 }, "gpt-5.4-mini-2026-05-01");
		expect(row).toEqual({
			day: "2026-09-29",
			pool: "mini",
			model: "gpt-5.4-mini-2026-05-01",
			input_tokens: 1200,
			cached_tokens: 1024,
			output_tokens: 38,
			reasoning_tokens: 0,
			settles: 41,
			signature: signRow(KEY, USER, { ...row, signature: null }),
		});
		expect(row.signature).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("dayUse", () => {
	it("counts nothing on a day with no rows", () => {
		expect(dayUse([], "mini", USER, KEY)).toEqual({ used: 0, stopped: false });
	});

	it("counts an open reservation at its estimate, as after a timeout, a 5xx or a reply without usage", () => {
		expect(dayUse([reserved(1, 4316), reserved(2, 2000)], "mini", USER, KEY)).toEqual({ used: 6316, stopped: false });
	});

	it("counts a settled call at what OpenAI reported instead of its estimate: input plus output", () => {
		const call = reserved(1, 4316);
		// Cached tokens are part of the input and reasoning tokens part of the output, so neither is added on top.
		const rows = [call, settled(2, call, { input: 1200, cached: 1024, output: 60, reasoning: 20 }), reserved(3, 2000)];
		expect(dayUse(rows, "mini", USER, KEY)).toEqual({ used: 1260 + 2000, stopped: false });
	});

	it("counts a zero settle, after a 4xx or a withdrawal, as nothing", () => {
		const call = reserved(1, 4316);
		expect(dayUse([call, settled(2, call, ZERO)], "mini", USER, KEY)).toEqual({ used: 0, stopped: false });
	});

	it("ignores a settling row with a missing or wrong signature, so the estimate still counts", () => {
		const call = reserved(1, 4316);
		const good = settled(2, call, ZERO);
		const forged: [string, LedgerRow][] = [
			["missing", { ...good, signature: null }],
			["made up", { ...good, signature: "0".repeat(64) }],
			["cut short", { ...good, signature: (good.signature ?? "").slice(0, 63) }],
			["counts changed after signing", { ...good, input_tokens: 5 }],
			["signed with another key", { ...good, signature: signRow(ledgerKey("sk-other-key"), USER, good) }],
			["signed for another user", { ...good, signature: signRow(KEY, "someone-else", good) }],
		];
		for (const [label, row] of forged) {
			expect(dayUse([call, row], "mini", USER, KEY), label).toEqual({ used: 4316, stopped: false });
		}
	});

	it("counts only the first settling row for a reservation, in whatever order the rows come", () => {
		const call = reserved(1, 4316);
		const first = settled(2, call, { input: 1200, cached: 0, output: 40, reasoning: 0 });
		const second = settled(3, call, ZERO);
		expect(dayUse([call, first, second], "mini", USER, KEY).used).toBe(1240);
		expect(dayUse([second, call, first], "mini", USER, KEY).used).toBe(1240);
	});

	it("sums only the pool asked for", () => {
		const small = reserved(1, 4316);
		const large = reserved(2, 9000, { pool: "large", model: "a-large-model-2026-01-01" });
		const rows = [small, large, settled(3, large, { input: 5000, cached: 0, output: 100, reasoning: 0 })];
		expect(dayUse(rows, "mini", USER, KEY)).toEqual({ used: 4316, stopped: false });
		expect(dayUse(rows, "large", USER, KEY)).toEqual({ used: 5100, stopped: false });
	});

	it("reports a signed settling row that names another model than its reservation, which stops the day", () => {
		const call = reserved(1, 4316);
		const served = settled(2, call, { input: 1200, cached: 0, output: 40, reasoning: 0 }, "gpt-5.4-mini-2026-05-01");
		expect(dayUse([call, served], "mini", USER, KEY)).toEqual({ used: 1240, stopped: true });
		// An unsigned row can't stop the day, and another pool's day isn't stopped.
		expect(dayUse([call, { ...served, signature: null }], "mini", USER, KEY)).toEqual({ used: 4316, stopped: false });
		expect(dayUse([call, served], "large", USER, KEY)).toEqual({ used: 0, stopped: false });
	});

	it("counts nothing for a settling row whose reservation isn't among the rows", () => {
		const elsewhere = reserved(1, 4316, { day: "2026-09-29" });
		const rows = [settled(2, elsewhere, { input: 99, cached: 0, output: 1, reasoning: 0 }, "another-model"), reserved(3, 2000)];
		expect(dayUse(rows, "mini", USER, KEY)).toEqual({ used: 2000, stopped: false });
	});
});

// A fake of the few supabase-js calls the ledger makes. It records each call, and every query
// resolves to the answer given, as supabase-js resolves (it never throws without throwOnError).
function fakeClient(answer: unknown) {
	const calls: unknown[][] = [];
	const client = {
		from(table: string) {
			calls.push(["from", table]);
			return {
				select(columns: string, options?: unknown) {
					calls.push(["select", columns, options]);
					return {
						eq(column: string, value: unknown) {
							calls.push(["eq", column, value]);
							return Promise.resolve(answer);
						},
					};
				},
				insert(row: unknown) {
					calls.push(["insert", row]);
					return {
						select(columns: string) {
							calls.push(["select", columns]);
							return {
								single() {
									calls.push(["single"]);
									return Promise.resolve(answer);
								},
							};
						},
					};
				},
			};
		},
	};
	return { client: client as unknown as SupabaseClient, calls };
}

describe("supabaseLedger", () => {
	const COLUMNS = "id,day,pool,model,input_tokens,cached_tokens,output_tokens,reasoning_tokens,settles,signature";

	it("reads exactly one day's rows, asking for an exact count", async () => {
		const rows = [reserved(1, 4316), reserved(2, 2000)];
		const { client, calls } = fakeClient({ data: rows, error: null, count: 2 });
		await expect(supabaseLedger(client).readDay(DAY)).resolves.toEqual({ ok: true, value: rows });
		expect(calls).toEqual([
			["from", "ai_calls"],
			["select", COLUMNS, { count: "exact" }],
			["eq", "day", DAY],
		]);
		const empty = fakeClient({ data: [], error: null, count: 0 });
		await expect(supabaseLedger(empty.client).readDay(DAY)).resolves.toEqual({ ok: true, value: [] });
	});

	it("fails a read that errors, keeping only the code", async () => {
		const cases: [unknown, string][] = [
			[{ data: null, error: { code: "42501", message: "permission denied for table ai_calls", details: "d", hint: "h" }, count: null }, "42501"],
			[{ data: null, error: { code: "", message: "TypeError: fetch failed", details: "", hint: "" }, count: null }, ""],
			[{ data: null, error: { message: "<html>Bad gateway</html>" }, count: null }, ""],
		];
		for (const [answer, code] of cases) {
			const result = await supabaseLedger(fakeClient(answer).client).readDay(DAY);
			expect(result, JSON.stringify(answer)).toEqual({ ok: false, code });
		}
	});

	it("fails a read that returned fewer rows than exist, or whose count is unknown", async () => {
		const rows = [reserved(1, 4316), reserved(2, 2000)];
		for (const count of [3, 1000, null, Number.NaN]) {
			const result = await supabaseLedger(fakeClient({ data: rows, error: null, count }).client).readDay(DAY);
			expect(result, String(count)).toEqual({ ok: false, code: "count" });
		}
	});

	it("inserts the row as given and gives back its id", async () => {
		const row = reservationRow({ day: DAY, pool: "mini", model: MODEL, estimate: 4316, maxOutput: MAX_OUTPUT_TOKENS });
		const { client, calls } = fakeClient({ data: { id: 42 }, error: null });
		await expect(supabaseLedger(client).insert(row)).resolves.toEqual({ ok: true, value: 42 });
		expect(calls).toEqual([["from", "ai_calls"], ["insert", row], ["select", "id"], ["single"]]);
	});

	it("fails an insert that errors or gives back no id, keeping only the code", async () => {
		const row = settlingRow(KEY, USER, { id: 1, day: DAY, pool: "mini", model: MODEL, estimate: 4316 }, ZERO, MODEL);
		const cases: [unknown, string][] = [
			// A second settling row for one reservation: the unique (user_id, settles) refuses it.
			[{ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint", details: "Key (user_id, settles)=(x, 1) already exists.", hint: null } }, "23505"],
			[{ data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "ai_calls"' } }, "42501"],
			[{ data: null, error: null }, ""],
			[{ data: { id: "42" }, error: null }, ""],
		];
		for (const [answer, code] of cases) {
			const result = await supabaseLedger(fakeClient(answer).client).insert(row);
			expect(result, JSON.stringify(answer)).toEqual({ ok: false, code });
		}
	});
});
