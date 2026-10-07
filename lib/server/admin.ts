// The only file that may read SUPABASE_SERVICE_ROLE_KEY (a test greps for it). Every query is pinned to Gur's user id.
import { createClient } from "@supabase/supabase-js";
import { ownerId } from "../chat/allowance";

type Env = Readonly<Record<string, string | undefined>>;
type Row = Record<string, unknown>;
type SelectOptions = { head?: boolean; count?: "exact" | "planned" | "estimated" };
type Table = ReturnType<ReturnType<typeof createClient>["from"]>;

export type OwnerTable = {
	select: (columns: string, options?: SelectOptions) => ReturnType<Table["select"]>;
	insert: (rows: Row | Row[]) => ReturnType<Table["insert"]>;
	upsert: (rows: Row | Row[], onConflict: string) => ReturnType<Table["upsert"]>;
	update: (values: Row) => ReturnType<Table["update"]>;
	delete: () => ReturnType<Table["delete"]>;
};
export type OwnerDb = { owner: string; from(table: string): OwnerTable };

export function ownerDb(env: Env = process.env, make: typeof createClient = createClient): OwnerDb {
	const owner = ownerId(env),
		url = env.NEXT_PUBLIC_SUPABASE_URL,
		key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!owner || !url || !key) throw new Error("admin_unconfigured");
	const client = make(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
	const stamp = (r: Row | Row[]) => (Array.isArray(r) ? r.map((x) => ({ ...x, user_id: owner })) : { ...r, user_id: owner });
	return {
		owner,
		from: (table) => ({
			select: (c, o) => client.from(table).select(c, o).eq("user_id", owner),
			insert: (r) => client.from(table).insert(stamp(r)),
			upsert: (r, onConflict) => client.from(table).upsert(stamp(r), { onConflict }),
			update: (v) => client.from(table).update({ ...v, user_id: owner }).eq("user_id", owner),
			delete: () => client.from(table).delete().eq("user_id", owner),
		}),
	};
}
