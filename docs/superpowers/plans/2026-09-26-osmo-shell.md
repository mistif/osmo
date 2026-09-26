# Osmo Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the site Osmo and nothing else: a passkey lock screen, then his room with Memory, Insights and Settings panels, plus a daily mood history, ready to deploy on Vercel.

**Architecture:** Pure logic lives in small tested modules (`lib/shell/*` for panel wording and helpers, `lib/agent/mood-days.ts` for mood history). Screens are client components in `components/osmo/*` with CSS modules that inherit the room's mood variables. The room (`app/assistant.tsx`) gains a header with three panel links and mounts one panel at a time. Routing moves the room to `/` and the lock to `/lock` with config redirects.

**Tech Stack:** Next.js 16.3.6 (App Router), React 19, TypeScript, CSS modules, Supabase (`@supabase/supabase-js` 2.117.1, built-in passkeys), Vitest (node environment, `lib/**/*.test.ts` only).

**Spec:** `docs/superpowers/specs/2026-09-26-osmo-shell-design.md`

## Global Constraints

- **Git:** the repo is on branch `main` (private GitHub `mistif/osmo`). Stage by exact path; never `git add -A` or `git add .`; the language session commits its own files in the same tree. Never push; pushing is Gur's call.
- **Commits:** every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **File ownership:** never edit `lib/agent/talk.ts`, `context.ts`, `safety.ts`, `lib/facts.ts`, `lib/agent/lexicon/*`, `lib/agent/dictionary*.ts`, `lib/agent/vocabulary-store.ts`, `lib/agent/chatlog.test.ts`, `lib/agent/voice.test.ts`, or `sendMessage` and its helpers in `app/assistant.tsx`. In `app/assistant.tsx`, only the edits named in this plan's tasks are allowed. The controller messages the language session ("Supabase database for conversations") before and after each `app/assistant.tsx` edit.
- **The builder never signs in, never clicks "Lock Osmo", "Remove", "Forget" or "Remember" in the browser, and never edits memory there.** The browser pane may hold Gur's real session; checks are read-only.
- **Passkeys:** use `supabase.auth.signInWithPasskey()`, `supabase.auth.registerPasskey()`, `supabase.auth.passkey.list/update/delete`. No `experimental` client flag: in the installed version passkeys are on by default and the flag is ignored.
- **Copy rules:**
  - sentence case,
  - Osmo speaks in the first person in panels,
  - no all-caps labels, no eyebrow labels, no "→" on buttons, no key/value tables,
  - errors say what happened and what to do.

  Exact strings:
  - `That didn't unlock. Try again, or use your email and password on this device.`
  - `That email and password didn't match. Check them and try again.`
  - `I can't reach my memory right now. Try again in a moment.`
  - `Couldn't save that. Try again.`
  - `This device couldn't save a passkey. You can try again from Settings.`
  - `I don't know much about you yet. Tell me something, like your favorite food.`
  - `I'll start keeping track of how I feel from today.`
- **Visual tokens** (frontend-design plan for this brief):
  - **Color:**
    - bone `#f3efe8` (text),
    - the room's mood variables `--aura-a`, `--aura-b`, `--base` (panels inherit them),
    - panel surface `color-mix(in oklab, color-mix(in oklab, var(--aura-a) 16%, var(--base)) 92%, transparent)`,
    - lock screen calm base `hsl(172 30% 10%)` with aura `hsl(172 38% 50%)`,
    - errors `#f2b8a2` (warm, readable on dark; not red-on-dark).
  - **Type:** Bricolage Grotesque only.
    - Panel title: `clamp(1.9rem, 4vw, 2.5rem)`, weight 700, letter-spacing `-0.035em`, line-height 1.
    - Section heading: `0.95rem`, weight 600, opacity 0.72.
    - Items: `1rem`, line-height 1.5.
    - Dates: `0.8rem` with `font-variant-numeric: tabular-nums`.
  - **Layout:** panels slide over the right side (`width: min(28rem, 50vw)`; full width under 40rem). Content is left-aligned. Lines are plain rows separated by space, not borders or cards.
  - **Motion:** the only bold moment is the unlock bloom (the circle scales up and fades while the room fades in). The only other motion is a panel's slide-in. `prefers-reduced-motion: reduce` turns both into instant or opacity-only changes.
  - **Quality floor:** visible `:focus-visible` outlines in `--aura-a`, contrast at least 4.5:1 for text, works at 375px width.
- **Tests:** `npx vitest run` (full suite) and `npx tsc --noEmit -p .` must pass after every task; `npm run lint` must report 0 errors after UI tasks.

## Review Focus

- **Editing a memory to an empty or whitespace value:** a reasonable person expects that to cancel, not to save an empty fact. Pinned by `cleanEditedValue` tests in Task 2.
- **Days with no conversation inside the 7-day window:** these must show as gaps, not as a mood of zero, including the midnight boundary where a new day starts a fresh row. Pinned by `weekSeries` and `foldMood` tests in Task 1.
- **A passkey with no name and never used:** it must still get a readable row ("Unnamed device", "Not used yet"). Pinned by `deviceRow` tests in Task 2.
- **Osmo with no personality yet (genome null) or an empty bond:** Insights must still render sensible sentences. Pinned by `madeFromLines` and `storyLines` tests in Task 2.
- **A day string compared across time zones:** `YYYY-MM-DD` values must be read as local days, never shifted by UTC parsing. Pinned by `spokenDay` and `weekSeries` tests in Tasks 1-2.

---

### Task 1: Mood history (`mood_days`)

**Files:**
- Create: `lib/agent/mood-days.ts`
- Test: `lib/agent/mood-days.test.ts`
- Modify: `lib/agent/agent-state.ts` (add `saveMoodDay`, call it at the end of `persistTurn`)
- Database: migration `add_mood_days` (applied by the controller, not the implementer)

**Interfaces:**
- Consumes: `localDay(now: number): string` from `lib/agent/bond/bond.ts`; `moodTheme(a, baseline)` from `lib/agent/mood-theme.ts` (returns `{ tone: string; valence: number; ... }`); `resolve(genome)` from `lib/agent/personality/assemble.ts` (returns `{ baseline }`).
- Produces:
  - `type MoodDay = { day: string; valence: number; strongest: string; tally: Record<string, number>; samples: number }`
  - `foldMood(row: MoodDay | null, day: string, valence: number, tone: string): MoodDay`
  - `weekSeries(rows: MoodDay[], today: string): SeriesDay[]` where `type SeriesDay = { day: string; valence: number | null; strongest: string | null }` (7 entries, oldest first)
  - `sanitizeMoodDay(raw: unknown): MoodDay | null`
  - `strongestPhrase(tone: string): string` (e.g. `"mostly hopeful"`)
  - `dayName(day: string): string` (e.g. `"Tuesday"`)

- [ ] **Step 1: Write the failing tests**

