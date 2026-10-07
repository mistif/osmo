/* eslint-disable @typescript-eslint/no-explicit-any */
// An in-memory stand-in for ownerDb, shared by every test of the actions and the connectors.
// Like the real thing it only ever sees the owner's rows, and inserts are stamped with the owner.
import type { OwnerDb } from "../server/admin";

type Row = Record<string, any>;
export type FakeDb = OwnerDb & { tables: Record<string, Row[]> };

export function fakeDb(seed: Record<string, Row[]> = {}, owner = "owner-1", clock: () => number = Date.now): FakeDb {
	const tables: Record<string, Row[]> = {};
	for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ user_id: owner, ...r }));
	const counters: Record<string, number> = {};
	const nextId = (name: string) => {
		counters[name] ??= Math.max(0, ...(tables[name] ?? []).map((r) => (typeof r.id === "number" ? r.id : 0)));
		return ++counters[name];
	};

	// "*" or nothing means every column; otherwise only the listed ones come back, as a real select does.
	const pick = (cols: string | null): string[] | null => (cols === null || cols.trim() === "*" ? null : cols.split(",").map((c) => c.trim()).filter(Boolean));
	const table = (name: string) => (tables[name] ??= []);

	function query(name: string, op: "select" | "insert" | "upsert" | "update" | "delete", payload: any, opts: any = {}) {
		const filters: ((r: Row) => boolean)[] = [];
		let wantRows = op === "select",
			columns: string[] | null = op === "select" ? pick(payload) : null,
			ordering: { col: string; asc: boolean } | null = null,
			cap: number | null = null,
			mode: "many" | "single" | "maybe" = "many",
			memo: Promise<any> | null = null;

		const execute = (): { data: any; error: any; count?: number } => {
			const rows = table(name);
			const mine = () => rows.filter((r) => r.user_id === owner && filters.every((f) => f(r)));
			let out: Row[] = [];
			let count: number | undefined;
			if (op === "select") {
				out = mine();
				if (opts.count) count = out.length;
			} else if (op === "insert" || op === "upsert") {
				const list: Row[] = Array.isArray(payload) ? payload : [payload];
				const keys: string[] = op === "upsert" ? String(opts.onConflict ?? "").split(",").filter(Boolean) : [];
				for (const item of list) {
					const stamped: Row = { ...item, user_id: owner };
					const existing = keys.length ? rows.find((r) => r.user_id === owner && keys.every((k) => r[k] === stamped[k])) : undefined;
					if (existing) {
						Object.assign(existing, stamped);
						out.push(existing);
						continue;
					}
					const iso = new Date(clock()).toISOString();
					const row: Row = { ...stamped };
					row.id ??= nextId(name);
					row.at ??= iso;
					row.created_at ??= iso;
					rows.push(row);
					out.push(row);
				}
			} else if (op === "update") {
				out = mine();
				for (const r of out) Object.assign(r, payload, { user_id: owner });
			} else {
				out = mine();
				for (const r of out) rows.splice(rows.indexOf(r), 1);
			}
			if (ordering) {
				const { col, asc } = ordering;
				out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
			}
			if (cap !== null) out = out.slice(0, cap);
			const copies = out.map((r) => (columns ? Object.fromEntries(columns.map((c) => [c, r[c]])) : { ...r }));
			if (mode === "many") return { data: wantRows && !opts.head ? copies : null, error: null, ...(count === undefined ? {} : { count }) };
			if (copies.length === 1) return { data: copies[0], error: null };
			if (mode === "maybe" && copies.length === 0) return { data: null, error: null };
			return { data: null, error: { code: "PGRST116", message: "no single row" } };
		};
		const run = () => (memo ??= Promise.resolve(execute()));

		const add = (f: (r: Row) => boolean) => {
			filters.push(f);
			return q;
		};
		const q: any = {
			eq: (c: string, v: unknown) => add((r) => r[c] === v),
			neq: (c: string, v: unknown) => add((r) => r[c] !== v),
			is: (c: string, v: unknown) => add((r) => (v === null ? r[c] == null : r[c] === v)),
			in: (c: string, v: unknown[]) => add((r) => v.includes(r[c])),
			gt: (c: string, v: any) => add((r) => r[c] > v),
			gte: (c: string, v: any) => add((r) => r[c] >= v),
			lt: (c: string, v: any) => add((r) => r[c] < v),
			lte: (c: string, v: any) => add((r) => r[c] <= v),
			order: (col: string, o?: { ascending?: boolean }) => {
				ordering = { col, asc: o?.ascending !== false };
				return q;
			},
			limit: (n: number) => {
				cap = n;
				return q;
			},
			select: (c?: string) => {
				wantRows = true;
				columns = pick(c ?? null);
				return q;
			},
			single: () => {
				mode = "single";
				wantRows = true;
				return q;
			},
			maybeSingle: () => {
				mode = "maybe";
				wantRows = true;
				return q;
			},
			then: (ok: (v: any) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad),
		};
		return q;
	}

	return {
		owner,
		tables,
		from: (name: string) =>
			({
				select: (c: string, o?: any) => query(name, "select", c, o ?? {}),
				insert: (r: Row | Row[]) => query(name, "insert", r),
				upsert: (r: Row | Row[], onConflict: string) => query(name, "upsert", r, { onConflict }),
				update: (v: Row) => query(name, "update", v),
				delete: () => query(name, "delete", null),
			}) as any,
	};
}
