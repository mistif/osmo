// Gur's voiceprints in Supabase (own rows only). Only numbers are stored, never audio.

import { supabase } from "@/lib/supabase";
import { deviceLabel } from "../device";
import { MODEL_ID, type Voiceprint } from "../voiceprint";

// null when Supabase can't be reached.
export async function loadVoiceprints(): Promise<Voiceprint[] | null> {
	const { data, error } = await supabase.from("voiceprints").select("model,embedding");
	return error ? null : ((data ?? []) as Voiceprint[]);
}

export async function saveVoiceprint(embedding: number[]): Promise<boolean> {
	const { error } = await supabase.from("voiceprints").insert({ model: MODEL_ID, embedding, device: deviceLabel(navigator.userAgent) });
	return !error;
}

// Deletes every voiceprint, whichever device taught it.
export async function forgetVoiceprints(): Promise<boolean> {
	const { error } = await supabase.from("voiceprints").delete().not("id", "is", null);
	return !error;
}