```ts
// lib/agent/mood-days.test.ts
import { describe, expect, it } from "vitest";
import { dayName, foldMood, sanitizeMoodDay, strongestPhrase, weekSeries, type MoodDay } from "./mood-days";

describe("foldMood", () => {
	it("starts a fresh row for a new day", () => {
		expect(foldMood(null, "2026-09-26", 0.4, "hope")).toEqual({
			day: "2026-09-26",
			valence: 0.4,
			strongest: "hope",
			tally: { hope: 1 },
			samples: 1,
		});
	});

	it("keeps a running average and tallies the strongest emotion", () => {
		let row = foldMood(null, "2026-09-26", 0.6, "joy");
		row = foldMood(row, "2026-09-26", 0, "calm");
		row = foldMood(row, "2026-09-26", 0.3, "calm");
		expect(row.samples).toBe(3);
		expect(row.valence).toBeCloseTo(0.3);
		expect(row.tally).toEqual({ joy: 1, calm: 2 });
		expect(row.strongest).toBe("calm");
	});

	it("keeps the current strongest on a tie", () => {
		let row = foldMood(null, "2026-09-26", 0, "joy");
		row = foldMood(row, "2026-09-26", 0, "sadness");
		expect(row.strongest).toBe("joy");
	});

	it("never carries yesterday's numbers into a new day", () => {
		const yesterday = foldMood(null, "2026-09-25", -0.8, "sadness");
		expect(foldMood(yesterday, "2026-09-26", 0.2, "calm")).toEqual({
			day: "2026-09-26",
			valence: 0.2,
			strongest: "calm",
			tally: { calm: 1 },
			samples: 1,
		});
	});
});

describe("weekSeries", () => {
	const row = (day: string, valence: number, strongest = "calm"): MoodDay => ({ day, valence, strongest, tally: { [strongest]: 1 }, samples: 1 });

	it("returns the last 7 local days, oldest first, with gaps as null", () => {
		const series = weekSeries([row("2026-09-21", 0.1), row("2026-09-26", 0.5, "hope")], "2026-09-26");
		expect(series.map((d) => d.day)).toEqual([
			"2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26",
		]);
		expect(series[0]).toEqual({ day: "2026-09-20", valence: null, strongest: null });
		expect(series[1]).toEqual({ day: "2026-09-21", valence: 0.1, strongest: "calm" });
		expect(series[6]).toEqual({ day: "2026-09-26", valence: 0.5, strongest: "hope" });
	});

	it("crosses month and year boundaries on local days", () => {
		expect(weekSeries([], "2026-03-02").map((d) => d.day)[0]).toBe("2026-02-24");
		expect(weekSeries([], "2027-01-03").map((d) => d.day)[0]).toBe("2026-12-28");
	});

	it("ignores rows outside the window", () => {
		expect(weekSeries([row("2026-09-01", 0.9)], "2026-09-26").every((d) => d.valence === null)).toBe(true);
	});
});

describe("wording and sanitizing", () => {
	it("phrases the strongest emotion", () => {
		expect(strongestPhrase("hope")).toBe("mostly hopeful");
		expect(strongestPhrase("calm")).toBe("mostly calm");
		expect(strongestPhrase("loneliness")).toBe("mostly lonely");
		expect(strongestPhrase("unknown")).toBe("mostly calm");
	});

	it("names a local day without UTC drift", () => {
		expect(dayName("2026-09-22")).toBe("Tuesday");
		expect(dayName("2026-09-27")).toBe("Sunday");
	});

	it("repairs rows read from the database", () => {
		expect(sanitizeMoodDay(null)).toBeNull();
		expect(sanitizeMoodDay({ day: "2026-09-26", valence: "x" })).toBeNull();
		expect(sanitizeMoodDay({ day: "2026-09-26", valence: 0.2, strongest: "hope", tally: { hope: 2 }, samples: 2 })).toEqual({
			day: "2026-09-26", valence: 0.2, strongest: "hope", tally: { hope: 2 }, samples: 2,
		});
		expect(sanitizeMoodDay({ day: "2026-09-26", valence: 0.2, strongest: "hope", tally: "bad", samples: -3 })).toEqual({
			day: "2026-09-26", valence: 0.2, strongest: "hope", tally: {}, samples: 0,
		});
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/agent/mood-days.test.ts`
Expected: FAIL, "Failed to resolve import ./mood-days".

- [ ] **Step 3: Implement `lib/agent/mood-days.ts`**

```ts
// lib/agent/mood-days.ts
// One row per day of Osmo's mood: a running average of how positive he felt, and which feeling led most often.
import { localDay } from "./bond/bond";

export type MoodDay = { day: string; valence: number; strongest: string; tally: Record<string, number>; samples: number };
export type SeriesDay = { day: string; valence: number | null; strongest: string | null };

export function foldMood(row: MoodDay | null, day: string, valence: number, tone: string): MoodDay {
	if (!row || row.day !== day) return { day, valence, strongest: tone, tally: { [tone]: 1 }, samples: 1 };
	const samples = row.samples + 1;
	const tally = { ...row.tally, [tone]: (row.tally[tone] ?? 0) + 1 };
	// A tie keeps the feeling that was already leading, so the day's word doesn't flicker.
	const strongest = tally[tone] > (tally[row.strongest] ?? 0) ? tone : row.strongest;
	return { day, valence: row.valence + (valence - row.valence) / samples, strongest, tally, samples };
}

// "YYYY-MM-DD" read as a local calendar day. new Date("2026-09-26") would be UTC midnight and can land on the day before.
function localDate(day: string): Date {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y, m - 1, d, 12);
}

export function weekSeries(rows: MoodDay[], today: string): SeriesDay[] {
	const byDay = new Map(rows.map((r) => [r.day, r]));
	const end = localDate(today);
	return Array.from({ length: 7 }, (_, i) => {
		const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (6 - i), 12);
		const day = localDay(date.getTime());
		const row = byDay.get(day);
		return { day, valence: row ? row.valence : null, strongest: row ? row.strongest : null };
	});
}

const ADJECTIVE: Record<string, string> = {
	calm: "calm",
	joy: "happy",
	sadness: "sad",
	anger: "angry",
	fear: "anxious",
	trust: "at ease",
	disgust: "put off",
	surprise: "surprised",
	love: "affectionate",
	hope: "hopeful",
	guilt: "guilty",
	loneliness: "lonely",
	boredom: "bored",
};

export function strongestPhrase(tone: string): string {
	return `mostly ${ADJECTIVE[tone] ?? "calm"}`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayName(day: string): string {
	return DAYS[localDate(day).getDay()];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function sanitizeMoodDay(raw: unknown): MoodDay | null {
	if (!isObject(raw) || typeof raw.day !== "string" || !finite(raw.valence)) return null;
	const tally: Record<string, number> = {};
	if (isObject(raw.tally)) for (const [k, v] of Object.entries(raw.tally)) if (finite(v) && v > 0) tally[k] = Math.floor(v);
	return {
		day: raw.day,
		valence: Math.max(-1, Math.min(1, raw.valence)),
		strongest: typeof raw.strongest === "string" ? raw.strongest : "calm",
		tally,
		samples: finite(raw.samples) ? Math.max(0, Math.floor(raw.samples)) : 0,
	};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/mood-days.test.ts`
Expected: PASS.

- [ ] **Step 5: Save a mood sample on every saved turn**

In `lib/agent/agent-state.ts`, add imports next to the existing ones:

```ts
import { localDay } from "./bond/bond";
import { foldMood, sanitizeMoodDay } from "./mood-days";
import { moodTheme } from "./mood-theme";
import { resolve } from "./personality/assemble";
```

(Merge `localDay` into the existing `./bond/bond` import line.) Add this function above `persistTurn`:

```ts
// Today's mood row gets one more sample. A failure here is logged and never stops the rest of the save.
async function saveMoodDay(state: AgentState, userId: string): Promise<void> {
	try {
		const day = localDay(Date.now());
		const { valence, tone } = moodTheme(state.activations, resolve(state.genome).baseline);
		const { data, error } = await supabase
			.from("mood_days")
			.select("day,valence,strongest,tally,samples")
			.eq("day", day)
			.maybeSingle();
		if (error) throw error;
		const row = foldMood(sanitizeMoodDay(data), day, valence, tone);
		const saved = await supabase
			.from("mood_days")
			.upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
		if (saved.error) throw saved.error;
	} catch (error) {
		console.error("Could not save today's mood", error);
	}
}
```

In `persistTurn`, directly after the `check(await supabase.from("agent_state").upsert(...))` call, add:

```ts
		await saveMoodDay(state, userId);
```

- [ ] **Step 6: The controller applies the migration** (the implementer skips this step and says so in the report)

Controller, via the Supabase MCP `apply_migration` tool, project `jtkeljvldtngkrftzwdm`, name `add_mood_days`:

```sql
create table if not exists public.mood_days (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	day date not null,
	valence real not null,
	strongest text not null,
	tally jsonb not null default '{}'::jsonb,
	samples integer not null default 0,
	updated_at timestamptz not null default now(),
	primary key (user_id, day)
);
alter table public.mood_days enable row level security;
create policy "own mood_days" on public.mood_days for all
	using ((select auth.uid()) = user_id)
	with check ((select auth.uid()) = user_id);
```

Verify with `execute_sql`:

```sql
select relrowsecurity from pg_class where relname = 'mood_days';
```

Expected: `true`.

- [ ] **Step 7: Run the full suite and type check, then commit**

Run: `npx vitest run` and `npx tsc --noEmit -p .`
Expected: all pass.

