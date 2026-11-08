import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The client is created the first time something uses it, not when this file is imported. That way
// `next build` still works with no Supabase settings at all (CI, a branch preview): the pages that
// import this file are only built, never run, and nothing touches the client until a person does.
let client: SupabaseClient | null = null;

function browserClient(): SupabaseClient {
	if (client) return client;
	// Each setting is read by its full name so Next can put its value into the browser bundle.
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!url || !key) {
		throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).");
	}
	client = createClient(url, key);
	return client;
}

// The same `supabase` every caller already uses. It stands in for the real client and forwards each
// property to it, creating it on first use.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
	get(_target, prop) {
		const real = browserClient();
		const value = Reflect.get(real, prop, real);
		return typeof value === "function" ? value.bind(real) : value;
	},
});

// The signed-in user's session, or null when nobody is signed in. Rows are private per user via RLS.
export async function ensureSession() {
	const { data } = await supabase.auth.getSession();
	return data.session;
}
