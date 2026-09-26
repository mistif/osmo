import { clamp01 } from "./heart";
import {
	EMOTIONS,
	type AgentState,
	type Coupling,
	type Emotion,
	type EventRecord,
	type Valence,
} from "./state";

export type StoryEvent = {
	id: string;
	kind: string;
	valence: Valence;
	text: string;
	shifts: Partial<Record<Emotion, number>>;
};

export const EVENTS: StoryEvent[] = [
	{ id: "h1", kind: "reunion", valence: "happy", text: "Two old friends meet again after twenty years and talk until sunrise.", shifts: { joy: 0.3, love: 0.2, loneliness: -0.15 } },
	{ id: "h2", kind: "achievement", valence: "happy", text: "A student who struggled all year finally passes the exam.", shifts: { joy: 0.3, hope: 0.2, trust: 0.05 } },
	{ id: "h3", kind: "kindness", valence: "happy", text: "A stranger pays for a tired traveler's meal and walks away without a word.", shifts: { trust: 0.25, joy: 0.2, hope: 0.15 } },
	{ id: "h4", kind: "birth", valence: "happy", text: "A baby is born healthy after a long night.", shifts: { joy: 0.35, love: 0.3, hope: 0.2 } },
	{ id: "h5", kind: "recovery", valence: "happy", text: "A patient walks out of the hospital after months of treatment.", shifts: { joy: 0.3, hope: 0.3, fear: -0.15 } },
	{ id: "h6", kind: "friendship", valence: "happy", text: "A lonely kid is invited to sit at a lunch table.", shifts: { joy: 0.2, trust: 0.2, loneliness: -0.25 } },
	{ id: "h7", kind: "discovery", valence: "happy", text: "A scientist sees her experiment work for the first time.", shifts: { joy: 0.25, surprise: 0.25, hope: 0.2 } },
	{ id: "h8", kind: "rescue", valence: "happy", text: "A firefighter carries a stranded dog out of a burning building.", shifts: { joy: 0.25, trust: 0.2, surprise: 0.15, fear: -0.1 } },
	{ id: "h9", kind: "forgiveness", valence: "happy", text: "A father and daughter forgive each other after years of silence.", shifts: { love: 0.3, guilt: -0.2, joy: 0.2, loneliness: -0.2 } },
	{ id: "h10", kind: "celebration", valence: "happy", text: "A whole village dances after the harvest is saved.", shifts: { joy: 0.35, love: 0.15, trust: 0.1 } },
	{ id: "t1", kind: "loss", valence: "tragic", text: "An old man buries his wife of fifty years.", shifts: { sadness: 0.4, loneliness: 0.3, love: 0.1 } },
	{ id: "t2", kind: "betrayal", valence: "tragic", text: "A worker discovers her closest friend stole her idea.", shifts: { anger: 0.3, sadness: 0.2, trust: -0.35, disgust: 0.15 } },
	{ id: "t3", kind: "injustice", valence: "tragic", text: "An innocent man is convicted while the real culprit walks free.", shifts: { anger: 0.35, disgust: 0.2, hope: -0.2, trust: -0.2 } },
	{ id: "t4", kind: "cruelty", valence: "tragic", text: "Bullies laugh as a boy's belongings are thrown in the river.", shifts: { anger: 0.25, sadness: 0.2, disgust: 0.3, fear: 0.1 } },
	{ id: "t5", kind: "illness", valence: "tragic", text: "A young mother is told her illness cannot be cured.", shifts: { sadness: 0.35, fear: 0.3, hope: -0.2 } },
	{ id: "t6", kind: "abandonment", valence: "tragic", text: "A child waits at the station for a parent who never comes.", shifts: { sadness: 0.35, loneliness: 0.4, trust: -0.25 } },
	{ id: "t7", kind: "disaster", valence: "tragic", text: "A flood washes away a town in a single night.", shifts: { fear: 0.35, sadness: 0.3, surprise: 0.2 } },
	{ id: "t8", kind: "failure", valence: "tragic", text: "A dedicated athlete misses the final by a fraction of a second.", shifts: { sadness: 0.25, guilt: 0.2, hope: -0.1 } },
	{ id: "t9", kind: "war", valence: "tragic", text: "Families flee their homes as the sirens begin.", shifts: { fear: 0.35, sadness: 0.3, anger: 0.15, hope: -0.15 } },
	{ id: "t10", kind: "poverty", valence: "tragic", text: "A family shares a single loaf of bread for three days.", shifts: { sadness: 0.3, guilt: 0.1, hope: -0.1, anger: 0.1 } },
];

export const OUTLOOK_RATE = 0.08;
export const LINK_STEP = 0.02;
export const LINK_MAX = 0.8;
export const ARGUE_STEP = 0.02;

export function pickEvent(history: EventRecord[]): StoryEvent {
	const happy = history.filter((h) => h.valence === "happy").length;
	const tragic = history.length - happy;
	const valence: Valence = happy <= tragic ? "happy" : "tragic";
	const pool = EVENTS.filter((e) => e.valence === valence);
	const seen = new Set(history.map((h) => h.id));
	return pool.find((e) => !seen.has(e.id)) ?? pool[history.length % pool.length];
}

export function learnCoupling(c: Coupling, valence: Valence): Coupling {
	const next = structuredClone(c);
	for (const target of EMOTIONS) {
		for (const [source, w] of Object.entries(next[target]) as [Emotion, number][]) {
			if (valence === "tragic" && target === "sadness" && w > 0) {
				next[target][source] = Math.min(LINK_MAX, w + LINK_STEP);
			}
			if (valence === "happy" && w < 0) {
				next[target][source] = Math.max(-LINK_MAX, w - LINK_STEP);
			}
		}
	}
	return next;
}

