import { beforeEach, describe, expect, it, vi } from "vitest";

const upserts: { table: string; row: Record<string, unknown> }[] = [];
const selects: { table: string; columns: string }[] = [];

vi.mock("../supabase", () => {
	const ok = { data: null, error: null };
	const from = (table: string) => {
		const chain: Record<string, unknown> = {
			select: (columns: string) => {
				selects.push({ table, columns });
				return chain;
			},
			eq: () => chain,
			order: () => chain,
			limit: () => chain,
			then: (resolve: (v: unknown) => unknown) => resolve(ok),
			maybeSingle: () => Promise.resolve(ok),
			upsert: (row: Record<string, unknown>) => {
				upserts.push({ table, row });
				return Promise.resolve(ok);
			},
		};
		return chain;
	};
	return { supabase: { from }, ensureSession: () => Promise.resolve({ user: { id: "u1" } }) };
});

import { loadState, persistTurn } from "./agent-state";
import { defaultState } from "./state";

beforeEach(() => {
	upserts.length = 0;
	selects.length = 0;
});

describe("persistTurn: the slow mood", () => {
	it("upserts mood with the state, and never writes the genome", async () => {
		const mood = { pad: [0.1, 0.2, 0.3] as [number, number, number], at: 5, causes: [] };
		await persistTurn({ ...defaultState(), mood }, []);
		const row = upserts.find((u) => u.table === "agent_state")?.row;
		expect(row?.mood).toEqual(mood);
		expect(row).not.toHaveProperty("genome");
		await persistTurn(defaultState(), []);
		expect(upserts.filter((u) => u.table === "agent_state")[1].row.mood).toBeNull();
	});
});

describe("loadState: the columns it reads", () => {
	it("selects mood by name and never the genome", async () => {
		await loadState();
		const columns = selects.find((s) => s.table === "agent_state" && s.columns.includes("activations"))?.columns ?? "";
		expect(columns.split(",")).toContain("mood");
		expect(columns).not.toMatch(/genome/);
	});
});
