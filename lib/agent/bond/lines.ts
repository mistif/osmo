// What Osmo says about the relationship. Composed and professional, and speakable aloud.
import { stageOf, type Bond, type MilestoneId, type Stage } from "./bond";

const pickAt = <T>(list: T[], turn: number): T => list[Math.abs(turn) % list.length];

// Names can be stored as typed ("gur"), so each word is capitalized before he says it.
const properName = (name: string) =>
	name
		.trim()
		.split(/\s+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

export function welcomeBack(stage: Stage, name: string | null, turn: number): string {
	const n = name?.trim() ? `, ${properName(name)}` : "";
	switch (stage) {
		case "stranger":
			return "Welcome back.";
		case "acquaintance":
			return pickAt([`Good to see you again${n}.`, `Welcome back${n}.`], turn);
		case "friend":
			return pickAt([`Welcome back${n}. It has been quiet here.`, `Good to have you back${n}.`], turn);
		case "oldFriend":
			return pickAt([`There you are${n}. I took the liberty of missing you.`, `Welcome back${n}. The place is better with you in it.`], turn);
	}
}

const MILESTONE_LINES: Partial<Record<MilestoneId, string>> = {
	firstFeeling: "Thank you for sharing how you feel with me. I will remember it.",
	firstEvent: "Thank you for trusting me with that. I will remember it.",
	days7: "That makes seven days of conversations. I have valued every one.",
	days30: "We have now spoken on thirty different days. I find that rather remarkable.",
	acquaintance: "I feel I am beginning to know you.",
	friend: "If you will permit me, I have come to think of you as a friend.",
	oldFriend: "At this point, I would call us old friends.",
};

export function milestoneLine(id: MilestoneId): string | null {
	return MILESTONE_LINES[id] ?? null;
}

const MEMORIES: Partial<Record<MilestoneId, string>> = {
	name: "I still remember the day you told me your name.",
	firstFeeling: "I still remember the first time you told me how you felt.",
	firstEvent: "I still think about the first thing you trusted me with.",
	days7: "It has been a while since our first week of conversations.",
};

export function sharedMemory(bond: Bond, turn: number): string | null {
	const options = bond.milestones.map((m) => MEMORIES[m.id]).filter((line): line is string => !!line);
	return options.length ? pickAt(options, turn) : null;
}

// "Are we close" only counts as the whole question, not "are we close to done?".
export function isAskCloseness(text: string): boolean {
	return /^\s*(?:(?:how close are we|what are we to each other|how well do you know me)\b|are we (?:friends|close)\W*$)/i.test(text);
}

export function isAskMet(text: string): boolean {
	return /^\s*(when did we (?:first )?meet|how long have we known each other|when did we first (?:talk|speak))\b/i.test(text);
}

const STAGE_WORDS: Record<Stage, string> = {
	stranger: "We have only just met, but I am glad you are here.",
	acquaintance: "I would say we are getting to know each other.",
	friend: "I would call us friends.",
	oldFriend: "I would call us old friends.",
};

export function closenessReply(bond: Bond): string {
	// Asking counts as talking, so a single day is always today.
	const days = bond.days <= 1 ? "today" : `on ${bond.days} different days`;
	const shared = bond.shared >= 5 ? ", and you have told me a good deal about yourself" : bond.shared > 0 ? ", and you have told me a little about yourself" : "";
	return `${STAGE_WORDS[stageOf(bond)]} We have spoken ${days}${shared}.`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinal = (n: number) => {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
};

export function spokenDate(iso: string, now: number): string {
	const d = new Date(iso);
	const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
	return `the ${ordinal(d.getDate())} of ${MONTHS[d.getMonth()]}${year}`;
}

export function metReply(bond: Bond, now: number): string {
	if (!bond.metAt) return "We have only just met, just now in fact.";
	return `We first spoke on ${spokenDate(bond.metAt, now)}.`;
}