```bash
git add lib/agent/mood-days.ts lib/agent/mood-days.test.ts lib/agent/agent-state.ts
git commit -F - <<'EOF'
feat: record Osmo's daily mood in mood_days

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Panel wording helpers (`lib/shell/*`)

**Files:**
- Create: `lib/shell/memory-lines.ts`, `lib/shell/story.ts`, `lib/shell/devices.ts`, `lib/shell/unlock-errors.ts`
- Test: `lib/shell/memory-lines.test.ts`, `lib/shell/story.test.ts`, `lib/shell/devices.test.ts`, `lib/shell/unlock-errors.test.ts`

**Interfaces:**
- Consumes:
  - `type MemoryFact = { key: string; value: string }` from `lib/facts.ts` (read-only import),
  - `type Bond`, `type MilestoneId` from `lib/agent/bond/bond.ts`,
  - `type Personality` (with `names: Record<"heart"|"brain"|"voice"|"humor"|"slang"|"quirks", string> | null`) from `lib/agent/personality/assemble.ts`.
- Produces:
  - `type MemoryGroup = "about" | "words" | "explained"`
  - `type MemoryLine = { key: string; group: MemoryGroup; sentence: string; lead: string; value: string }`
  - `memoryLine(fact: MemoryFact): MemoryLine`
  - `groupMemory(facts: MemoryFact[]): Record<MemoryGroup, MemoryLine[]>`
  - `GROUP_TITLES: Record<MemoryGroup, string>`
  - `cleanEditedValue(value: string): string | null`
  - `shortDate(iso: string, now: number): string`
  - `storyLines(bond: Bond, now: number): { id: MilestoneId; date: string; text: string }[]`
  - `madeFromLines(names: Personality["names"]): string[]`
  - `type DeviceSource = { id: string; friendly_name?: string; created_at: string; last_used_at?: string }`
  - `deviceRow(item: DeviceSource, now: number): { id: string; name: string; lastUsed: string }`
  - `unlockMessage(error: unknown, via: "passkey" | "password"): string`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/shell/memory-lines.test.ts
import { describe, expect, it } from "vitest";
import { cleanEditedValue, groupMemory, memoryLine } from "./memory-lines";

describe("memoryLine", () => {
	it("speaks each kind of memory in Osmo's first person, keeping the editable value separate", () => {
		expect(memoryLine({ key: "name", value: "Gur" })).toEqual({
			key: "name", group: "about", sentence: "You told me your name is Gur.", lead: "You told me your name is", value: "Gur",
		});
		expect(memoryLine({ key: "likes", value: "pizza" }).sentence).toBe("You told me you like pizza.");
		expect(memoryLine({ key: "dog", value: "Nala" }).sentence).toBe("You told me your dog is Nala.");
		expect(memoryLine({ key: "slang:bet", value: "okay" })).toMatchObject({
			group: "words", sentence: 'You taught me that "bet" means okay.', lead: 'You taught me that "bet" means',
		});
		expect(memoryLine({ key: "meaning:zorp blat", value: "a kind of snack" })).toMatchObject({
			group: "explained", sentence: 'You explained that "zorp blat" means a kind of snack.',
		});
	});
});

describe("groupMemory", () => {
	it("groups facts, with the name first in About you", () => {
		const groups = groupMemory([
			{ key: "dog", value: "Nala" },
			{ key: "slang:bet", value: "okay" },
			{ key: "name", value: "Gur" },
			{ key: "meaning:zorp", value: "a snack" },
		]);
		expect(groups.about.map((l) => l.key)).toEqual(["name", "dog"]);
		expect(groups.words.map((l) => l.key)).toEqual(["slang:bet"]);
		expect(groups.explained.map((l) => l.key)).toEqual(["meaning:zorp"]);
		expect(groupMemory([])).toEqual({ about: [], words: [], explained: [] });
	});
});

describe("cleanEditedValue", () => {
	it("trims, and treats an empty edit as a cancel", () => {
		expect(cleanEditedValue("  Nala  ")).toBe("Nala");
		expect(cleanEditedValue("   ")).toBeNull();
		expect(cleanEditedValue("")).toBeNull();
	});
});
```

```ts
// lib/shell/story.test.ts
import { describe, expect, it } from "vitest";
import { emptyBond, type Bond } from "../agent/bond/bond";
import { madeFromLines, shortDate, storyLines } from "./story";

const now = new Date(2026, 8, 30, 12).getTime();

describe("shortDate", () => {
	it("writes a short local date, adding the year only when it differs", () => {
		expect(shortDate(new Date(2026, 8, 24, 10).toISOString(), now)).toBe("24 Sep");
		expect(shortDate(new Date(2025, 0, 2, 10).toISOString(), now)).toBe("2 Jan 2025");
	});
});

describe("storyLines", () => {
	it("tells the milestones in order, as past-tense sentences", () => {
		const at = (d: number) => new Date(2026, 8, d, 10).toISOString();
		const bond: Bond = {
			...emptyBond(),
			milestones: [
				{ id: "friend", at: at(29) },
				{ id: "met", at: at(24) },
				{ id: "name", at: at(24) },
			],
		};
		expect(storyLines(bond, now)).toEqual([
			{ id: "met", date: "24 Sep", text: "We met" },
			{ id: "name", date: "24 Sep", text: "You told me your name" },
			{ id: "friend", date: "29 Sep", text: "I came to think of you as a friend" },
		]);
		expect(storyLines(emptyBond(), now)).toEqual([]);
	});
});

describe("madeFromLines", () => {
	it("names each donor in a sentence, or says he isn't assembled yet", () => {
		const names = { heart: "The Night-Shift Nurse", brain: "The Fair Judge", voice: "The Diplomat", humor: "The Tired Librarian", slang: "The Surfer", quirks: "The Astronomer" };
		expect(madeFromLines(names)).toEqual([
			"My heart comes from The Night-Shift Nurse.",
			"My judgement comes from The Fair Judge.",
			"My voice comes from The Diplomat.",
			"My humor comes from The Tired Librarian.",
			"My slang comes from The Surfer.",
			"My quirks come from The Astronomer.",
		]);
		expect(madeFromLines(null)).toEqual(["I haven't been assembled yet."]);
	});
});
```

```ts
// lib/shell/devices.test.ts
import { describe, expect, it } from "vitest";
import { deviceRow } from "./devices";

const now = new Date(2026, 8, 30, 15).getTime();
const at = (d: number, h = 10) => new Date(2026, 8, d, h).toISOString();

describe("deviceRow", () => {
	it("names a device and says when it was last used", () => {
		expect(deviceRow({ id: "a", friendly_name: "Work laptop", created_at: at(20), last_used_at: at(30, 9) }, now)).toEqual({ id: "a", name: "Work laptop", lastUsed: "Used today" });
		expect(deviceRow({ id: "b", friendly_name: "Phone", created_at: at(20), last_used_at: at(29) }, now).lastUsed).toBe("Used yesterday");
		expect(deviceRow({ id: "c", friendly_name: "Tablet", created_at: at(20), last_used_at: at(26) }, now).lastUsed).toBe("Used 4 days ago");
		expect(deviceRow({ id: "d", friendly_name: "Old", created_at: at(1), last_used_at: at(2) }, now).lastUsed).toBe("Used on 2 Sep");
	});

	it("still reads well with no name and no use", () => {
		expect(deviceRow({ id: "e", friendly_name: "  ", created_at: at(20) }, now)).toEqual({ id: "e", name: "Unnamed device", lastUsed: "Not used yet" });
	});
});
```

```ts
// lib/shell/unlock-errors.test.ts
import { describe, expect, it } from "vitest";
import { unlockMessage } from "./unlock-errors";

describe("unlockMessage", () => {
	it("explains a failed or cancelled passkey", () => {
		expect(unlockMessage({ name: "NotAllowedError" }, "passkey")).toBe("That didn't unlock. Try again, or use your email and password on this device.");
		expect(unlockMessage(new Error("anything"), "passkey")).toBe("That didn't unlock. Try again, or use your email and password on this device.");
	});

	it("explains a wrong email or password", () => {
		expect(unlockMessage({ status: 400, message: "Invalid login credentials" }, "password")).toBe("That email and password didn't match. Check them and try again.");
	});

	it("explains a network failure either way", () => {
		expect(unlockMessage(new TypeError("Failed to fetch"), "password")).toBe("Osmo can't be reached right now. Check your connection and try again.");
		expect(unlockMessage({ name: "AuthRetryableFetchError" }, "passkey")).toBe("Osmo can't be reached right now. Check your connection and try again.");
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/shell`
Expected: FAIL, the four modules cannot be resolved.

- [ ] **Step 3: Implement the four modules**

```ts
// lib/shell/memory-lines.ts
// What Osmo remembers, written as he would say it. The value is kept apart from the lead so it can be edited in place.
import type { MemoryFact } from "@/lib/facts";

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
	return { key: fact.key, group, lead, value: fact.value, sentence: `${lead} ${fact.value}.` };
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
```

```ts
// lib/shell/story.ts
// Insights wording: the bond's milestones as a short story, and the donors he is made from.
import type { Bond, MilestoneId } from "@/lib/agent/bond/bond";
import type { Personality } from "@/lib/agent/personality/assemble";

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

export function madeFromLines(names: Personality["names"]): string[] {
	if (!names) return ["I haven't been assembled yet."];
	return [
		`My heart comes from ${names.heart}.`,
		`My judgement comes from ${names.brain}.`,
		`My voice comes from ${names.voice}.`,
		`My humor comes from ${names.humor}.`,
		`My slang comes from ${names.slang}.`,
		`My quirks come from ${names.quirks}.`,
	];
}
```

Note on `storyLines` sorting: two milestones reached in the same turn have equal `at`; `Array.prototype.sort` is stable, so they keep the order they were reached in (`met` before `name`).

```ts
// lib/shell/devices.ts
// A saved passkey as a readable row: its name and when it was last used.
import { localDay } from "@/lib/agent/bond/bond";
import { shortDate } from "./story";

export type DeviceSource = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

function daysBetween(fromIso: string, now: number): number {
	const start = new Date(localDay(new Date(fromIso).getTime()) + "T12:00:00");
	const end = new Date(localDay(now) + "T12:00:00");
	return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function deviceRow(item: DeviceSource, now: number): { id: string; name: string; lastUsed: string } {
	const name = item.friendly_name?.trim() || "Unnamed device";
	if (!item.last_used_at) return { id: item.id, name, lastUsed: "Not used yet" };
	const days = daysBetween(item.last_used_at, now);
	const lastUsed =
		days <= 0 ? "Used today" : days === 1 ? "Used yesterday" : days < 7 ? `Used ${days} days ago` : `Used on ${shortDate(item.last_used_at, now)}`;
	return { id: item.id, name, lastUsed };
}
```

```ts
// lib/shell/unlock-errors.ts
// What went wrong while unlocking, and what to do next, in plain words.
const NETWORK = "Osmo can't be reached right now. Check your connection and try again.";

function isNetwork(error: unknown): boolean {
	if (error instanceof TypeError) return true;
	const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
	return name === "AuthRetryableFetchError";
}

export function unlockMessage(error: unknown, via: "passkey" | "password"): string {
	if (isNetwork(error)) return NETWORK;
	if (via === "password") return "That email and password didn't match. Check them and try again.";
	return "That didn't unlock. Try again, or use your email and password on this device.";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/shell`
Expected: PASS.

- [ ] **Step 5: Full suite, type check, commit**

Run: `npx vitest run` and `npx tsc --noEmit -p .`
Expected: all pass.

```bash
git add lib/shell/memory-lines.ts lib/shell/memory-lines.test.ts lib/shell/story.ts lib/shell/story.test.ts lib/shell/devices.ts lib/shell/devices.test.ts lib/shell/unlock-errors.ts lib/shell/unlock-errors.test.ts
git commit -F - <<'EOF'
feat: wording helpers for Osmo's lock screen and panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The lock screen (`/lock`)

**Files:**
- Create: `lib/shell/passkeys.ts`, `components/osmo/lock-screen.tsx`, `components/osmo/lock.module.css`, `app/lock/page.tsx`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`; `unlockMessage` from Task 2.
- Produces:
  - `passkeysSupported(): boolean`
  - `unlockWithPasskey(): Promise<unknown | null>` (returns the error or null)
  - `unlockWithPassword(email: string, password: string): Promise<unknown | null>`
  - `rememberThisDevice(): Promise<unknown | null>`
  - `listDevices(): Promise<{ devices: DeviceSource[]; error: unknown | null }>`
  - `renameDevice(id: string, name: string): Promise<unknown | null>`
  - `removeDevice(id: string): Promise<unknown | null>`
  - `lockOsmo(): Promise<void>`
  - `DEVICE_SAVE_FAILED = "This device couldn't save a passkey. You can try again from Settings."`
  - The page `/lock`.

- [ ] **Step 1: Implement `lib/shell/passkeys.ts`**

```ts
// lib/shell/passkeys.ts
// Every passkey call in one place, so a change to Supabase's passkey API is a small edit here.
import { supabase } from "@/lib/supabase";
import type { DeviceSource } from "./devices";

export const DEVICE_SAVE_FAILED = "This device couldn't save a passkey. You can try again from Settings.";

export function passkeysSupported(): boolean {
	return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

export async function unlockWithPasskey(): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.signInWithPasskey();
		return error;
	} catch (error) {
		return error;
	}
}

export async function unlockWithPassword(email: string, password: string): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.signInWithPassword({ email, password });
		return error;
	} catch (error) {
		return error;
	}
}

export async function rememberThisDevice(): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.registerPasskey();
		return error;
	} catch (error) {
		return error;
	}
}

export async function listDevices(): Promise<{ devices: DeviceSource[]; error: unknown | null }> {
	try {
		const { data, error } = await supabase.auth.passkey.list();
		return { devices: data ?? [], error };
	} catch (error) {
		return { devices: [], error };
	}
}

export async function renameDevice(id: string, name: string): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.passkey.update({ passkeyId: id, friendlyName: name.slice(0, 120) });
		return error;
	} catch (error) {
		return error;
	}
}

export async function removeDevice(id: string): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
		return error;
	} catch (error) {
		return error;
	}
}

export async function lockOsmo(): Promise<void> {
	await supabase.auth.signOut({ scope: "local" });
}
```

(`signOut({ scope: "local" })` signs out this device only; other unlocked devices stay unlocked.)

- [ ] **Step 2: Implement `components/osmo/lock.module.css`**

```css
/* Osmo's lock screen: only his circle, his name and one way in. */
.lock {
	--bone: #f3efe8;
	--aura-a: hsl(172 38% 50%);
	--base: hsl(172 30% 10%);
	min-height: 100svh;
	display: grid;
	place-items: center;
	padding: 2rem 1rem;
	color: var(--bone);
	background: radial-gradient(circle at 50% 42%, color-mix(in oklab, var(--aura-a) 26%, transparent), transparent 60%), var(--base);
}