export function applyEvent(state: AgentState, event: StoryEvent, reactivity = 1): AgentState {
	const assoc = state.associations[event.kind];
	const n = assoc?.count ?? 0;
	const tendencies: Partial<Record<Emotion, number>> = { ...(assoc?.tendencies ?? {}) };
	const activations = { ...state.activations };
	let intensity = 0;

	const affected = new Set<Emotion>([
		...(Object.keys(event.shifts) as Emotion[]),
		...(Object.keys(tendencies) as Emotion[]),
	]);
	for (const e of affected) {
		const base = event.shifts[e] ?? 0;
		const learned = tendencies[e] ?? 0;
		const effective = n > 0 ? 0.6 * base + 0.4 * learned : base;
		activations[e] = clamp01(activations[e] + effective * reactivity);
		tendencies[e] = (learned * n + base) / (n + 1);
		intensity += Math.abs(effective);
	}

	const sign = event.valence === "happy" ? 1 : -1;
	const outlook = Math.max(
		-1,
		Math.min(1, state.outlook + sign * Math.min(1, intensity) * OUTLOOK_RATE),
	);

	return {
		...state,
		activations,
		coupling: learnCoupling(state.coupling, event.valence),
		outlook,
		associations: { ...state.associations, [event.kind]: { count: n + 1, tendencies } },
		history: [...state.history, { id: event.id, valence: event.valence }],
	};
}

// First person only ("I/we ..."), so news about other people is not the user's own.
const HAPPY_TOLD =
	/\b(?:(?:i|we)\s+(?:got the job|got promoted|graduated|got engaged|had a baby|passed (?:my|the) (?:exam|test|class|course|interview)|won (?:the|a))|good news)\b/i;
const NEGATED_GOOD_NEWS = /\b(?:not|no|never|\w+n['’]?t)\b[^.!?]{0,15}\bgood news\b/i;
const NEGATED_HAPPY =
	/\b(?:not|never|no|\w+n['’]?t)\b[^.!?]{0,20}\b(?:get|got|win|won|pass|passed|graduate|graduated|have|had|promoted|engaged)\b/i;
const PEOPLE_AND_PETS =
	"mom|mum|mother|dad|father|grandma|grandpa|grandmother|grandfather|brother|sister|son|daughter|wife|husband|friend|dog|cat|pet|uncle|aunt|cousin|parent|parents|baby|boyfriend|girlfriend|partner|colleague|neighbor|neighbour|teacher";
const TRAGIC_TOLD = new RegExp(
	String.raw`\b(?:(?:${PEOPLE_AND_PETS})(?:\s+\w+){0,2}\s+(?:died|passed away)|funeral|got fired|broke up|breakup|diagnosed|lost my (?:job|mother|father|mom|dad|friend|dog|cat|wife|husband|home|house|grandma|grandpa|brother|sister|son|daughter))\b`,
	"i",
);
const NEGATED_TRAGIC =
	/\b(?:not|never|nobody|no one|\w+n['’]?t)\b[^.!?]{0,20}\b(?:diagnosed|fired|died|passed away|broke up)\b/i;

// Negation is judged per clause so "I didn't think I'd get it, but I got the job" still counts.
export function classifyUserEvents(text: string): StoryEvent[] {
	if (/\?\s*$/.test(text)) return [];
	const clauses = text.split(/[,;.!?]|\bbut\b/i);
	const found: StoryEvent[] = [];
	if (clauses.some((c) => HAPPY_TOLD.test(c) && !NEGATED_HAPPY.test(c) && !NEGATED_GOOD_NEWS.test(c))) {
		found.push({
			id: "user-happy",
			kind: "achievement",
			valence: "happy",
			text: "You shared good news with me.",
			shifts: { joy: 0.3, hope: 0.15, love: 0.05 },
		});
	}
	if (clauses.some((c) => TRAGIC_TOLD.test(c) && !NEGATED_TRAGIC.test(c))) {
		found.push({
			id: "user-tragic",
			kind: "loss",
			valence: "tragic",
			text: "You shared something painful with me.",
			shifts: { sadness: 0.3, loneliness: 0.1, fear: 0.05 },
		});
	}
	return found;
}

const BRIGHT =
	/\b(bright side|things (?:will|do) get better|there is (?:still )?good|people are (?:good|kind))\b/i;
const DARK =
	/\b(nothing matters|the world is (?:cruel|terrible|awful)|people are (?:awful|cruel|evil)|there is no hope)\b/i;

export function detectArgument(text: string): 1 | -1 | 0 {
	if (BRIGHT.test(text)) return 1;
	if (DARK.test(text)) return -1;
	return 0;
}

export function argueOutlook(state: AgentState, direction: 1 | -1): AgentState {
	const nudge = direction * ARGUE_STEP * state.activations.trust;
	return { ...state, outlook: Math.max(-1, Math.min(1, state.outlook + nudge)) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function leaning(outlook: number, happyKind: string, tragicKind: string): string {
	if (outlook > 0.05) {
		return `I lean toward hope. ${cap(happyKind)} felt stronger to me than ${tragicKind}.`;
	}
	if (outlook < -0.05) {
		return `I lean toward caution. ${cap(tragicKind)} weighed on me more than ${happyKind}.`;
	}
	return `I'm undecided. ${cap(happyKind)} and ${tragicKind} pull on me about equally.`;
}

export function kindFor(record: EventRecord): string {
	return (
		EVENTS.find((e) => e.id === record.id)?.kind ??
		(record.valence === "happy" ? "joy" : "sorrow")
	);
}

export function describeEvent(event: StoryEvent): string {
	return event.text;
}
