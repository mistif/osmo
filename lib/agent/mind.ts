import { closeness, mentioned, recordTurn } from "./bond/bond";
import { closenessReply, isAskCloseness, isAskMet, metReply, milestoneLine } from "./bond/lines";
import { applyFeedback, decide, explain, parseVerdict, type Decision } from "./brain";
import { applyCues, applyGap, bondBaseline, missYou } from "./cues";
import { DILEMMAS, findDilemma, nextDilemma } from "./dilemmas";
import {
	applyEvent,
	argueOutlook,
	classifyUserEvents,
	describeEvent,
	detectArgument,
	kindFor,
	leaning,
	pickEvent,
	type StoryEvent,
} from "./events";
import { moodLabel, stepHeart } from "./heart";
import { withBaseFeelings } from "./lexicon/feelings";
import { moodTheme } from "./mood-theme";
import { adoptGenome, assemble, resolve } from "./personality/assemble";
import { flavorTurn } from "./personality/flavor";
import { afterReroll, describeMadeOf, isAskMadeOf, isConfirmRoll, parseReroll, REROLL_PROMPT } from "./personality/readout";
import type { AgentState } from "./state";
import { CRISIS_REPLY, isCrisis } from "./safety";
import { vary } from "./lexicon/variety";
import { causeOf, combineReplies, normalize, respond, understand } from "./talk";

export type Pending = { logId: string; dilemmaId: string; decision: Decision };
export type Session = {
	pending: Pending | null;
	last: Pending | null;
	dilemmasSeen: string[];
	// Why it feels the way it does, as a clause that follows "because".
	cause: string | null;
	turns: number;
	awaitingReroll: { seed: number } | null;
};

export type Effect =
	| { type: "event"; event: StoryEvent }
	| { type: "dilemma"; logId: string; dilemmaId: string; option: string }
	| { type: "verdict"; logId: string; agreed: boolean };

export type TurnContext = {
	now: number;
	lastAt: number | null;
	uuid: () => string;
	userName?: string | null;
	// Words the user taught it, e.g. { fam: "friend" }.
	slang?: Record<string, string>;
	// A fresh random seed, used when the user asks for a re-roll.
	seed?: number;
	// Words from the last few messages, so a typo can be read in context ("piza" after talking about pizza).
	recent?: string[];
	// The user's own words and how often they've used them, so they are never taken for typos.
	vocabulary?: Record<string, number>;
};
export type TurnResult = {
	state: AgentState;
	session: Session;
	reply: string | null;
	effects: Effect[];
};

export const newSession = (): Session => ({
	pending: null,
	last: null,
	dilemmasSeen: [],
	cause: null,
	turns: 0,
	awaitingReroll: null,
});

const STORY_TRIGGER = /\b(tell me a story|give me an experience|feed me an event|experience something)\b/i;
const DILEMMA_TRIGGER =
	/^\s*(?:give me|another|one more|hit me with)\s+(?:a\s+|another\s+)?(?:new\s+)?(?:moral\s+)?dilemma\b|^\s*dilemma\W*$/i;
const WHAT_WOULD_YOU_DO = /^\s*what would you do if\b/i;

// Demo switch: every message counts as a new day, so the bond's stages show within about 30 messages.
const DEMO = process.env.NEXT_PUBLIC_OSMO_DEMO === "1";

function acknowledge(event: StoryEvent): string {
	return event.valence === "happy"
		? "That is wonderful news. I am genuinely glad for you."
		: "I am so sorry. That is a heavy thing to carry, and I will remember it.";
}