.inner {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.1rem;
	width: min(22rem, 100%);
	text-align: center;
}

.circle {
	width: 7.5rem;
	aspect-ratio: 1;
	border-radius: 50%;
	border: 1px solid color-mix(in oklab, var(--aura-a) 60%, transparent);
	background: radial-gradient(closest-side, color-mix(in oklab, var(--aura-a) 14%, transparent), transparent 74%);
	animation: breathe 5.4s ease-in-out infinite;
}

.name {
	margin: 0;
	font-size: clamp(2.2rem, 8vw, 3rem);
	font-weight: 700;
	line-height: 1;
	letter-spacing: -0.035em;
}

.hint {
	margin: 0;
	font-size: 1rem;
	opacity: 0.72;
}

.primary {
	font: inherit;
	font-weight: 600;
	color: #0c111b;
	background: var(--bone);
	border: 0;
	border-radius: 999px;
	padding: 0.8rem 1.5rem;
	cursor: pointer;
}

.quiet {
	font: inherit;
	font-size: 0.9rem;
	color: inherit;
	opacity: 0.7;
	background: none;
	border: 0;
	text-decoration: underline;
	text-underline-offset: 0.2em;
	cursor: pointer;
}

.form {
	display: flex;
	flex-direction: column;
	gap: 0.7rem;
	width: 100%;
}

.field {
	font: inherit;
	color: var(--bone);
	background: color-mix(in oklab, #0c111b 70%, transparent);
	border: 1px solid color-mix(in oklab, var(--bone) 26%, transparent);
	border-radius: 999px;
	padding: 0.75rem 1.1rem;
}

.error {
	margin: 0;
	color: #f2b8a2;
	font-size: 0.95rem;
}

.primary:focus-visible,
.quiet:focus-visible,
.field:focus-visible {
	outline: 2px solid var(--aura-a);
	outline-offset: 3px;
}

.primary:disabled {
	opacity: 0.55;
	cursor: wait;
}

/* The one bold moment: the circle blooms outward and the room takes over. */
.opening .circle {
	animation: bloom 0.7s cubic-bezier(0.5, 0, 0.75, 0) forwards;
}
.opening .name,
.opening .hint,
.opening .primary,
.opening .quiet,
.opening .form {
	opacity: 0;
	transition: opacity 0.25s ease;
}

@keyframes breathe {
	0%,
	100% {
		scale: 1;
		opacity: 0.85;
	}
	50% {
		scale: 1.04;
		opacity: 1;
	}
}

@keyframes bloom {
	to {
		scale: 14;
		opacity: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.circle {
		animation: none;
	}
	.opening .circle {
		animation: none;
		opacity: 0;
		transition: opacity 0.2s ease;
	}
}
```

- [ ] **Step 3: Implement `components/osmo/lock-screen.tsx`**

```tsx
"use client";

import { Bricolage_Grotesque } from "next/font/google";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
	DEVICE_SAVE_FAILED,
	passkeysSupported,
	rememberThisDevice,
	unlockWithPasskey,
	unlockWithPassword,
} from "@/lib/shell/passkeys";
import { unlockMessage } from "@/lib/shell/unlock-errors";
import styles from "./lock.module.css";

const font = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });

type Step = "locked" | "password" | "remember" | "opening";

