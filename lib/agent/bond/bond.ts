// Osmo's relationship with the user. Only counts are stored, and they only go up, so the bond is loyal.
// Closeness and stage are worked out from the counts each time, so retuning here updates every account.

export const MILESTONES = ["met", "name", "firstFeeling", "firstEvent", "days7", "days30", "acquaintance", "friend", "oldFriend"] as const;
export type MilestoneId = (typeof MILESTONES)[number];
export type Stage = "stranger" | "acquaintance" | "friend" | "oldFriend";

export type Bond = {
	metAt: string | null;
	messages: number;
	days: number;
	lastDay: string | null;
	shared: number;
	nameKnown: boolean;
	milestones: { id: MilestoneId; at: string }[];
	toMention: MilestoneId[];
};

export type TurnSignals = { now: number; feeling: boolean; event: boolean; nameKnown: boolean; demo?: boolean };

// Milestones that are recorded but never spoken about.
const QUIET: MilestoneId[] = ["met", "name"];

// Score thresholds. Roughly one point per day talked, so: a couple of days, about a week, about a month.
const THRESHOLDS: [Stage, number][] = [
	["oldFriend", 30],
	["friend", 8],
	["acquaintance", 2.5],
];

export function emptyBond(): Bond {
	return { metAt: null, messages: 0, days: 0, lastDay: null, shared: 0, nameKnown: false, milestones: [], toMention: [] };
}

export function localDay(now: number): string {
	const d = new Date(now);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Days weigh most, then sharing, then sheer message count. Sharing and messages have diminishing
// returns, so one long, open day cannot stand in for a week of talking.
export function score(b: Bond): number {
	return b.days + 0.5 * Math.sqrt(b.shared) + 0.3 * Math.sqrt(b.messages);
}

// 0 to 1, rising quickly at first and slowing down.
export function closeness(b: Bond): number {
	return 1 - Math.exp(-score(b) / 15);
}

export function stageOf(b: Bond): Stage {
	const s = score(b);
	return THRESHOLDS.find(([, min]) => s >= min)?.[0] ?? "stranger";
}

function reach(b: Bond, id: MilestoneId, now: number): Bond {
	if (b.milestones.some((m) => m.id === id)) return b;
	return {
		...b,
		milestones: [...b.milestones, { id, at: new Date(now).toISOString() }],
		toMention: QUIET.includes(id) ? b.toMention : [...b.toMention, id],
	};
}

export function recordTurn(bond: Bond, s: TurnSignals): Bond {
	const day = s.demo ? `demo-${bond.messages}` : localDay(s.now);
	const newName = s.nameKnown && !bond.nameKnown;
	let b: Bond = {
		...bond,
		metAt: bond.metAt ?? new Date(s.now).toISOString(),
		messages: bond.messages + 1,
		days: day !== bond.lastDay ? bond.days + 1 : bond.days,
		lastDay: day,
		shared: bond.shared + (s.feeling ? 1 : 0) + (s.event ? 1 : 0) + (newName ? 1 : 0),
		nameKnown: bond.nameKnown || s.nameKnown,
	};
	b = reach(b, "met", s.now);
	if (newName) b = reach(b, "name", s.now);
	if (s.feeling) b = reach(b, "firstFeeling", s.now);
	if (s.event) b = reach(b, "firstEvent", s.now);
	if (b.days >= 7) b = reach(b, "days7", s.now);
	if (b.days >= 30) b = reach(b, "days30", s.now);
	const stage = stageOf(b);
	if (stage !== "stranger") b = reach(b, "acquaintance", s.now);
	if (stage === "friend" || stage === "oldFriend") b = reach(b, "friend", s.now);
	if (stage === "oldFriend") b = reach(b, "oldFriend", s.now);
	return b;
}

export function mentioned(b: Bond, id: MilestoneId): Bond {
	return { ...b, toMention: b.toMention.filter((m) => m !== id) };
}

// ISO timestamps sort as text, so the smaller string is the earlier time.
const earlier = (a: string | null, b: string | null) => (a === null ? b : b === null || a <= b ? a : b);

// Combines the saved bond with this tab's, so a stale tab can never lower what another tab counted.
export function mergeBond(saved: Bond, incoming: Bond): Bond {
	const milestones = saved.milestones.map((m) => ({ ...m }));
	for (const m of incoming.milestones) {
		const had = milestones.find((x) => x.id === m.id);
		if (!had) milestones.push({ ...m });
		else had.at = earlier(had.at, m.at) ?? had.at;
	}
	// A milestone the other tab reached was queued there, so this tab does not say it too.
	const reachedElsewhere = (id: MilestoneId) => saved.milestones.some((m) => m.id === id) && !incoming.milestones.some((m) => m.id === id);
	return {
		metAt: earlier(saved.metAt, incoming.metAt),
		messages: Math.max(saved.messages, incoming.messages),
		days: Math.max(saved.days, incoming.days),
		lastDay: incoming.days >= saved.days ? incoming.lastDay : saved.lastDay,
		shared: Math.max(saved.shared, incoming.shared),
		nameKnown: saved.nameKnown || incoming.nameKnown,
		milestones,
		toMention: incoming.toMention.filter((id) => !reachedElsewhere(id)),
	};
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const isMilestone = (v: unknown): v is MilestoneId => (MILESTONES as readonly unknown[]).includes(v);

// Repairs a bond read from storage. Anything unusable becomes a fresh bond.
export function sanitizeBond(raw: unknown): Bond {
	if (!isObject(raw) || typeof raw.messages !== "number") return emptyBond();
	const milestones = Array.isArray(raw.milestones)
		? raw.milestones
				.filter((m): m is { id: MilestoneId; at: string } => isObject(m) && isMilestone(m.id) && typeof m.at === "string")
				.map((m) => ({ id: m.id, at: m.at }))
		: [];
	return {
		metAt: typeof raw.metAt === "string" ? raw.metAt : null,
		messages: count(raw.messages),
		days: count(raw.days),
		lastDay: typeof raw.lastDay === "string" ? raw.lastDay : null,
		shared: count(raw.shared),
		nameKnown: raw.nameKnown === true,
		milestones,
		toMention: Array.isArray(raw.toMention) ? raw.toMention.filter(isMilestone) : [],
	};
}
