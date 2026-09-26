import { ensureSession, supabase } from "../supabase";

// The user's own words (names, in-jokes, jargon) and how often they've used them, private per user.

export async function loadVocabulary(): Promise<Record<string, number>> {
	try {
		if (!(await ensureSession())) return {};
		const { data, error } = await supabase.from("user_words").select("word,uses").order("uses", { ascending: false }).limit(1000);
		if (error || !data) return {};
		return Object.fromEntries(data.map((row) => [row.word as string, row.uses as number]));
	} catch {
		return {};
	}
}

export async function saveVocabulary(changed: Record<string, number>): Promise<void> {
	const rows = Object.entries(changed).map(([word, uses]) => ({ word, uses, updated_at: new Date().toISOString() }));
	if (rows.length === 0) return;
	const { error } = await supabase.from("user_words").upsert(rows, { onConflict: "user_id,word" });
	if (error) console.error("Could not save the user's vocabulary", error);
}