export function LockScreen() {
	const router = useRouter();
	const [step, setStep] = useState<Step>("locked");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [canPasskey, setCanPasskey] = useState(true);

	useEffect(() => {
		const supported = passkeysSupported();
		setCanPasskey(supported);
		if (!supported) setStep("password");
		// Already unlocked on this device: go straight in.
		supabase.auth.getSession().then(({ data }) => {
			if (data.session) router.replace("/");
		});
	}, [router]);

	function open() {
		setStep("opening");
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		window.setTimeout(() => router.replace("/"), reduce ? 200 : 700);
	}

	async function withPasskey() {
		setBusy(true);
		setError(null);
		const failed = await unlockWithPasskey();
		setBusy(false);
		if (failed) setError(unlockMessage(failed, "passkey"));
		else open();
	}

	async function withPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		const failed = await unlockWithPassword(email.trim(), password);
		setBusy(false);
		if (failed) {
			setError(unlockMessage(failed, "password"));
			return;
		}
		setPassword("");
		if (canPasskey) setStep("remember");
		else open();
	}

	async function remember() {
		setBusy(true);
		setError(null);
		const failed = await rememberThisDevice();
		setBusy(false);
		if (failed) setError(DEVICE_SAVE_FAILED);
		else open();
	}

	return (
		<main className={`${styles.lock} ${font.className} ${step === "opening" ? styles.opening : ""}`}>
			<div className={styles.inner}>
				<div className={styles.circle} aria-hidden="true" />
				<h1 className={styles.name}>Osmo</h1>

				{step === "locked" && (
					<>
						<button type="button" className={styles.primary} onClick={withPasskey} disabled={busy}>
							Unlock with fingerprint or face
						</button>
						<button type="button" className={styles.quiet} onClick={() => { setError(null); setStep("password"); }}>
							This device doesn&apos;t have my passkey
						</button>
					</>
				)}

				{step === "password" && (
					<form className={styles.form} onSubmit={withPassword}>
						<p className={styles.hint}>This device doesn&apos;t know you yet.</p>
						<input className={styles.field} type="email" autoComplete="email" placeholder="Email" aria-label="Email"
							value={email} onChange={(e) => setEmail(e.target.value)} required />
						<input className={styles.field} type="password" autoComplete="current-password" placeholder="Password" aria-label="Password"
							value={password} onChange={(e) => setPassword(e.target.value)} required />
						<button type="submit" className={styles.primary} disabled={busy}>Unlock</button>
						{canPasskey && (
							<button type="button" className={styles.quiet} onClick={() => { setError(null); setStep("locked"); }}>
								Use fingerprint or face instead
							</button>
						)}
					</form>
				)}

				{step === "remember" && (
					<>
						<p className={styles.hint}>Remember this device? Next time you can unlock with your fingerprint or face.</p>
						{error ? (
							<button type="button" className={styles.primary} onClick={open}>Continue</button>
						) : (
							<button type="button" className={styles.primary} onClick={remember} disabled={busy}>Remember</button>
						)}
						{!error && (
							<button type="button" className={styles.quiet} onClick={open}>Not now</button>
						)}
					</>
				)}

				{error && (
					<p className={styles.error} role="alert">{error}</p>
				)}
			</div>
		</main>
	);
}
```

- [ ] **Step 4: Implement `app/lock/page.tsx`**

```tsx
import { LockScreen } from "@/components/osmo/lock-screen";

export default function Page() {
	return <LockScreen />;
}
```

- [ ] **Step 5: Check it in the browser (read-only)**

Open `http://localhost:3000/lock` in the preview. If the browser has a session, it redirects to `/` (expected). To see the lock screen itself, open a new private tab only if the tooling offers one; otherwise confirm by reading the page source with `read_page` right after navigation, or skip the visual check and note it for Gur's checklist.
- Check: no console errors, and the text "Unlock with fingerprint or face" is present when signed out.
- Do not press any button.

- [ ] **Step 6: Type check, lint, full suite, commit**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run`
Expected: pass, and lint shows 0 errors.

```bash
git add lib/shell/passkeys.ts components/osmo/lock-screen.tsx components/osmo/lock.module.css app/lock/page.tsx
git commit -F - <<'EOF'
feat: passkey lock screen at /lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Routes, layout and removing the template

**Files:**
- Modify: `next.config.ts`, `app/layout.tsx` (full rewrite), `app/page.tsx` (full rewrite), `app/assistant.module.css` (`.stage` height), `app/assistant.tsx` (one line: the lock redirect)
- Delete: `app/assistant/page.tsx`, `app/login/page.tsx`, `app/login.tsx`, `app/about.tsx`, `components/login-form.tsx`, `components/auth-link.tsx`

**Interfaces:**
- Consumes: the `/lock` page from Task 3.
- Produces: `/` renders the room; `/assistant` redirects to `/`; `/login` redirects to `/lock`; the room redirects to `/lock` without a session.

- [ ] **Step 1: The controller messages the language session** (the implementer skips this and says so)

"Editing app/assistant.tsx now: one line in the load effect, `router.replace("/login")` becomes `router.replace("/lock")`. Nothing else in that file."

- [ ] **Step 2: Redirects in `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// The room lives at "/" and the lock at "/lock"; old addresses still work.
	async redirects() {
		return [
			{ source: "/assistant", destination: "/", permanent: false },
			{ source: "/login", destination: "/lock", permanent: false },
		];
	},
};

export default nextConfig;
```

- [ ] **Step 3: Rewrite `app/layout.tsx`** (server component, no navigation bar)

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Osmo",
	description: "Gur's companion.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
```

- [ ] **Step 4: Rewrite `app/page.tsx`** so `/` is the room

```tsx
export { default } from "./assistant";
```

- [ ] **Step 5: Delete the template pages and old auth UI**

```bash
git rm app/assistant/page.tsx app/login/page.tsx app/login.tsx app/about.tsx components/login-form.tsx components/auth-link.tsx
```

Then run `npx tsc --noEmit -p .`. If anything still imports `login-form` or `auth-link`, stop and report NEEDS_CONTEXT.

- [ ] **Step 6: The room fills the viewport and redirects to the lock**

In `app/assistant.module.css`, in the `.stage` rule, change `height: calc(100svh - 2.25rem);` to `height: 100svh;`. Search the file for any other `2.25rem` tied to the old nav bar (`grep -n "2.25rem" app/assistant.module.css`) and change each the same way.

In `app/assistant.tsx`, inside the load effect, change exactly:

```tsx
					router.replace("/login");
```

to:

```tsx
					router.replace("/lock");
```

- [ ] **Step 7: Check in the browser (read-only)**

- `http://localhost:3000/assistant` ends at `/` (or at `/lock` without a session).
- `http://localhost:3000/login` ends at `/lock` (or at `/` with a session).
- `/` shows the room filling the whole window, with no navigation bar above it.
- No console errors.

- [ ] **Step 8: Type check, lint, full suite, commit**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run`
Expected: all pass.

```bash
git add next.config.ts app/layout.tsx app/page.tsx app/assistant.module.css app/assistant.tsx
git commit -F - <<'EOF'
feat: Osmo is the whole app; room at /, lock at /lock, template removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

(The `git rm` from Step 5 is already staged and is included in this commit.)

- [ ] **Step 9: The controller tells the language session the edit is in.**

---

### Task 5: Panel frame, header links and the Settings panel

**Files:**
- Create: `components/osmo/panel.tsx`, `components/osmo/panels.module.css`, `components/osmo/settings-panel.tsx`
- Modify: `app/assistant.tsx` (imports, one hook call, header links, `data-panel` on the stage, the panel mount), `app/assistant.module.css` (room dims and steps aside while a panel is open)

**Interfaces:**
- Consumes: Task 2 `deviceRow`; Task 3 `listDevices`, `renameDevice`, `removeDevice`, `rememberThisDevice`, `lockOsmo`, `DEVICE_SAVE_FAILED`, `passkeysSupported`.
- Produces:
  - `type PanelId = "memory" | "insights" | "settings"`
  - `usePanels(): { panel: PanelId | null; toggle: (id: PanelId) => void; close: () => void; linkRef: (id: PanelId) => (el: HTMLButtonElement | null) => void }`
  - `PanelLinks({ panel, toggle, linkRef })`
  - `Panel({ id, onClose, children })`
  - `SettingsPanel()`
  - CSS module classes `section`, `sectionTitle`, `line`, `lineText`, `actions`, `action`, `input`, `note`, `error`, `empty`, used by Tasks 6 and 7.

- [ ] **Step 1: The controller messages the language session** (the implementer skips this)

"Editing app/assistant.tsx now for the panels:
- imports,
- one `usePanels()` call next to the other hooks,
- `data-panel` on the stage div,
- three links inside the header,
- a panel mount after `</main>`.

Tasks 6 and 7 will add the Memory panel (it gets `memory` and a callback that calls `setMemory`) and the Insights panel (it gets `agent`). Not touching sendMessage."

- [ ] **Step 2: Implement `components/osmo/panels.module.css`**

