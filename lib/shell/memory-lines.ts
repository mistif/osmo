// What Osmo remembers, written as he would say it. The value is kept apart from the lead so it can be edited in place.
import type { MemoryFact } from "../facts";

export type MemoryGroup = "about" | "words" | "explained";
export type MemoryLine = { key: string; group: MemoryGroup; sentence: string; lead: string; value: string };

export const GROUP_TITLES: Record<MemoryGroup, string> = {
	about: "About you",
	words: "Words you taught me",
	explained: "Things you explained",
};

function leadFor(fact: MemoryFact): { group: MemoryGroup; lead: string } {
	if (fact.key.startsWith("slang:")) return { group: "words", lead: `You taught me that "${fact.key.slice(6)}" means` };
	if (fact.key.startsWith("meaning:")) return { group: "explained", lead: `You explained that "${fact.key.slice(8)}" means` };
	if (fact.key === "name") return { group: "about", lead: "You told me your name is" };
	if (fact.key === "likes") return { group: "about", lead: "You told me you like" };
	return { group: "about", lead: `You told me your ${fact.key} is` };
}

export function memoryLine(fact: MemoryFact): MemoryLine {
	const { group, lead } = leadFor(fact);
	// A value can keep its own closing mark ("Nala.", "pizza!"); drop one so the sentence ends with a single period.
	// The value itself stays as stored, since it's what the edit field shows and saves.
	const spoken = fact.value.replace(/[.!?]$/, "");
	return { key: fact.key, group, lead, value: fact.value, sentence: `${lead} ${spoken}.` };
}

export function groupMemory(facts: MemoryFact[]): Record<MemoryGroup, MemoryLine[]> {
	const groups: Record<MemoryGroup, MemoryLine[]> = { about: [], words: [], explained: [] };
	for (const fact of facts) groups[leadFor(fact).group].push(memoryLine(fact));
	// The name leads, since it is the first thing he learned about you.
	groups.about.sort((a, b) => Number(b.key === "name") - Number(a.key === "name"));
	return groups;
}

// An edit that leaves nothing behind is a cancel, not an empty memory.
export function cleanEditedValue(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}
