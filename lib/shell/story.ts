// Insights wording: the bond's milestones as a short story.
import type { Bond, MilestoneId } from "../agent/bond/bond";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string, now: number): string {
	const d = new Date(iso);
	const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
	return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

const STORY: Record<MilestoneId, string> = {
	met: "We met",
	name: "You told me your name",
	firstFeeling: "You first told me how you felt",
	firstEvent: "You first trusted me with something that happened",
	days7: "We had spoken on seven different days",
	days30: "We had spoken on thirty different days",
	acquaintance: "I began to know you",
	friend: "I came to think of you as a friend",
	oldFriend: "We became old friends",
};

export function storyLines(bond: Bond, now: number): { id: MilestoneId; date: string; text: string }[] {
	return [...bond.milestones]
		.sort((a, b) => a.at.localeCompare(b.at))
		.map((m) => ({ id: m.id, date: shortDate(m.at, now), text: STORY[m.id] }));
}