```css
/* Panels are the inside of Osmo's mind: tinted by his mood, plain lines of text, no cards. */
.links {
	margin-left: auto;
	display: flex;
	gap: 1.1rem;
	align-self: flex-start;
	padding-top: 0.4rem;
}

.link {
	font: inherit;
	font-size: 0.95rem;
	color: var(--bone);
	opacity: 0.7;
	background: none;
	border: 0;
	padding: 0.2rem 0;
	cursor: pointer;
	border-bottom: 1px solid transparent;
}
.link:hover {
	opacity: 1;
}
.link[aria-expanded="true"] {
	opacity: 1;
	border-bottom-color: var(--aura-a);
}

.panel {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 5;
	width: min(28rem, 50vw);
	overflow-y: auto;
	padding: 1.6rem 1.75rem 2rem;
	color: var(--bone);
	background: color-mix(in oklab, color-mix(in oklab, var(--aura-a) 16%, var(--base)) 92%, transparent);
	backdrop-filter: blur(10px);
	animation: slide-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.top {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.title {
	margin: 0;
	font-size: clamp(1.9rem, 4vw, 2.5rem);
	font-weight: 700;
	line-height: 1;
	letter-spacing: -0.035em;
	outline: none;
}

.close {
	font: inherit;
	font-size: 0.9rem;
	color: var(--bone);
	opacity: 0.7;
	background: none;
	border: 0;
	cursor: pointer;
	padding: 0.3rem 0;
}

.section {
	margin-top: 2rem;
}

.sectionTitle {
	margin: 0 0 0.4rem;
	font-size: 0.95rem;
	font-weight: 600;
	opacity: 0.72;
}

.line {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.5rem 0;
	font-size: 1rem;
	line-height: 1.5;
}

.lineText {
	font: inherit;
	color: inherit;
	text-align: left;
	background: none;
	border: 0;
	padding: 0;
	cursor: text;
}

.actions {
	display: flex;
	gap: 0.8rem;
	flex: none;
}

.action {
	font: inherit;
	font-size: 0.85rem;
	color: var(--bone);
	opacity: 0.6;
	background: none;
	border: 0;
	padding: 0;
	cursor: pointer;
}
.action:hover {
	opacity: 1;
}

.input {
	font: inherit;
	color: var(--bone);
	background: color-mix(in oklab, #0c111b 55%, transparent);
	border: 1px solid color-mix(in oklab, var(--bone) 28%, transparent);
	border-radius: 0.6rem;
	padding: 0.3rem 0.6rem;
	min-width: 0;
	flex: 1;
}

.note {
	margin: 0.3rem 0 0;
	font-size: 0.8rem;
	opacity: 0.6;
	font-variant-numeric: tabular-nums;
}

.error {
	margin: 0.6rem 0 0;
	color: #f2b8a2;
	font-size: 0.95rem;
}

.empty {
	margin: 1.5rem 0 0;
	font-size: 1rem;
	line-height: 1.5;
	opacity: 0.85;
	max-width: 32ch;
}

.link:focus-visible,
.close:focus-visible,
.lineText:focus-visible,
.action:focus-visible,
.input:focus-visible {
	outline: 2px solid var(--aura-a);
	outline-offset: 3px;
}

@keyframes slide-in {
	from {
		translate: 2rem 0;
		opacity: 0;
	}
	to {
		translate: 0 0;
		opacity: 1;
	}
}

@media (max-width: 40rem) {
	.panel {
		width: 100%;
	}
	.links {
		gap: 0.8rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.panel {
		animation: fade-in 0.15s ease both;
	}
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
}
```

- [ ] **Step 3: Implement `components/osmo/panel.tsx`**

```tsx
"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import styles from "./panels.module.css";

export type PanelId = "memory" | "insights" | "settings";

export const PANEL_TITLES: Record<PanelId, string> = {
	memory: "What I remember",
	insights: "How I've been",
	settings: "Settings",
};

const LINK_LABELS: Record<PanelId, string> = { memory: "Memory", insights: "Insights", settings: "Settings" };
const ORDER: PanelId[] = ["memory", "insights", "settings"];

// One panel at a time; closing returns focus to the link that opened it.
export function usePanels() {
	const [panel, setPanel] = useState<PanelId | null>(null);
	const links = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({});

	const close = useCallback(() => {
		setPanel((current) => {
			if (current) requestAnimationFrame(() => links.current[current]?.focus());
			return null;
		});
	}, []);
	const toggle = useCallback((id: PanelId) => {
		setPanel((current) => {
			if (current === id) {
				requestAnimationFrame(() => links.current[id]?.focus());
				return null;
			}
			return id;
		});
	}, []);
	const linkRef = useCallback((id: PanelId) => (el: HTMLButtonElement | null) => {
		links.current[id] = el;
	}, []);

	return { panel, toggle, close, linkRef };
}

export function PanelLinks({ panel, toggle, linkRef }: Pick<ReturnType<typeof usePanels>, "panel" | "toggle" | "linkRef">) {
	return (
		<nav className={styles.links} aria-label="Osmo">
			{ORDER.map((id) => (
				<button
					key={id}
					ref={linkRef(id)}
					type="button"
					className={styles.link}
					aria-expanded={panel === id}
					aria-controls="osmo-panel"
					onClick={() => toggle(id)}
				>
					{LINK_LABELS[id]}
				</button>
			))}
		</nav>
	);
}

export function Panel({ id, onClose, children }: { id: PanelId; onClose: () => void; children: ReactNode }) {
	const titleRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		titleRef.current?.focus();
	}, [id]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<aside id="osmo-panel" className={styles.panel} aria-labelledby="osmo-panel-title">
			<div className={styles.top}>
				<h2 id="osmo-panel-title" ref={titleRef} tabIndex={-1} className={styles.title}>
					{PANEL_TITLES[id]}
				</h2>
				<button type="button" className={styles.close} onClick={onClose}>
					Close
				</button>
			</div>
			{children}
		</aside>
	);
}
```

- [ ] **Step 4: Implement `components/osmo/settings-panel.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deviceRow } from "@/lib/shell/devices";
import {
	DEVICE_SAVE_FAILED,
	listDevices,
	lockOsmo,
	passkeysSupported,
	rememberThisDevice,
	removeDevice,
	renameDevice,
} from "@/lib/shell/passkeys";
import type { DeviceSource } from "@/lib/shell/devices";
import styles from "./panels.module.css";

const UNREACHABLE = "I can't reach my memory right now. Try again in a moment.";
const SAVE_FAILED = "Couldn't save that. Try again.";

export function SettingsPanel() {
	const router = useRouter();
	const [devices, setDevices] = useState<DeviceSource[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);

	async function refresh() {
		const { devices: list, error: failed } = await listDevices();
		if (failed) setError(UNREACHABLE);
		setDevices(list);
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function saveName() {
		if (!editing) return;
		const name = editing.name.trim();
		setEditing(null);
		if (!name) return;
		const failed = await renameDevice(editing.id, name);
		setError(failed ? SAVE_FAILED : null);
		await refresh();
	}

	async function remove(id: string) {
		setConfirming(null);
		const failed = await removeDevice(id);
		setError(failed ? SAVE_FAILED : null);
		await refresh();
	}

	async function addThisDevice() {
		const failed = await rememberThisDevice();
		setError(failed ? DEVICE_SAVE_FAILED : null);
		await refresh();
	}

	async function lock() {
		await lockOsmo();
		router.replace("/lock");
	}

	const now = Date.now();

	return (
		<>
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Devices</h3>
				{devices === null && <p className={styles.note}>Checking your devices…</p>}
				{devices?.length === 0 && !error && (
					<p className={styles.empty}>No device remembers you yet. Remember this one to unlock with your fingerprint or face.</p>
				)}
				{devices?.map((device) => {
					const row = deviceRow(device, now);
					return (
						<div key={row.id} className={styles.line}>
							<div>
								{editing?.id === row.id ? (
									<input
										className={styles.input}
										aria-label="Device name"
										value={editing.name}
										autoFocus
										onChange={(e) => setEditing({ id: row.id, name: e.target.value })}
										onKeyDown={(e) => {
											if (e.key === "Enter") void saveName();
											if (e.key === "Escape") {
												e.stopPropagation();
												setEditing(null);
											}
										}}
										onBlur={() => void saveName()}
									/>
								) : (
									<button type="button" className={styles.lineText} onClick={() => setEditing({ id: row.id, name: row.name })}>
										{row.name}
									</button>
								)}
								<p className={styles.note}>{row.lastUsed}</p>
							</div>
							<div className={styles.actions}>
								{confirming === row.id ? (
									<>
										<button type="button" className={styles.action} onClick={() => void remove(row.id)}>
											Remove {row.name}
										</button>
										<button type="button" className={styles.action} onClick={() => setConfirming(null)}>
											Keep
										</button>
									</>
								) : (
									<button type="button" className={styles.action} onClick={() => setConfirming(row.id)}>
										Remove
									</button>
								)}
							</div>
						</div>
					);
				})}
				{confirming && <p className={styles.note}>That device will need your email and password next time.</p>}
				{passkeysSupported() && (
					<button type="button" className={styles.action} onClick={() => void addThisDevice()}>
						Remember this device
					</button>
				)}
				{error && <p className={styles.error} role="alert">{error}</p>}
			</section>

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Lock Osmo</h3>
				<p className={styles.note}>Signs this device out. You&apos;ll unlock again with your fingerprint or face.</p>
				<button type="button" className={styles.action} onClick={() => void lock()}>
					Lock Osmo
				</button>
			</section>
		</>
	);
}
```

(The spec asked for "Removing the passkey of the current device asks first". A browser cannot tell which saved passkey belongs to the current device, so every removal asks first, with the note above.)

- [ ] **Step 5: Mount the panels in the room (`app/assistant.tsx`)**

Add imports next to the other `@/` imports:

