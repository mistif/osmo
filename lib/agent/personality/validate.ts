import { BASELINE, EMOTIONS, VALUES } from "../state";
import type { Donor, HumorStyle } from "./types";

// Ordinary English that must never be treated as donor slang.
export const COMMON_WORDS = new Set(
	(
		"a about above after again all also am an and any are as at be because been before being but by can cannot could did do " +
		"does done down each even ever every few for from get go going good got great had has have he her here him his how i if " +
		"in into is it its just know like little look make many may me more most much must my new no not now of off oh ok okay " +
		"on one only or other our out over own really right said same say see she should so some still such take than that the " +
		"their them then there these they thing think this those through time to too two under up us use very want was way we " +
		"well were what when where which while who why will with would yes yet you your fine cool nice sure bad big best better " +
		"happy sad hello bye thanks please sorry love hate friend people man woman kid day night today tomorrow yesterday home " +
		"food water hot cold fast slow high low old young long short small large hard easy fun funny weird strange sweet sour " +
			// Ordinary words rejected as donor slang keys (Task 5 review).
			"dearest hush aloe moonlit petaled squall bearings beacon snuggly wiggly charting stat triage vitals pumpkin crumbly proofing " +
			"scone mulch seedling perennial trellis compost catnap knead ripper cheerio tarnation hootenanny yarn whopper ember slumber " +
			"drowsy cradle lull nightlight tenured syllabus pedantic sabbatical footnoted recruit barracks reveille squared shelving dewey " +
			"overdue stacks shushing fare gridlock detour espresso macchiato portafilter crema frappe verily posthaste tiresome " +
			"indubitably decorum gunwale bilge trawler landlubber chowder cruciverbalist acrostic clued rebus affirmative processing " +
			"firmware tenancy deposit plumber leaky lease bumpin digsite hackery twilit dampish"
	).split(" "),
);

// Names that talk down to the user. "Oh dear me" is fine; "Sit down, dear" is not.
const PET_NAMES = /\b(?:squirt|kiddo|little one|small friend|sweetheart|sweetie|darling|dahling|my sunshine|dear(?:est)?(?! me\b))\b/i;

const HUMOR_STYLES: HumorStyle[] = ["dry", "pun", "teasing", "absurd", "none"];
const between = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
const sentence = (s: unknown, max = 120) =>
	typeof s === "string" && s.length >= 3 && s.length <= max && /^[A-Z"']/.test(s) && /[.!?]$/.test(s);

export function validateDonor(d: Donor): string[] {
	const problems: string[] = [];
	const bad = (message: string) => problems.push(`${d.id}: ${message}`);

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id)) bad("id must be kebab-case");
	if (!/^The [A-Z]/.test(d.name)) bad('name must start with "The "');
	if (!d.tagline?.trim()) bad("missing tagline");

	if (!between(d.heart.reactivity, 0.6, 1.5)) bad("reactivity must be 0.6..1.5");
	for (const [emotion, delta] of Object.entries(d.heart.baseline)) {
		const key = emotion as (typeof EMOTIONS)[number];
		if (!EMOTIONS.includes(key)) bad(`unknown emotion ${emotion}`);
		else if (!between(delta, -0.4, 0.4)) bad(`baseline delta for ${emotion} must be within +-0.4`);
		else if (!between(BASELINE[key] + (delta as number), 0.05 - 1e-9, 0.85 + 1e-9)) bad(`baseline for ${emotion} leaves 0.05..0.85`);
	}

	const weights = VALUES.map((v) => d.brain[v]);
	if (!weights.every((w) => between(w, 0, 1)) || weights.reduce((a, b) => a + b, 0) <= 0) bad("brain weights invalid");

	for (const key of ["formality", "verbosity", "warmth"] as const) {
		if (!between(d.voice[key], 0, 1)) bad(`voice.${key} must be 0..1`);
	}
	if (d.voice.openers.length < 2 || d.voice.openers.length > 4 || !d.voice.openers.every((o) => sentence(o, 30))) {
		bad("voice.openers needs 2-4 short capitalized openers ending in punctuation");
	}
	if (!sentence(d.voice.elaboration)) bad("voice.elaboration must be one sentence");

	if (!HUMOR_STYLES.includes(d.humor.style)) bad("unknown humor style");
	else if (d.humor.style === "none") {
		if (d.humor.level !== 0 || d.humor.lines.length !== 0) bad('humor "none" needs level 0 and no lines');
	} else if (!between(d.humor.level, 0.05, 1) || d.humor.lines.length < 3 || d.humor.lines.length > 6 || !d.humor.lines.every((l) => sentence(l))) {
		bad("humor needs level 0.05..1 and 3-6 sentences");
	}

	const words = Object.entries(d.slang.lexicon);
	if (words.length < 4 || words.length > 8) bad("slang.lexicon needs 4-8 words");
	for (const [word, meaning] of words) {
		if (!/^[a-z0-9]+$/.test(word)) bad(`slang word "${word}" must be one lowercase token`);
		else if (COMMON_WORDS.has(word)) bad(`slang word "${word}" is an ordinary English word`);
		if (typeof meaning !== "string" || !/^[a-z ]{1,40}$/.test(meaning) || meaning.split(" ").length > 4) {
			bad(`slang meaning for "${word}" must be 1-4 lowercase plain words`);
		}
	}
	if (d.slang.says.length < 2 || d.slang.says.length > 4 || !d.slang.says.every((s) => sentence(s, 24))) {
		bad("slang.says needs 2-4 short sentences (24 characters max)");
	}

	if (d.quirks.phrases.length < 2 || d.quirks.phrases.length > 4 || !d.quirks.phrases.every((p) => sentence(p))) {
		bad("quirks.phrases needs 2-4 sentences");
	}
	if (!between(d.quirks.rate, 0.05, 0.3)) bad("quirks.rate must be 0.05..0.3");

	const spoken = [...d.voice.openers, d.voice.elaboration, ...d.humor.lines, ...d.slang.says, ...d.quirks.phrases];
	for (const line of spoken) if (PET_NAMES.test(line)) bad(`"${line}" talks down to the user with a pet name`);

	return problems;
}

export function validateRoster(donors: Donor[]): string[] {
	const problems: string[] = [];
	const ids = new Set<string>();
	const names = new Set<string>();
	const meanings = new Map<string, string>();
	for (const d of donors) {
		if (ids.has(d.id)) problems.push(`duplicate id ${d.id}`);
		if (names.has(d.name)) problems.push(`duplicate name ${d.name}`);
		ids.add(d.id);
		names.add(d.name);
		for (const [word, meaning] of Object.entries(d.slang.lexicon)) {
			const seen = meanings.get(word);
			if (seen !== undefined && seen !== meaning) problems.push(`slang word "${word}" has conflicting meanings`);
			else meanings.set(word, meaning);
		}
	}
	return problems;
}