export function processTurn(
	state: AgentState,
	session: Session,
	text: string,
	ctx: TurnContext,
): TurnResult {
	const trimmed = text.trim();
	const effects: Effect[] = [];
	const p = resolve(state.genome);

	// Heart: gap and cues first, then one coupling/decay step.
	const close = closeness(state.bond);
	const awayMs = ctx.lastAt !== null ? ctx.now - ctx.lastAt : 0;
	let activations = state.activations;
	if (ctx.lastAt !== null) activations = missYou(applyGap(activations, awayMs), awayMs, close);
	activations = applyCues(activations, withBaseFeelings(trimmed), p.reactivity);
	let s: AgentState = { ...state, activations: stepHeart(activations, state.coupling, bondBaseline(p.baseline, close)) };
	// Any message that is not a verdict clears the pending question.
	const sess: Session = { ...session, pending: null, turns: session.turns + 1, awaitingReroll: null };

	// 0. Talk of suicide or self-harm always comes first, whatever else is going on.
	if (isCrisis(trimmed)) {
		return {
			state: s,
			session: { ...sess, last: null, cause: "you told me you're hurting" },
			reply: CRISIS_REPLY,
			effects,
		};
	}

	// Bond: every non-crisis message counts. Sharing a feeling, a life event, or a name deepens it.
	const hypothetical = WHAT_WOULD_YOU_DO.test(trimmed);
	const told = hypothetical ? [] : classifyUserEvents(trimmed);
	const feeling = understand(trimmed, ctx.slang).some((part) => part.intent.type === "userFeeling");
	s = {
		...s,
		bond: recordTurn(s.bond, { now: ctx.now, feeling, event: told.length > 0, nameKnown: !!ctx.userName, demo: DEMO }),
	};

	// 1. Verdict on a decision. Bare yes/no only counts while a question is pending.
	const verdict = parseVerdict(trimmed);
	const target = session.pending ?? (verdict?.explicit ? session.last : null);
	const targetDilemma = target ? DILEMMAS.find((d) => d.id === target.dilemmaId) : undefined;
	if (verdict && target && targetDilemma) {
		s = { ...s, weights: applyFeedback(s.weights, targetDilemma, target.decision, verdict.agreed) };
		effects.push({ type: "verdict", logId: target.logId, agreed: verdict.agreed });
		return {
			state: s,
			session: { ...sess, last: null },
			reply: verdict.agreed
				? "Understood. I will trust that reasoning a little more."
				: "Noted. I will give the other side more weight next time.",
			effects,
		};
	}

	// Re-rolling the personality needs an explicit "yes, roll" straight after the offer.
	if (session.awaitingReroll && isConfirmRoll(trimmed)) {
		const genome = assemble(session.awaitingReroll.seed);
		s = adoptGenome(s, genome, { resetWeights: true });
		return { state: s, session: sess, reply: afterReroll(resolve(genome)), effects };
	}
	// A plain "yes" is not enough to re-roll, but it shouldn't quietly cancel the offer either.
	if (session.awaitingReroll && /^(?:yes|yeah|yep|yup|ya|sure|ok|okay|do it|go for it)\W*$/i.test(trimmed)) {
		return {
			state: s,
			session: { ...sess, awaitingReroll: session.awaitingReroll },
			reply: `Please say "yes, roll" to confirm. Otherwise I will remain as I am.`,
			effects,
		};
	}
	if (isConfirmRoll(trimmed)) {
		return {
			state: s,
			session: sess,
			reply: `There is nothing to confirm at the moment. Say "roll a new osmo" first if you would like a new version of me.`,
			effects,
		};
	}
	const reroll = parseReroll(trimmed);
	if (reroll) {
		const seed = reroll.seed ?? ctx.seed ?? 1;
		return { state: s, session: { ...sess, awaitingReroll: { seed } }, reply: REROLL_PROMPT, effects };
	}
	if (isAskMadeOf(trimmed)) {
		return { state: s, session: sess, reply: describeMadeOf(p), effects };
	}
	if (isAskCloseness(trimmed)) {
		return { state: s, session: sess, reply: closenessReply(s.bond), effects };
	}
	if (isAskMet(trimmed)) {
		return { state: s, session: sess, reply: metReply(s.bond, ctx.now), effects };
	}

	// 2. Life events the user tells it about.
	// A hypothetical ("what would you do if someone died") is not a real event.
	if (told.length > 0) {
		for (const event of told) {
			s = applyEvent(s, event, p.reactivity);
			effects.push({ type: "event", event });
		}
		let reply = told.map(acknowledge).join(" ");
		// The first-event thanks only fits this turn. After sad news the acknowledgement already
		// promises to remember, so it is cleared without being said.
		if (s.bond.toMention.includes("firstEvent")) {
			if (told.every((event) => event.valence === "happy")) reply += ` ${milestoneLine("firstEvent")}`;
			s = { ...s, bond: mentioned(s.bond, "firstEvent") };
		}
		return {
			state: s,
			session: { ...sess, cause: "of what you shared with me" },
			reply,
			effects,
		};
	}

	// 3. Attempts to argue its outlook one way or the other.
	const direction = detectArgument(trimmed);
	if (direction !== 0) {
		s = argueOutlook(s, direction);
		return {
			state: s,
			session: sess,
			reply: "I hear you. I will weigh that against what I have been through, but I make up my own mind.",
			effects,
		};
	}

	// 4. Feed it an experience from the library, alternating happy and tragic.
	if (STORY_TRIGGER.test(trimmed)) {
		const event = pickEvent(s.history);
		s = applyEvent(s, event, p.reactivity);
		effects.push({ type: "event", event });
		let reply = `${describeEvent(event)} I feel ${moodLabel(s.activations, p.baseline)}.`;
		const [prev, last] = s.history.slice(-2);
		if (prev && last && prev.valence !== last.valence) {
			const happy = prev.valence === "happy" ? prev : last;
			const tragic = prev.valence === "happy" ? last : prev;
			reply += ` ${leaning(s.outlook, kindFor(happy), kindFor(tragic))}`;
		}
		return {
			state: s,
			session: { ...sess, cause: `the story about ${event.kind} stayed with me` },
			reply,
			effects,
		};
	}

	// 5. Moral dilemmas.
	const asked = WHAT_WOULD_YOU_DO.test(trimmed);
	if (asked || DILEMMA_TRIGGER.test(trimmed)) {
		const found = asked ? findDilemma(trimmed) : null;
		if (asked && !found) {
			return {
				state: s,
				session: sess,
				reply: 'I don\'t have a scenario like that yet. Say "give me a dilemma" and I\'ll take one of mine.',
				effects,
			};
		}
		const dilemma = found ?? nextDilemma(sess.dilemmasSeen);
		const decision = decide(dilemma, s, p.baseline);
		const logId = ctx.uuid();
		effects.push({
			type: "dilemma",
			logId,
			dilemmaId: dilemma.id,
			option: dilemma.options[decision.chosen].label,
		});
		const pending: Pending = { logId, dilemmaId: dilemma.id, decision };
		return {
			state: s,
			session: { ...sess, pending, last: pending, dilemmasSeen: [...sess.dilemmasSeen, dilemma.id] },
			reply: `${dilemma.prompt} ${explain(dilemma, decision)} Do you agree?`,
			effects,
		};
	}

	// 6. Everyday conversation: greetings, feelings, small talk.
	// A message can say several things ("im good and i made you"), so answer each part.
	const spell = {
		recent: ctx.recent,
		protect: ctx.userName ? new Set([ctx.userName.toLowerCase()]) : undefined,
		personal: ctx.vocabulary ? new Map(Object.entries(ctx.vocabulary)) : undefined,
	};
	const parts = understand(trimmed, ctx.slang, spell);
	const spoken = parts
		.map((parsed) => respond(parsed, { state: s, cause: sess.cause, turn: session.turns, userName: ctx.userName, baseline: p.baseline }))
		.filter((r): r is string => r !== null);
	if (spoken.length > 0) {
		const cause = parts.map((x) => causeOf(x.intent)).find((c) => c !== null) ?? null;
		const sensitive = parts.some(({ intent }) =>
			intent.type === "insult" ||
			intent.type === "rudeFeedback" ||
			intent.type === "sexual" ||
			intent.type === "slashCommand" ||
			intent.type === "askFeeling" ||
			intent.type === "askWhyFeeling" ||
			((intent.type === "userFeeling" || intent.type === "feelingFromOsmo") && !intent.positive),
		);
		// Vary his own words, but never a word the user just used.
		const flavored = flavorTurn(vary(combineReplies(spoken), session.turns, new Set(normalize(trimmed).split(" "))), {
			intent: parts[0].intent.type,
			personality: p,
			turn: session.turns,
			tone: moodTheme(s.activations, p.baseline).tone,
			sensitive,
			bond: s.bond,
			userName: ctx.userName ?? null,
			awayMs,
		});
		const said = flavored.mentioned ? mentioned(s.bond, flavored.mentioned) : s.bond;
		// A first feeling not thanked for this turn (a sad one, say) is not brought up later.
		const bond = mentioned(said, "firstFeeling");
		return {
			state: { ...s, bond },
			session: cause ? { ...sess, cause } : sess,
			reply: flavored.text,
			effects,
		};
	}

	return { state: s, session: sess, reply: null, effects };
}