```tsx
import { Panel, PanelLinks, usePanels } from "@/components/osmo/panel";
import { SettingsPanel } from "@/components/osmo/settings-panel";
```

Directly after `const router = useRouter();`, add:

```tsx
	const panels = usePanels();
```

On the stage `<div ref={stageRef} ...>`, add the attribute after `data-speaking={...}`:

```tsx
			data-panel={panels.panel ?? undefined}
```

Inside `<header className={styles.head}>`, after the closing `</div>` of the name and mood block, add:

```tsx
					<PanelLinks panel={panels.panel} toggle={panels.toggle} linkRef={panels.linkRef} />
```

After `</main>` and before the stage's closing `</div>`, add:

```tsx
			{panels.panel && (
				<Panel id={panels.panel} onClose={panels.close}>
					{panels.panel === "settings" && <SettingsPanel />}
				</Panel>
			)}
```

- [ ] **Step 6: The room steps aside while a panel is open (`app/assistant.module.css`)**

Add at the end of the file, before the reduced-motion block:

```css
/* A panel is open: Osmo dims and steps aside, and the conversation stays usable beside it. */
.aura,
.column {
	transition:
		opacity 0.32s ease,
		translate 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.stage[data-panel] .aura {
	opacity: 0.55;
	translate: -6% 0;
}
.stage[data-panel] .column {
	translate: calc(min(28rem, 50vw) / -2) 0;
}
@media (max-width: 40rem) {
	.stage[data-panel] .column {
		translate: 0 0;
	}
}
```

Inside the existing `@media (prefers-reduced-motion: reduce)` block, add:

```css
	.aura,
	.column {
		transition: none;
	}
```

- [ ] **Step 7: Check in the browser (read-only)**

With the room at `/` (session present in the preview):
- The header shows "Memory Insights Settings" at the top right.
- Clicking "Settings" opens a panel titled "Settings". Focus is on the title.
- The device list either shows rows or the empty message.
- Escape closes the panel and focus returns to the "Settings" link.
- At 375px wide (`resize_window` preset `mobile`), the panel covers the full width. Reset with preset `desktop` after.
- With `prefers-reduced-motion`, there is no slide (check the computed `animation-name` is `fade-in`).
- No console errors.
- Do NOT click Remove, Remember this device, Lock Osmo, or a device name.

- [ ] **Step 8: Type check, lint, full suite, commit, then the controller tells the language session**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run`

```bash
git add components/osmo/panel.tsx components/osmo/panels.module.css components/osmo/settings-panel.tsx app/assistant.tsx app/assistant.module.css
git commit -F - <<'EOF'
feat: room panels with header links and the Settings panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The Memory panel

**Files:**
- Create: `components/osmo/memory-panel.tsx`
- Modify: `app/assistant.tsx` (one import and one line in the panel mount)

**Interfaces:**
- Consumes:
  - Task 2 `groupMemory`, `GROUP_TITLES`, `cleanEditedValue`, `type MemoryLine`,
  - Task 5 panel styles,
  - `type MemoryFact` from `lib/facts.ts`,
  - `supabase` from `lib/supabase.ts`.
- Produces: `MemoryPanel({ memory, onChange }: { memory: MemoryFact[]; onChange: (next: MemoryFact[]) => void })`

- [ ] **Step 1: The controller messages the language session** (the implementer skips this)

"Adding the Memory panel mount in app/assistant.tsx: `<MemoryPanel memory={memory} onChange={setMemory} />`. The panel writes to memory_facts itself (update by key, delete by key) and hands the new list to setMemory, so sendMessage sees edits on the next message."

- [ ] **Step 2: Implement `components/osmo/memory-panel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MemoryFact } from "@/lib/facts";
import { cleanEditedValue, GROUP_TITLES, groupMemory, type MemoryGroup, type MemoryLine } from "@/lib/shell/memory-lines";
import styles from "./panels.module.css";

const SAVE_FAILED = "Couldn't save that. Try again.";
const GROUPS: MemoryGroup[] = ["about", "words", "explained"];

export function MemoryPanel({ memory, onChange }: { memory: MemoryFact[]; onChange: (next: MemoryFact[]) => void }) {
	const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const groups = groupMemory(memory);
	const empty = memory.length === 0;

	async function save() {
		if (!editing) return;
		const value = cleanEditedValue(editing.value);
		const key = editing.key;
		setEditing(null);
		const before = memory;
		if (value === null || before.find((f) => f.key === key)?.value === value) return;
		onChange(before.map((f) => (f.key === key ? { ...f, value } : f)));
		const { error: failed } = await supabase
			.from("memory_facts")
			.update({ value, updated_at: new Date().toISOString() })
			.eq("key", key);
		if (failed) {
			onChange(before);
			setError(SAVE_FAILED);
		} else setError(null);
	}

	async function forget(key: string) {
		setConfirming(null);
		const before = memory;
		onChange(before.filter((f) => f.key !== key));
		const { error: failed } = await supabase.from("memory_facts").delete().eq("key", key);
		if (failed) {
			onChange(before);
			setError(SAVE_FAILED);
		} else setError(null);
	}

	function line(item: MemoryLine) {
		if (editing?.key === item.key) {
			return (
				<div key={item.key} className={styles.line}>
					<span>{item.lead}</span>
					<input
						className={styles.input}
						aria-label={item.lead}
						value={editing.value}
						autoFocus
						onChange={(e) => setEditing({ key: item.key, value: e.target.value })}
						onKeyDown={(e) => {
							if (e.key === "Enter") void save();
							if (e.key === "Escape") {
								e.stopPropagation();
								setEditing(null);
							}
						}}
						onBlur={() => void save()}
					/>
				</div>
			);
		}
		return (
			<div key={item.key} className={styles.line}>
				<button type="button" className={styles.lineText} onClick={() => setEditing({ key: item.key, value: item.value })}>
					{item.sentence}
				</button>
				<div className={styles.actions}>
					{confirming === item.key ? (
						<>
							<button type="button" className={styles.action} onClick={() => void forget(item.key)}>Forget this</button>
							<button type="button" className={styles.action} onClick={() => setConfirming(null)}>Keep</button>
						</>
					) : (
						<button type="button" className={styles.action} aria-label={`Forget: ${item.sentence}`} onClick={() => setConfirming(item.key)}>
							×
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<>
			{empty && <p className={styles.empty}>I don&apos;t know much about you yet. Tell me something, like your favorite food.</p>}
			{GROUPS.filter((g) => groups[g].length > 0).map((g) => (
				<section key={g} className={styles.section}>
					<h3 className={styles.sectionTitle}>{GROUP_TITLES[g]}</h3>
					{groups[g].map(line)}
				</section>
			))}
			{error && <p className={styles.error} role="alert">{error}</p>}
		</>
	);
}
```

- [ ] **Step 3: Mount it (`app/assistant.tsx`)**

Add the import next to the other `@/components/osmo/*` imports:

```tsx
import { MemoryPanel } from "@/components/osmo/memory-panel";
```

Inside the `<Panel ...>` from Task 5, add above the settings line:

```tsx
					{panels.panel === "memory" && <MemoryPanel memory={memory} onChange={setMemory} />}
```

- [ ] **Step 4: Check in the browser (read-only)**

- "Memory" opens "What I remember" with the "About you" / "Words you taught me" / "Things you explained" sections that have entries, or the empty message.
- Lines read as first-person sentences.
- No console errors.
- Do NOT click a line, the ×, or "Forget this": they change Gur's real memory.

- [ ] **Step 5: Type check, lint, full suite, commit, then the controller tells the language session**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run`

```bash
git add components/osmo/memory-panel.tsx app/assistant.tsx
git commit -F - <<'EOF'
feat: Memory panel to read, edit and forget what Osmo remembers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: The Insights panel

**Files:**
- Create: `components/osmo/insights-panel.tsx`, `components/osmo/insights.module.css`
- Modify: `app/assistant.tsx` (one import and one line in the panel mount)

**Interfaces:**
- Consumes:
  - Task 1 `weekSeries`, `sanitizeMoodDay`, `strongestPhrase`, `dayName`, `type MoodDay`,
  - Task 2 `storyLines`, `madeFromLines`,
  - `localDay` from `lib/agent/bond/bond.ts`,
  - `spokenDate(iso, now)` from `lib/agent/bond/lines.ts`,
  - `resolve(genome)` from `lib/agent/personality/assemble.ts`,
  - `type AgentState` from `lib/agent/state.ts`,
  - Task 5 panel styles.
- Produces: `InsightsPanel({ agent }: { agent: AgentState })`

- [ ] **Step 1: The controller messages the language session** (the implementer skips this)

"Adding the Insights panel mount in app/assistant.tsx: `<InsightsPanel agent={agent} />`. Read-only."

- [ ] **Step 2: Implement `components/osmo/insights.module.css`**

