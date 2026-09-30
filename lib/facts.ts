export type MemoryFact = {
	key: string;
	value: string;
};

export function cleanMemoryKey(value: string) {
	return value.trim().toLowerCase().replace(/[?.!,]+$/, "");
}

const FEELINGS = new Set([
	"sad", "happy", "tired", "fine", "good", "great", "ok", "okay", "bored", "angry",
	"hungry", "sick", "lonely", "excited", "glad", "upset", "down", "scared", "sorry",
]);

// A saved name drops the sentence's closing marks ("my name is Gur." saves "Gur"), so Osmo says it back
// as a name and reads it again when he does. Nothing but marks is no name at all.
function savedName(raw: string): MemoryFact | null {
	const value = raw.replace(/[\s.!?,]+$/, "").trim();
	return value ? { key: "name", value } : null;
}

// Bare "I'm ..." / "it's ..." are NOT names ("im sad"); feelings are handled by the heart.
// A leading "no"/"actually" lets the user correct a fact.
export function learnFact(text: string): MemoryFact | null {
	const nameMatch = text.match(/^(?:(?:no|nope|actually|wait)[,\s]+)?(?:call me|you can call me)\s+(.+)$/i);
	if (nameMatch) return savedName(nameMatch[1]);

	// "I'm Gur" / "I am Alex": one capitalized word that is not a feeling.
	// Only the name needs a capital, so a casually typed "im Gur" counts too.
	const bareName = text.trim().match(/^(?:[Ii]['’]?m|[Ii] am)\s+([A-Z][a-z]+)\s*[.!]?$/);
	if (bareName && !FEELINGS.has(bareName[1].toLowerCase())) {
		return { key: "name", value: bareName[1] };
	}

	const factMatch = text.match(
		/^(?:(?:no|nope|actually|wait)[,\s]+)?(?:remember(?: that)?\s+)?my\s+(.+?)\s+is\s+(.+)$/i,
	);
	if (factMatch) {
		const key = cleanMemoryKey(factMatch[1]);
		return key === "name" ? savedName(factMatch[2]) : { key, value: factMatch[2].trim() };
	}

	const preferenceMatch = text.match(
		/^(?:remember(?: that)?\s+)?i\s+(?:like|love|prefer)\s+(.+)$/i,
	);
	if (preferenceMatch) {
		return { key: "likes", value: preferenceMatch[1].trim() };
	}

	return null;
}

// Words that would make "X means Y" an ordinary sentence ("that means a lot").
const NOT_A_WORD = new Set(["it", "that", "this", "which", "what", "he", "she", "they", "there", "everything", "nothing", "something", "who"]);

// "bet means okay", "when i say fam i mean friend", "fam is slang for friend".
export function learnSlang(text: string): { word: string; meaning: string } | null {
	const t = text.trim();
	const match =
		t.match(/^(?:when i say|if i say)\s+["']?([\w']+)["']?[,\s]+(?:i )?mean\s+["']?(.+?)["']?\s*[.!]?$/i) ??
		t.match(/^["']?([\w']+)["']?\s+(?:means|is slang for|stands for)\s+["']?(.+?)["']?\s*[.!]?$/i);
	if (!match) return null;
	const word = match[1].toLowerCase();
	const meaning = match[2].trim();
	if (NOT_A_WORD.has(word) || meaning === "" || meaning.split(/\s+/).length > 5) return null;
	return { word, meaning };
}
