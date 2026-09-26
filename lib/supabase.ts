import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

// The signed-in user's session, or null when nobody is signed in. Rows are private per user via RLS.
export async function ensureSession() {
	const { data } = await supabase.auth.getSession();
	return data.session;
}