```css
.chart {
	display: block;
	width: 100%;
	height: 5.5rem;
	margin: 0.4rem 0 0.2rem;
	overflow: visible;
}

.days {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 0.2rem;
}

.day {
	font: inherit;
	font-size: 0.8rem;
	color: var(--bone);
	opacity: 0.6;
	background: none;
	border: 0;
	padding: 0.3rem 0;
	cursor: pointer;
	font-variant-numeric: tabular-nums;
}
.day[aria-pressed="true"] {
	opacity: 1;
	text-decoration: underline;
	text-decoration-color: var(--aura-a);
	text-underline-offset: 0.3em;
}
.day:focus-visible {
	outline: 2px solid var(--aura-a);
	outline-offset: 2px;
}

.story {
	list-style: none;
	margin: 0.4rem 0 0;
	padding: 0 0 0 0.9rem;
	border-left: 1px solid color-mix(in oklab, var(--aura-a) 55%, transparent);
}

.moment {
	padding: 0.35rem 0;
	line-height: 1.45;
}

.when {
	display: block;
	font-size: 0.8rem;
	opacity: 0.6;
	font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Implement `components/osmo/insights-panel.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { localDay } from "@/lib/agent/bond/bond";
import { spokenDate } from "@/lib/agent/bond/lines";
import { dayName, sanitizeMoodDay, strongestPhrase, weekSeries, type MoodDay } from "@/lib/agent/mood-days";
import { resolve } from "@/lib/agent/personality/assemble";
import type { AgentState } from "@/lib/agent/state";
import { madeFromLines, storyLines } from "@/lib/shell/story";
import panel from "./panels.module.css";
import styles from "./insights.module.css";

const UNREACHABLE = "I can't reach my memory right now. Try again in a moment.";

export function InsightsPanel({ agent }: { agent: AgentState }) {
	const [rows, setRows] = useState<MoodDay[] | null>(null);
	const [firstDay, setFirstDay] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const now = Date.now();
	const today = localDay(now);

	useEffect(() => {
		(async () => {
			const since = weekSeries([], localDay(Date.now()))[0].day;
			const [week, first] = await Promise.all([
				supabase.from("mood_days").select("day,valence,strongest,tally,samples").gte("day", since).order("day"),
				supabase.from("mood_days").select("day").order("day").limit(1).maybeSingle(),
			]);
			if (week.error || first.error) {
				setError(UNREACHABLE);
				setRows([]);
				return;
			}
			setRows((week.data ?? []).map(sanitizeMoodDay).filter((r): r is MoodDay => r !== null));
			setFirstDay(typeof first.data?.day === "string" ? first.data.day : null);
		})();
	}, []);

	const series = weekSeries(rows ?? [], today);
	const width = 280;
	const height = 80;
	const x = (i: number) => (i / 6) * width;
	const y = (v: number) => ((1 - v) / 2) * height;
	// Days without data break the line instead of dropping to zero.
	const segments: string[] = [];
	let current: string[] = [];
	series.forEach((d, i) => {
		if (d.valence === null) {
			if (current.length) segments.push(current.join(" "));
			current = [];
		} else current.push(`${x(i).toFixed(1)},${y(d.valence).toFixed(1)}`);
	});
	if (current.length) segments.push(current.join(" "));

	const chosen = series.find((d) => d.day === selected);
	const started =
		rows === null || error
			? null
			: firstDay === null
				? "I'll start keeping track of how I feel from today."
				: firstDay > series[0].day
					? `I started keeping track on ${spokenDate(`${firstDay}T12:00:00`, now)}.`
					: null;
	const story = storyLines(agent.bond, now);

	return (
		<>
			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>My mood, the last 7 days</h3>
				<svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
					aria-label="How positive I felt each day this week">
					<line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="2 4" />
					{segments.map((points) => (
						<polyline key={points} points={points} fill="none" stroke="var(--aura-a)" strokeWidth="2"
							strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
					))}
					{series.map((d, i) =>
						d.valence === null ? null : <circle key={d.day} cx={x(i)} cy={y(d.valence)} r="2.5" fill="var(--aura-b)" />,
					)}
				</svg>
				<div className={styles.days}>
					{series.map((d) => (
						<button key={d.day} type="button" className={styles.day} aria-pressed={selected === d.day}
							onClick={() => setSelected(selected === d.day ? null : d.day)}>
							{dayName(d.day).slice(0, 3)}
						</button>
					))}
				</div>
				{chosen && (
					<p className={panel.note} role="status">
						{chosen.strongest
							? `${dayName(chosen.day)}: ${strongestPhrase(chosen.strongest)}.`
							: `${dayName(chosen.day)}: we didn't talk.`}
					</p>
				)}
				{started && <p className={panel.note}>{started}</p>}
				{error && <p className={panel.error} role="alert">{error}</p>}
			</section>

			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>Our story</h3>
				{story.length === 0 ? (
					<p className={panel.note}>Our story starts with your first message.</p>
				) : (
					<ol className={styles.story}>
						{story.map((m) => (
							<li key={m.id} className={styles.moment}>
								<span className={styles.when}>{m.date}</span>
								{m.text}
							</li>
						))}
					</ol>
				)}
			</section>

			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>What I&apos;m made from</h3>
				{madeFromLines(resolve(agent.genome).names).map((text) => (
					<p key={text} className={panel.line}>{text}</p>
				))}
			</section>
		</>
	);
}
```

- [ ] **Step 4: Mount it (`app/assistant.tsx`)**

Add the import:

```tsx
import { InsightsPanel } from "@/components/osmo/insights-panel";
```

Inside the `<Panel ...>`, add between the memory and settings lines:

```tsx
					{panels.panel === "insights" && <InsightsPanel agent={agent} />}
```

- [ ] **Step 5: Check in the browser (read-only)**

- "Insights" opens "How I've been" with:
  - the chart (possibly one point, or the "I'll start keeping track…" line),
  - 7 day buttons, where tapping one shows "<Day>: mostly <feeling>." or "<Day>: we didn't talk.",
  - "Our story" with dated lines,
  - "What I'm made from" with six sentences.
- No console errors.
- Tapping a day button is allowed (read-only).

- [ ] **Step 6: Type check, lint, full suite, commit, then the controller tells the language session**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run`

```bash
git add components/osmo/insights-panel.tsx components/osmo/insights.module.css app/assistant.tsx
git commit -F - <<'EOF'
feat: Insights panel with mood week, our story and donors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Deploy guide, Supabase checklist and Gur's hand checks

**Files:**
- Create: `docs/osmo-deploy.md`

**Interfaces:** none.

- [ ] **Step 1: Write `docs/osmo-deploy.md`**

````markdown
# Putting Osmo online

Osmo runs on Vercel from the private GitHub repository `mistif/osmo`. Every push to `main` redeploys him.

## 1. Deploy on Vercel
1. Sign in to vercel.com with GitHub, choose **Add New → Project**, and import `mistif/osmo`.
2. Framework: Next.js (detected). Leave the build settings as they are.
3. Environment variables (Production and Preview), copied from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Do not add `NEXT_PUBLIC_OSMO_DEMO`.
4. Deploy. Note the address, for example `osmo-gur.vercel.app`.

## 2. Supabase settings (dashboard → Authentication)
1. **Sign In / Providers:** turn off "Allow new users to sign up".
2. **Passkeys:** turn them on. Set the relying party ID to your Vercel domain (`osmo-gur.vercel.app`, with no `https://`) and the allowed origin to `https://osmo-gur.vercel.app`.
3. **URL Configuration:** set the Site URL to `https://osmo-gur.vercel.app`.

## 3. Check it yourself (about two minutes)
1. Open the Vercel address. You land on the lock screen.
2. Choose "This device doesn't have my passkey", then sign in with your email and password.
3. When Osmo asks "Remember this device?", choose **Remember** and confirm with Windows Hello, Face ID or your fingerprint.
4. You are in his room. Open **Settings**: your device is listed. Rename it (for example "Home PC").
5. Choose **Lock Osmo**. On the lock screen, choose **Unlock with fingerprint or face**. You are back in without a password.
6. On your phone, open the same address. If your passkeys sync (iCloud Keychain or Google Password Manager), the fingerprint or face button works right away. If not, repeat steps 2 and 3 there.
7. Open **Memory**, change one small thing and change it back. Open **Insights** and tap today.

## Local development
Passkeys belong to one address, so passkeys saved on the Vercel site don't work on `localhost`. On your own computer, use "This device doesn't have my passkey" and your email and password.
````

- [ ] **Step 2: Full verification**

Run: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`
Expected: all pass, and the build succeeds.

- [ ] **Step 3: Final browser pass (read-only)**

- `/assistant` and `/login` redirect.
- `/` shows the room at full height.
- All three panels open and close with Escape.
- Phone width works.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add docs/osmo-deploy.md
git commit -F - <<'EOF'
docs: how to put Osmo online and check the lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Report to Gur**

Summarize what changed and what was checked. Give him the three Supabase settings and the hand checklist. Ask whether to push `main` to GitHub, which is what triggers Vercel.
