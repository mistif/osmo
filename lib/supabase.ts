import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

// Created on first use rather than at import, so a build without the Supabase env vars (a branch preview)
// can still prerender pages that import this module.
function getClient(): SupabaseClient {
	client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
	return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
	get(_, prop) {
		const target = getClient();
		const value = Reflect.get(target, prop, target);
		return typeof value === "function" ? value.bind(target) : value;
	},
});

// The signed-in user's session, or null when nobody is signed in. Rows are private per user via RLS.
export async function ensureSession() {
	const { data } = await supabase.auth.getSession();
	return data.session;
}
