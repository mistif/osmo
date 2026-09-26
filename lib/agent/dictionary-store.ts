import { supabase } from "../supabase";
import type { CachedLookup } from "./dictionary";

// Osmo's cache of words he has looked up, one row per user and asked term (RLS keeps rows private).

export async function getCachedLookup(term: string): Promise<CachedLookup | null> {
	const { data, error } = await supabase
		.from("word_lookups")
		.select("term,word,definition,part_of_speech,slang,source")
		.eq("term", term)
		.maybeSingle();
	if (error || !data) return null;
	return {
		term: data.term,
		word: data.word,
		definition: data.definition,
		partOfSpeech: data.part_of_speech,
		slang: data.slang,
		source: data.source,
	};
}

export async function putCachedLookup(entry: CachedLookup): Promise<void> {
	const { error } = await supabase.from("word_lookups").upsert(
		{
			term: entry.term,
			word: entry.word,
			definition: entry.definition,
			part_of_speech: entry.partOfSpeech,
			slang: entry.slang,
			source: entry.source,
		},
		{ onConflict: "user_id,term" },
	);
	if (error) console.error("Could not cache a looked-up word", error);
}
