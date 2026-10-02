import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Created on first use, not at import, so a build without the Supabase env vars (a branch preview) can still prerender.
function getClient(): SupabaseClient {
	client ??= createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
	);
	return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
	get(_target, prop) {
		const real = getClient();
		const value = Reflect.get(real, prop, real);
		return typeof value === "function" ? value.bind(real) : value;
	},
});

// The signed-in user's session, or null when nobody is signed in. Rows are private per user via RLS.
export async function ensureSession() {
	const { data } = await supabase.auth.getSession();
	return data.session;
}
