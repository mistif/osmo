# Osmo shell v2, phase A: the rail, panels, Settings pages, Library and Feed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `NEXT_PUBLIC_OSMO_SHELL2=on`, replace the three header links with a rail (phone: bottom bar) of Talk, Library, Feed, Settings, hash navigation, Settings in five pages, and Library and Feed over existing tables. Unset = today's shell exactly.

**Architecture:** Pure modules in `lib/shell/` (route, rail, library, feed, link-card, settings-lines) carry all logic and all tests (vitest runs `lib/**/*.test.ts` in node only; components are checked by hand). New components sit beside the old ones; old `panel.tsx`, `memory-panel.tsx`, `insights-panel.tsx` stay untouched until Gur says the old links can go. Panel state is the page hash, read with `useSyncExternalStore`, never a route.

**Tech Stack:** Next.js 16.3.6 (App Router; `history.pushState`/`replaceState` sync with the router, per `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`; `NEXT_PUBLIC_*` is inlined at build, so it must be read as the literal `process.env.NEXT_PUBLIC_OSMO_SHELL2`), React 19, CSS modules, vitest 5, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-10-08-osmo-shell-v2-design.md` (sections 2.1, 3, 4, 5, 8, 9, 13, 15). Read it and `AGENTS.md` first.

## Global Constraints
- Lanes: everything here is main's. `app/assistant.tsx` is shared: edit only the room markup, panels, header and mic (listed in Task 12 as A1 to A9). Never touch `sendText`, `sendTextRef`, `onReplyRef`, `deliver`, `turnView`. Put `app/assistant.tsx` under Now on `brain/desks/main.md` before editing and under Just landed after; push the desk with `git -C brain push origin brain`.
- Stage by path, never `git add -A` or `git add .`. Keep every commit green: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`. No new dependency. No migration. Do not push `main` (Gur's OK, main agent only).
- Register: first person, no exclamation marks, no emoji, full forms ("cannot"), sentence case. One verb per act: Open, Forget, Keep, Back, Close, Show more, Save. "Forget" replaces "Delete".
- Motion: `cubic-bezier(0.2, 0.8, 0.2, 1)`, each rail motion plays once in 400 to 700 ms on hover, `:focus-visible` or active; only Talk is always alive. Rail resting icons Bone at 62%; active stroke `color-mix(in oklab, var(--aura-a) 85%, white)` plus a 6px glow; dot is Echo (`--aura-b`), 0.4rem, no numbers. Focus: 2px `--aura-a`, offset 3px.
- Rail 4.25rem wide on desktop; phone (`max-width: 40rem`) a fixed bar 3.5rem plus the safe area, full-width panels sit above it. The rail is a child of the stage so it inherits `--aura-a`, `--aura-b`, `--base`, `--pulse`, `--voice`, `--r1`.
- Phase A shows exactly Talk, Library, Feed, Settings (`SHIPPED`). Ideas, Goals, Search icons exist in code and the dev page but are not shown.
- Reduced motion: no animation, only a 120 ms colour/opacity change; hover shows the final state; panel slide stays the existing 0.15 s fade.
- Old Memory and Insights panels are not removed here (spec 13 gates removal on Gur's word).

## Review Focus (each has a test in the task named)
1. `localStorage` missing or throwing: no dot, no crash, no throw on first run (Task 2).
2. Malformed hashes (`#library/%E0%A4%A`, `#search/apple`, `#settings/nope`, `#memory/x`): never throw, never put a search word in a route (Task 1).
3. Odd addresses in Osmo's lines (`javascript:`, bare `http://`, trailing punctuation, the same address twice, a guest's line, Gur's own line): only real http(s) addresses from Osmo's own lines become Links (Task 3).
4. A reminder or action near midnight lands on the right day; a bad `profile.timezone` falls back instead of throwing (Task 4).
5. A Forget that deletes zero rows (policy mismatch) must restore the row and show "I could not save that. Try again." (Task 6 `forgetRow`, hand check in Task 14). Also: in-panel Back on a deep link must not leave the app (Task 1 `parentRoute`, Task 8).

## Verified before planning (reading and read-only SQL on the live project `agent-memory`)
- `panel.tsx`: `usePanels` has `panel/toggle/close/open/linkRef`, three ids; `Panel` focuses its `h2` on id change and closes on `Escape` unless `defaultPrevented`; panel is `z-index: 5`, 28rem or 50vw, 0.32 s slide; full width under 40rem. The voice calls `openSettings: () => panels.open("settings")` (assistant.tsx line 274).
- Header heart: `.heart` in `assistant.module.css` (1.1rem, `border-radius: var(--r1, ...)`, `transform: scale(calc(1 + var(--voice) * 0.9))`, `animation: idle-heart var(--pulse)`, none while `[data-speaking]` and under reduced motion). `--r1`, `--voice` are written on the stage by `useHeartMotion`; `--aura-a/-b/--base/--pulse` from `theme` in assistant.tsx; `--bone`, `--ink` on `.stage`. Existing `--avail`/`--fit` rule is in `@media (min-width: 40.01rem)`.
- `settings-panel.tsx` order: Devices (state: devices, editing, confirming, adding, errors), `VoiceSettings`, `ConnectorsSettings` (329 lines: "What I may do", "My place", "Notifications on this device", sharing one profile row and `save`), `RemindersNotes`, AI line, Lock Osmo, About (version).
- Readers to reuse (inline in components today): memory `memory_facts select key,value` (assistant.tsx:168, held in `memory` state, edits via `setMemory`); `mood_days` week and first-day (insights-panel); `actions` last 30 (`sanitizeActionRow`); `notes`/`reminders` (`sanitizeNote`, `sanitizeReminder`); `artifacts select id,title,version,parent_id,created_at` + `latestOfChains` + `source` on Open (things-made); `messages select role,text,speaker` (assistant.tsx:169).
- **Grants (live, `information_schema.role_table_grants` and `pg_policies`):** `messages` and `mood_days` give `authenticated` DELETE (and all else) under policies "own messages" and "own mood_days" (cmd ALL). So Library Links Forget removes the chat line (Gur's answer 3A) and Feed mood rows have Forget. `actions`, `notes`, `reminders`, `artifacts` give DELETE and SELECT only. `messages` columns: id (bigint), user_id, role (`user`/`agent`), text, created_at, speaker (null = Gur), surface. `mood_days` key is (user_id, day). The repo migrations do not define either grant (the tables predate them; `connectors-phase-0.sql` only adds `messages.surface`) and `agent-state.ts` only selects/upserts `mood_days`, so the live check is the only evidence; re-run it in Task 14.
- Reminders statuses are `pending|sent|cancelled|missed`; `actions.summary` is code-written text.
- Contrast (computed with the oklab mix, bases `hsl(H 30% L%)` with L 7 to 15 from `moodTheme`): resting icons (Bone 62% on Rail ground) are 5.6:1 or better on every tone, so spec 17.1 passes; Task 14 pins it in a test.
- Voice: `useVoice` exposes no guest state (spec 12, Unverified 9), so phase A cannot hide dots for a guest; posted as an Ask, not built.

## Spec statements the checks contradicted or left open
1. Spec 4.1 says `panel.tsx` gains six ids. That would change today's shell, which must stay exact, so the plan adds `shell-panel.tsx` and `use-shell.ts` and leaves `panel.tsx` alone.
2. Spec 9 says reuse `describeAction`'s wording "shortened". Its real output starts with weekday, date and surface ("Thursday 8 October, 09:00, in the room: done. ..."), so it cannot sit under a day heading; Task 4 adds `actionLine` using the same status words.
3. Spec 8 sorts Memory by `updated_at`, but the existing reader selects only `key,value`; Library fetches `key,updated_at` once and joins by key (session-learned facts fall back to the open time).
4. Spec 13 phase A lists "old Memory and Insights panels removed" and also says removal waits for Gur's word: the plan keeps them.
5. Spec 3.1: "z-index 6 (above the panel's 5 is not needed)" is self-contradictory; the plan uses 6 (it never overlaps the panel).
6. Spec 3.4 asks for `head` count queries; the plan reads the newest stamp of three tables instead (`select col order desc limit 1`), which also needs no count.
7. Spec 15 lists goal-event tests under `feed.ts`: `goal_events` does not exist before phase B, so `buildFeed` in A has no goal source.
8. A Forget on a Link deletes the chat line in the database; the room's in-memory log still shows it until reload.

## File structure
Create: `lib/shell/{flag,route,rail,link-card,library,feed,settings-lines,data,contrast}.ts` + tests (not `flag`, `data`); `components/osmo/{rail.tsx,rail.module.css,use-shell.ts,use-rail-dots.ts,shell-panel.tsx,shell.module.css,shell-panels.tsx,settings-pages.tsx,devices-lock.tsx,library-panel.tsx,library-memory.tsx,feed-panel.tsx,feed.module.css}`, `app/dev/rail/{page.tsx,dev.module.css}`.
Modify: `components/osmo/settings-panel.tsx` (extract blocks, same output), `connectors-settings.tsx` (`parts`, export `CONNECTORS`), `app/assistant.tsx` (A1 to A9), `app/assistant.module.css` (shell variables), `app/layout.tsx` (viewport-fit).

---
### Task 1: Routes (`lib/shell/flag.ts`, `route.ts`)
**Files:** Create `lib/shell/flag.ts`, `lib/shell/route.ts`, `lib/shell/route.test.ts`.
**Produces:** `SHELL2`; `PanelId`, `Route`, `TALK`, `SHIPPED_PANELS`, `SETTINGS_PAGES`, `LIBRARY_FILTERS`, `parseRoute(hash, shipped?)`, `routeHash(route)`, `parentRoute(route)`, `navKind(from, to): "push" | "replace"`.

- [ ] **Step 1: test** `lib/shell/route.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { navKind, parentRoute, parseRoute, routeHash, TALK, type Route } from "./route";

const ALL = ["ideas", "goals", "library", "feed", "search", "settings"] as const;
const ROUTES: Route[] = [
	{ panel: "library" }, { panel: "library", page: "notes" }, { panel: "library", page: "memory", item: "slang:wassup" },
	{ panel: "library", page: "things", item: "3f2a" }, { panel: "feed" }, { panel: "settings" }, { panel: "settings", page: "voice" },
	{ panel: "settings", page: "may-do" }, { panel: "ideas", item: "a-b" }, { panel: "goals" }, { panel: "search" },
];
describe("routes", () => {
	it("round-trips every valid route", () => {
		for (const r of ROUTES) expect(parseRoute(routeHash(r), ALL)).toEqual(r);
		expect(routeHash(TALK)).toBe("");
	});
	it("maps the old hashes", () => {
		expect(parseRoute("#memory")).toEqual({ panel: "library", page: "memory" });
		expect(parseRoute("#insights")).toEqual({ panel: "feed" });
	});
	it("reads unknown, empty and unshipped hashes as Talk", () => {
		for (const h of ["", "#", "#nope", "#ideas", "#goals/x", "#search"]) expect(parseRoute(h)).toEqual(TALK);
	});
	it("never throws on bad escapes and never keeps a search word", () => {
		expect(parseRoute("#library/memory/%E0%A4%A")).toEqual({ panel: "library", page: "memory" });
		expect(parseRoute("#search/apple", ALL)).toEqual({ panel: "search" });
		expect(parseRoute("#settings/nope")).toEqual({ panel: "settings" });
		expect(parseRoute("#library/memory/" + "x".repeat(200))).toEqual({ panel: "library", page: "memory" });
	});
	it("goes up one level and leaves the app never", () => {
		expect(parentRoute({ panel: "settings", page: "voice" })).toEqual({ panel: "settings" });
		expect(parentRoute({ panel: "library", page: "notes", item: "i" })).toEqual({ panel: "library", page: "notes" });
		expect(parentRoute({ panel: "feed" })).toEqual(TALK);
	});
	it("pushes from Talk and into a page or row, replaces between rail items and filters", () => {
		expect(navKind(TALK, { panel: "library" })).toBe("push");
		expect(navKind({ panel: "library" }, { panel: "feed" })).toBe("replace");
		expect(navKind({ panel: "library" }, TALK)).toBe("replace");
		expect(navKind({ panel: "settings" }, { panel: "settings", page: "voice" })).toBe("push");
		expect(navKind({ panel: "library" }, { panel: "library", page: "notes" })).toBe("replace");
		expect(navKind({ panel: "library", page: "notes" }, { panel: "library", page: "notes", item: "i" })).toBe("push");
	});
});
```
- [ ] **Step 2: implement** `lib/shell/flag.ts`: `export const SHELL2 = process.env.NEXT_PUBLIC_OSMO_SHELL2 === "on";`. `lib/shell/route.ts`:
```ts
export type PanelId = "ideas" | "goals" | "library" | "feed" | "search" | "settings";
export type Route = { panel: PanelId | null; page?: string; item?: string };
export const TALK: Route = { panel: null };
export const SHIPPED_PANELS: readonly PanelId[] = ["library", "feed", "settings"];
export const SETTINGS_PAGES = ["devices", "voice", "may-do", "place", "about"] as const;
export const LIBRARY_FILTERS = ["memory", "notes", "things", "links"] as const;
const ALL: readonly PanelId[] = ["ideas", "goals", "library", "feed", "search", "settings"];
const PAGES: Partial<Record<PanelId, readonly string[]>> = { library: LIBRARY_FILTERS, settings: SETTINGS_PAGES };
const ITEM_ONLY: readonly PanelId[] = ["ideas", "goals"];

function decode(s: string | undefined): string | null {
	if (!s) return null;
	try {
		const v = decodeURIComponent(s);
		return v && v.length <= 120 ? v : null;
	} catch {
		return null;
	}
}

export function parseRoute(hash: string, shipped: readonly PanelId[] = SHIPPED_PANELS): Route {
	const parts = hash.replace(/^#/, "").split("/");
	let name = parts[0];
	let rest = parts.slice(1);
	if (name === "memory") [name, rest] = ["library", ["memory"]];
	else if (name === "insights") [name, rest] = ["feed", []];
	const panel = ALL.find((p) => p === name);
	if (!panel || !shipped.includes(panel)) return TALK;
	if (ITEM_ONLY.includes(panel)) {
		const item = decode(rest[0]);
		return item ? { panel, item } : { panel };
	}
	const page = PAGES[panel]?.find((p) => p === rest[0]);
	if (!page) return { panel };
	const item = panel === "library" ? decode(rest[1]) : null;
	return item ? { panel, page, item } : { panel, page };
}

export function routeHash(r: Route): string {
	if (!r.panel) return "";
	const segs: string[] = [r.panel];
	if (r.page) segs.push(r.page);
	if (r.item && (r.page || ITEM_ONLY.includes(r.panel))) segs.push(encodeURIComponent(r.item));
	return `#${segs.join("/")}`;
}

export function parentRoute(r: Route): Route {
	if (r.panel && r.item) return r.page ? { panel: r.panel, page: r.page } : { panel: r.panel };
	if (r.panel === "settings" && r.page) return { panel: "settings" };
	return TALK;
}

// Talk to a place and into a page or row push one entry; rail to rail and filter changes replace it.
export function navKind(from: Route, to: Route): "push" | "replace" {
	if (from.panel === null) return "push";
	if (from.panel !== to.panel) return "replace";
	if (to.item !== from.item) return "push";
	if (from.panel === "settings" && !from.page && to.page) return "push";
	return "replace";
}
```
- [ ] **Step 3:** `npx vitest run lib/shell/route.test.ts` passes (it fails first if you run before Step 2). Commit: `git add lib/shell/flag.ts lib/shell/route.ts lib/shell/route.test.ts && git commit -m "feat(shell): hash routes for the v2 shell, behind NEXT_PUBLIC_OSMO_SHELL2"`.

---
### Task 2: Rail items, dots, seen store (`lib/shell/rail.ts`)
**Consumes:** Task 1. **Produces:** `RailId`, `RailItem`, `SHIPPED`, `railItems(route, dots, shipped?)`, `hasNew(seen, latest)`, `createSeenStore(storage, now)`.

- [ ] **Step 1: test** `lib/shell/rail.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { createSeenStore, hasNew, railItems } from "./rail";

const ALL = ["talk", "ideas", "goals", "library", "feed", "search", "settings"] as const;
describe("railItems", () => {
	it("shows only shipped items, in order, Talk active with no panel", () => {
		const items = railItems({ panel: null }, {});
		expect(items.map((i) => i.id)).toEqual(["talk", "library", "feed", "settings"]);
		expect(items.filter((i) => i.active).map((i) => i.id)).toEqual(["talk"]);
		expect(railItems({ panel: null }, {}, ALL).map((i) => i.id)).toEqual([...ALL]);
	});
	it("marks the open panel active, also on a page of it", () => {
		expect(railItems({ panel: "settings", page: "voice" }, {}).filter((i) => i.active).map((i) => i.id)).toEqual(["settings"]);
	});
	it("allows a dot on Library and Goals only, and never on the active item", () => {
		const dots = { library: true, goals: true, feed: true, talk: true };
		const items = railItems({ panel: null }, dots, ALL);
		expect(items.filter((i) => i.dot).map((i) => i.id)).toEqual(["goals", "library"]);
		expect(railItems({ panel: "library" }, dots).find((i) => i.id === "library")?.dot).toBe(false);
		expect(items.find((i) => i.id === "library")?.sr).toBe(", something new");
	});
});
describe("dots", () => {
	const mem = () => {
		const m = new Map<string, string>();
		return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
	};
	it("is false with nothing seen, nothing latest, or nothing newer", () => {
		expect(hasNew(null, "2026-10-08T10:00:00Z")).toBe(false);
		expect(hasNew("2026-10-08T10:00:00Z", null)).toBe(false);
		expect(hasNew("2026-10-08T10:00:00Z", "2026-10-08T10:00:00Z")).toBe(false);
		expect(hasNew("2026-10-08T10:00:00Z", "2026-10-08T10:00:01+00:00")).toBe(true);
		expect(hasNew("junk", "2026-10-08T10:00:01Z")).toBe(false);
	});
	it("takes the first read as the baseline, then keeps what was marked", () => {
		let t = "2026-10-01T00:00:00Z";
		const s = createSeenStore(mem(), () => t);
		expect(s.get("library")).toBe(t);
		t = "2026-10-05T00:00:00Z";
		s.mark("library");
		expect(s.get("library")).toBe(t);
	});
	it("survives missing or throwing storage", () => {
		const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
		for (const storage of [null, boom]) {
			const s = createSeenStore(storage, () => "2026-10-01T00:00:00Z");
			expect(s.get("library")).toBeNull();
			expect(() => s.mark("library")).not.toThrow();
		}
	});
});
```
- [ ] **Step 2: implement** `lib/shell/rail.ts`
```ts
import { SHIPPED_PANELS, type PanelId, type Route } from "./route";

export type RailId = "talk" | PanelId;
export type RailItem = { id: RailId; label: string; href: string; active: boolean; dot: boolean; sr: string };
const ORDER: { id: RailId; label: string }[] = [
	{ id: "talk", label: "Talk" }, { id: "ideas", label: "Ideas" }, { id: "goals", label: "Goals" }, { id: "library", label: "Library" },
	{ id: "feed", label: "Feed" }, { id: "search", label: "Search" }, { id: "settings", label: "Settings" },
];
export const SHIPPED: readonly RailId[] = ["talk", ...SHIPPED_PANELS];
const DOTTED: readonly RailId[] = ["library", "goals"];

export function railItems(route: Route, dots: Partial<Record<RailId, boolean>>, shipped: readonly RailId[] = SHIPPED): RailItem[] {
	return ORDER.filter((o) => shipped.includes(o.id)).map(({ id, label }) => {
		const active = (route.panel ?? "talk") === id;
		const dot = !active && DOTTED.includes(id) && dots[id] === true;
		return { id, label, href: `#${id}`, active, dot, sr: dot ? ", something new" : "" };
	});
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
export function hasNew(seen: string | null, latest: string | null): boolean {
	const a = time(seen), b = time(latest);
	return Number.isFinite(a) && Number.isFinite(b) && b > a;
}

// "Last seen" is a per-device convenience: any storage failure means no dot, never an error.
export type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export function createSeenStore(storage: KeyValue | null, now: () => string) {
	const key = (id: string) => `osmo-seen-${id}`;
	return {
		get(id: string): string | null {
			if (!storage) return null;
			try {
				const saved = storage.getItem(key(id));
				if (saved) return saved;
				const baseline = now(); // a first visit starts quiet
				storage.setItem(key(id), baseline);
				return baseline;
			} catch {
				return null;
			}
		},
		mark(id: string): void {
			try {
				storage?.setItem(key(id), now());
			} catch {
				/* best-effort */
			}
		},
	};
}
```
- [ ] **Step 3:** run `npx vitest run lib/shell/rail.test.ts`; commit `git add lib/shell/rail.ts lib/shell/rail.test.ts && git commit -m "feat(shell): rail items, dots and the last-seen store"`.

---
### Task 3: Links and Library (`link-card.ts`, `library.ts`)
**Consumes:** `MemoryFact` (`lib/facts`), `ThingRow`/`latestOfChains` (`lib/artifacts/things`). **Produces:** `linkTitle(text, index, host)`; `ts`, `LibraryFilter`, `LinkItem`, `LibraryRow`, `LibraryInput`, `extractLinks(lines)`, `mergeLibrary(input, filter, limit?)`.

- [ ] **Step 1: tests** `lib/shell/library.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { extractLinks, mergeLibrary, type LibraryInput } from "./library";
import { linkTitle } from "./link-card";

const input: LibraryInput = {
	memory: [{ fact: { key: "name", value: "Gur" }, at: "2026-10-02T10:00:00Z" }],
	notes: [{ id: "n1", text: "call Dad", created_at: "2026-10-07T10:00:00Z" }],
	things: [
		{ id: "t1", title: "Tip", version: 1, parent_id: null, created_at: "2026-10-05T10:00:00Z" },
		{ id: "t2", title: "Tip", version: 2, parent_id: "t1", created_at: "2026-10-06T10:00:00Z" },
	],
	links: [{ id: "9-0", messageId: 9, url: "https://a.dev/", host: "a.dev", title: "a.dev", at: "2026-10-08T10:00:00Z" }],
};
describe("mergeLibrary", () => {
	it("sorts newest first across kinds and keeps the latest of each thing chain", () => {
		expect(mergeLibrary(input, "everything").rows.map((r) => r.id)).toEqual(["9-0", "n1", "t2", "name"]);
	});
	it("filters by kind and limits, saying when there is more", () => {
		expect(mergeLibrary(input, "notes").rows.map((r) => r.kind)).toEqual(["note"]);
		const m = mergeLibrary(input, "everything", 2);
		expect(m.rows).toHaveLength(2);
		expect(m.more).toBe(true);
	});
	it("compares real instants, not strings", () => {
		const two = { ...input, links: [], things: [], notes: [{ id: "a", text: "x", created_at: "2026-10-08T10:00:00.5+00:00" }, { id: "b", text: "y", created_at: "2026-10-08T10:00:00Z" }] };
		expect(mergeLibrary(two, "notes").rows[0].id).toBe("a");
	});
});
describe("extractLinks", () => {
	const line = (id: number, text: string, extra = {}) => ({ id, role: "agent", text, created_at: `2026-10-0${id}T10:00:00Z`, ...extra });
	it("takes http and https addresses from Osmo's own lines only", () => {
		const out = extractLinks([
			line(1, "The Next.js docs: https://nextjs.org/docs."), line(2, "see javascript:alert(1) and ftp://x.org and http:// nothing"),
			line(3, "mine", { role: "user" }), line(4, "to a guest https://g.dev", { speaker: "guest" }), line(5, "again https://nextjs.org/docs"),
		]);
		expect(out.map((l) => l.url)).toEqual(["https://nextjs.org/docs"]);
		expect(out[0]).toMatchObject({ messageId: 5, host: "nextjs.org" });
	});
	it("strips trailing punctuation and shows a lookalike host as written", () => {
		const out = extractLinks([line(1, "Look (https://www.example.com/a?b=1), then https://xn--pple-43d.com!")]);
		expect(out.map((l) => l.url)).toEqual(["https://www.example.com/a?b=1", "https://xn--pple-43d.com/"]);
		expect(out[1].host).toBe("xn--pple-43d.com");
	});
});
describe("linkTitle", () => {
	it("uses the words before a colon, else the host without www", () => {
		const t = "Sure. The Next.js docs: https://nextjs.org/docs";
		expect(linkTitle(t, t.indexOf("https"), "nextjs.org")).toBe("The Next.js docs");
		expect(linkTitle("Here https://www.a.dev/x", 5, "www.a.dev")).toBe("a.dev");
		const long = `${"w".repeat(80)}: https://a.dev`;
		expect(linkTitle(long, long.indexOf("https"), "a.dev")).toHaveLength(60);
	});
});
```
- [ ] **Step 2: implement** `lib/shell/link-card.ts` (phase D reuses it)
```ts
// The card title for an address in a line (spec 2.6): the words before "Name: <address>", else the host.
export function linkTitle(text: string, index: number, host: string): string {
	const fallback = host.replace(/^www\./, "");
	const before = text.slice(0, index).trimEnd();
	if (!before.endsWith(":")) return fallback;
	const fragment = before.slice(0, -1).split(/[.!?]\s+|\n/).pop()?.trim() ?? "";
	return fragment ? Array.from(fragment).slice(0, 60).join("") : fallback;
}
```
`lib/shell/library.ts`:
```ts
import type { MemoryFact } from "../facts";
import { latestOfChains, type ThingRow } from "../artifacts/things";
import { linkTitle } from "./link-card";

export const ts = (iso: string): number => (Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : 0);
export type LibraryFilter = "everything" | "memory" | "notes" | "things" | "links";
export type LinkItem = { id: string; messageId: number; url: string; host: string; title: string; at: string };
export type LibraryRow =
	| { kind: "memory"; id: string; at: string; fact: MemoryFact }
	| { kind: "note"; id: string; at: string; text: string }
	| { kind: "thing"; id: string; at: string; title: string; version: number }
	| { kind: "link"; id: string; at: string; link: LinkItem };
export type LibraryInput = {
	memory: { fact: MemoryFact; at: string }[];
	notes: { id: string; text: string; created_at: string }[];
	things: ThingRow[];
	links: LinkItem[];
};
const PER_SOURCE = 100;
const URL_RE = /https?:\/\/[^\s<>"]+/gi;

export function mergeLibrary(input: LibraryInput, filter: LibraryFilter, limit = 40): { rows: LibraryRow[]; more: boolean } {
	const want = (k: Exclude<LibraryFilter, "everything">) => filter === "everything" || filter === k;
	const all: LibraryRow[] = [];
	if (want("memory")) for (const m of input.memory.slice(0, PER_SOURCE)) all.push({ kind: "memory", id: m.fact.key, at: m.at, fact: m.fact });
	if (want("notes")) for (const n of input.notes.slice(0, PER_SOURCE)) all.push({ kind: "note", id: n.id, at: n.created_at, text: n.text });
	if (want("things")) for (const t of latestOfChains(input.things).slice(0, PER_SOURCE)) all.push({ kind: "thing", id: t.id, at: t.created_at, title: t.title, version: t.version });
	if (want("links")) for (const l of input.links.slice(0, PER_SOURCE)) all.push({ kind: "link", id: l.id, at: l.at, link: l });
	all.sort((a, b) => ts(b.at) - ts(a.at));
	return { rows: all.slice(0, limit), more: all.length > limit };
}

type Line = { id: number; role: string; text: string; created_at: string; speaker?: string | null };
// Osmo's own lines only (a guest's lines and Gur's are skipped); http and https only; newest first; each address once.
export function extractLinks(lines: Line[]): LinkItem[] {
	const seen = new Set<string>();
	const out: LinkItem[] = [];
	for (const m of [...lines].sort((a, b) => ts(b.created_at) - ts(a.created_at))) {
		if (m.role !== "agent" || m.speaker === "guest") continue;
		let n = 0;
		for (const hit of m.text.matchAll(URL_RE)) {
			let u: URL;
			try {
				u = new URL(hit[0].replace(/[.,;:!?)\]'"]+$/, ""));
			} catch {
				continue;
			}
			if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || seen.has(u.href)) continue;
			seen.add(u.href);
			out.push({ id: `${m.id}-${n++}`, messageId: m.id, url: u.href, host: u.hostname, title: linkTitle(m.text, hit.index ?? 0, u.hostname), at: m.created_at });
		}
	}
	return out;
}
```
- [ ] **Step 3:** run `npx vitest run lib/shell/library.test.ts`; fix; commit `git add lib/shell/link-card.ts lib/shell/library.ts lib/shell/library.test.ts && git commit -m "feat(shell): Library union and link extraction, pure and tested"`.

---
### Task 4: Feed (`lib/shell/feed.ts`)
**Consumes:** `ActionRow` (`what-i-did`), `strongestPhrase` (`agent/mood-days`), `ThingRow`, `ts`. **Produces:** `resolveZone`, `dayKey`, `actionLine`, `buildFeed(input, opts)`, types `ForgetTarget`, `FeedRow`, `FeedDay`, `Feed`.

- [ ] **Step 1: test** `lib/shell/feed.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { actionLine, buildFeed, dayKey, resolveZone } from "./feed";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const empty = { actions: [], reminders: [], moods: [], things: [] };
describe("zones and days", () => {
	it("falls back from a bad zone and cuts the day in the zone", () => {
		expect(resolveZone("Nowhere/Land", "Europe/Stockholm")).toBe("Europe/Stockholm");
		expect(resolveZone(null, "also/bad")).toBe("UTC");
		expect(dayKey("2026-10-07T22:30:00Z", "Europe/Stockholm")).toBe("2026-10-08");
		expect(dayKey("2026-10-07T22:30:00Z", "UTC")).toBe("2026-10-07");
	});
});
describe("buildFeed", () => {
	const input = {
		...empty,
		actions: [{ id: 4, at: "2026-10-08T07:00:00Z", surface: "room", status: "done", summary: "Reminder set for 09:00: call Dad" }],
		reminders: [
			{ id: "r1", text: "call Dad", due_at: "2026-10-08T07:00:00Z", sent_at: "2026-10-08T07:00:03Z", status: "sent" as const },
			{ id: "r2", text: "pay rent", due_at: "2026-10-07T21:30:00Z", sent_at: null, status: "missed" as const },
			{ id: "r3", text: "later", due_at: "2026-10-09T08:00:00Z", sent_at: null, status: "pending" as const },
			{ id: "r4", text: "earlier", due_at: "2026-10-08T15:00:00Z", sent_at: null, status: "pending" as const },
		],
		moods: [{ day: "2026-10-07", strongest: "hope" }],
		things: [{ id: "t1", title: "Tip splitter", version: 1, parent_id: null, created_at: "2026-10-06T09:00:00Z" }],
	};
	const feed = buildFeed(input, { zone: "Europe/Stockholm", now: NOW });
	it("puts pending reminders in Coming up, soonest first", () => {
		expect(feed.comingUp.map((r) => r.id)).toEqual(["r4", "r3"]);
	});
	it("groups by day in the zone, newest first, with plain headings", () => {
		expect(feed.days.map((d) => d.heading)).toEqual(["Today", "Yesterday", "Tuesday 6 October"]);
		expect(feed.days[0].rows.map((r) => r.text)).toEqual(["A reminder went off at 09:00: call Dad.", "Done. Reminder set for 09:00: call Dad."]); // sent_at is 3 s after the action
		// 21:30 UTC on the 7th is 23:30 on the 7th in Stockholm; a missed reminder keeps its own day
		expect(feed.days[1].rows.map((r) => r.text)).toEqual(["Mostly hopeful.", "I missed a reminder at 23:30: pay rent."]);
	});
	it("says which source's delete applies", () => {
		const targets = feed.days.flatMap((d) => d.rows.map((r) => r.forget));
		expect(targets).toContainEqual({ table: "actions", key: 4 });
		expect(targets).toContainEqual({ table: "reminders", key: "r1" });
		expect(targets).toContainEqual({ table: "mood_days", key: "2026-10-07" });
		expect(targets).toContainEqual({ table: "artifacts", key: "t1", warn: "This also deletes the thing I built." });
	});
	it("shows 30 rows and says there is more", () => {
		const many = { ...empty, actions: Array.from({ length: 45 }, (_, i) => ({ id: i + 1, at: "2026-10-08T07:00:00Z", surface: "room", status: "done", summary: `x${i}` })) };
		const f = buildFeed(many, { zone: "UTC", now: NOW, limit: 30 });
		expect(f.days.flatMap((d) => d.rows)).toHaveLength(30);
		expect(f.more).toBe(true);
	});
	it("has no exclamation marks in any sentence", () => {
		expect(actionLine({ id: 1, at: "", surface: "room", status: "failed", summary: "" })).toBe("I could not do it.");
	});
});
```
- [ ] **Step 2: implement** `lib/shell/feed.ts`
```ts
import { strongestPhrase } from "../agent/mood-days";
import type { ThingRow } from "../artifacts/things";
import { ts } from "./library";
import type { ActionRow } from "./what-i-did";

export type ReminderFeedRow = { id: string; text: string; due_at: string; sent_at: string | null; status: "pending" | "sent" | "missed" };
export type MoodFeedRow = { day: string; strongest: string };
export type ForgetTarget = { table: "actions" | "reminders" | "mood_days" | "artifacts"; key: string | number; warn?: string };
export type FeedRow = { key: string; day: string; at: string; text: string; source: "action" | "reminder" | "mood" | "build"; forget: ForgetTarget; thingId?: string };
export type FeedDay = { day: string; heading: string; rows: FeedRow[] };
export type Feed = { comingUp: { id: string; text: string; due: string; forget: ForgetTarget }[]; days: FeedDay[]; more: boolean };
export type FeedInput = { actions: ActionRow[]; reminders: ReminderFeedRow[]; moods: MoodFeedRow[]; things: ThingRow[] };

const valid = (z: string | null) => {
	if (!z) return false;
	try {
		new Intl.DateTimeFormat("en-GB", { timeZone: z });
		return true;
	} catch {
		return false;
	}
};
// The saved profile zone, else the browser's, else UTC; a bad name never throws.
export const resolveZone = (profile: string | null, browser: string): string => (valid(profile) ? profile! : valid(browser) ? browser : "UTC");
export const dayKey = (iso: string, zone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const clock = (iso: string, zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const full = (t: string) => (/[.?]$/.test(t) ? t : `${t}.`);

function heading(day: string, today: string): string {
	if (day === today) return "Today";
	const y = new Date(`${today}T12:00:00Z`);
	y.setUTCDate(y.getUTCDate() - 1);
	if (day === y.toISOString().slice(0, 10)) return "Yesterday";
	const p = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(`${day}T12:00:00Z`));
	const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
	return `${g("weekday")} ${g("day")} ${g("month")}${g("year") === today.slice(0, 4) ? "" : ` ${g("year")}`}`;
}

const HEAD: Record<string, string> = { done: "Done.", failed: "I could not do it.", refused: "Not allowed.", waiting: "Waiting for your yes.", cancelled: "Cancelled.", expired: "Expired." };
// describeAction's status words without its weekday and surface, since the day heading says when.
export function actionLine(r: ActionRow): string {
	const s = r.summary.trim();
	return [HEAD[r.status] ?? "", s && full(s)].filter(Boolean).join(" ");
}

export function buildFeed(input: FeedInput, opts: { zone: string; now: number; limit?: number }): Feed {
	const { zone, now, limit = 30 } = opts;
	const today = dayKey(new Date(now).toISOString(), zone);
	const rows: FeedRow[] = [];
	for (const a of input.actions) {
		if (a.at) rows.push({ key: `a${a.id}`, day: dayKey(a.at, zone), at: a.at, text: actionLine(a), source: "action", forget: { table: "actions", key: a.id } });
	}
	for (const r of input.reminders) {
		if (r.status === "pending") continue;
		const at = r.sent_at ?? r.due_at;
		const text = r.status === "sent" ? `A reminder went off at ${clock(r.due_at, zone)}: ${full(r.text)}` : `I missed a reminder at ${clock(r.due_at, zone)}: ${full(r.text)}`;
		rows.push({ key: `r${r.id}`, day: dayKey(at, zone), at, text, source: "reminder", forget: { table: "reminders", key: r.id } });
	}
	for (const m of input.moods) rows.push({ key: `m${m.day}`, day: m.day, at: `${m.day}T23:59:59.999Z`, text: full(strongestPhrase(m.strongest).replace(/^./, (c) => c.toUpperCase())), source: "mood", forget: { table: "mood_days", key: m.day } });
	for (const t of input.things) {
		rows.push({ key: `t${t.id}`, day: dayKey(t.created_at, zone), at: t.created_at, text: t.version > 1 ? `I changed ${t.title} to version ${t.version}.` : `I built ${t.title}.`, source: "build", thingId: t.id, forget: { table: "artifacts", key: t.id, warn: "This also deletes the thing I built." } });
	}
	rows.sort((a, b) => ts(b.at) - ts(a.at));
	const days: FeedDay[] = [];
	for (const row of rows.slice(0, limit)) {
		let d = days.find((x) => x.day === row.day);
		if (!d) days.push((d = { day: row.day, heading: heading(row.day, today), rows: [] }));
		d.rows.push(row);
	}
	days.sort((a, b) => b.day.localeCompare(a.day));
	const comingUp = input.reminders
		.filter((r) => r.status === "pending")
		.sort((a, b) => ts(a.due_at) - ts(b.due_at))
		.map((r) => ({ id: r.id, text: `${full(r.text)}`, due: r.due_at, forget: { table: "reminders" as const, key: r.id } }));
	return { comingUp, days, more: rows.length > limit };
}
```
Note: the test expects Coming up ids `r4, r3`; `full()` on text is only for display. If the mood test row order differs, fix the sort key (mood sorts first within its day because of `23:59:59.999Z`).
- [ ] **Step 3:** run `npx vitest run lib/shell/feed.test.ts`; commit `git add lib/shell/feed.ts lib/shell/feed.test.ts && git commit -m "feat(shell): Feed timeline built from existing tables, pure and tested"`.

---
### Task 5: Settings state lines (`lib/shell/settings-lines.ts`)
**Produces:** `devicesLine(n)`, `voiceLine(natural, listening)`, `mayDoLine(paused, on)`, `placeLine(place, pushOn)`.
- [ ] **Step 1: test** `lib/shell/settings-lines.test.ts`
```ts
import { expect, it } from "vitest";
import { devicesLine, mayDoLine, placeLine, voiceLine } from "./settings-lines";

it("writes the five state lines in his register", () => {
	expect(devicesLine(2)).toBe("2 devices remember you.");
	expect(devicesLine(1)).toBe("1 device remembers you.");
	expect(devicesLine(0)).toBe("No device remembers you yet.");
	expect(voiceLine(true, false)).toBe("Natural voice on, listening off.");
	expect(mayDoLine(false, 6)).toBe("Paused: no. 6 things on.");
	expect(mayDoLine(true, 1)).toBe("Paused: yes. 1 thing on.");
	expect(placeLine("Rotterdam", false)).toBe("Saved: Rotterdam. Notifications off on this device.");
	expect(placeLine(null, true)).toBe("No place saved. Notifications on this device.");
	for (const s of [devicesLine(3), voiceLine(false, true), mayDoLine(false, 0), placeLine(null, false)]) expect(s).not.toContain("!");
});
```
- [ ] **Step 2: implement**
```ts
const on = (b: boolean) => (b ? "on" : "off");
export const devicesLine = (n: number) => (n === 0 ? "No device remembers you yet." : n === 1 ? "1 device remembers you." : `${n} devices remember you.`);
export const voiceLine = (natural: boolean, listening: boolean) => `Natural voice ${on(natural)}, listening ${on(listening)}.`;
export const mayDoLine = (paused: boolean, count: number) => `Paused: ${paused ? "yes" : "no"}. ${count} ${count === 1 ? "thing" : "things"} on.`;
export const placeLine = (place: string | null, pushOn: boolean) => `${place ? `Saved: ${place}.` : "No place saved."} Notifications ${on(pushOn)} on this device.`;
```
- [ ] **Step 3:** run it; commit `git add lib/shell/settings-lines.ts lib/shell/settings-lines.test.ts && git commit -m "feat(shell): state lines for the Settings index"`.

---
### Task 6: Shared readers (`lib/shell/data.ts`)
No test (network); typed thin wrappers over the queries the old panels already run, reusing their sanitizers. Missing table (`PGRST205`) reads as empty. **Produces:**
```ts
import { supabase } from "@/lib/supabase";
import { sanitizeMoodDay } from "@/lib/agent/mood-days";
import { sanitizeThing, type ThingRow } from "@/lib/artifacts/things";
import { sanitizeNote, sanitizeReminder } from "./reminders-notes";
import { sanitizeActionRow } from "./what-i-did";
import { extractLinks, type LinkItem } from "./library";
import type { MoodFeedRow, ReminderFeedRow } from "./feed";

export type Read<T> = { rows: T[]; failed: boolean };
const out = <T,>(data: unknown[] | null, error: { code?: string } | null, map: (x: unknown) => T | null): Read<T> =>
	error && error.code !== "PGRST205" ? { rows: [], failed: true } : { rows: (data ?? []).map(map).filter((x): x is T => x !== null), failed: false };

export async function readNotes() { const r = await supabase.from("notes").select("id,text,created_at").order("created_at", { ascending: false }).limit(100); return out(r.data, r.error, sanitizeNote); }
export async function readThings(): Promise<Read<ThingRow>> { const r = await supabase.from("artifacts").select("id,title,version,parent_id,created_at").order("created_at", { ascending: false }).limit(200); return out(r.data, r.error, sanitizeThing); }
export async function readLinks(): Promise<Read<LinkItem>> {
	const r = await supabase.from("messages").select("id,role,text,speaker,created_at").eq("role", "agent").is("speaker", null).ilike("text", "%http%").order("created_at", { ascending: false }).limit(100);
	return r.error ? { rows: [], failed: true } : { rows: extractLinks((r.data ?? []) as Parameters<typeof extractLinks>[0]), failed: false };
}
export async function readMemoryDates(): Promise<Record<string, string>> { const r = await supabase.from("memory_facts").select("key,updated_at"); return Object.fromEntries((r.data ?? []).map((x: { key: string; updated_at: string }) => [x.key, x.updated_at])); }
export async function readActions(sinceIso: string) { const r = await supabase.from("actions").select("id,at,surface,status,summary").gte("at", sinceIso).order("at", { ascending: false }).limit(100); return out(r.data, r.error, sanitizeActionRow); }
export async function readReminders(): Promise<Read<ReminderFeedRow>> {
	const r = await supabase.from("reminders").select("id,text,due_at,sent_at,status").in("status", ["pending", "sent", "missed"]).order("due_at", { ascending: false }).limit(100);
	return out(r.data, r.error, (x) => { const base = sanitizeReminder(x); const o = x as { sent_at?: unknown; status?: unknown }; return base && (o.status === "pending" || o.status === "sent" || o.status === "missed") ? { id: base.id, text: base.text, due_at: base.due_at, sent_at: typeof o.sent_at === "string" ? o.sent_at : null, status: o.status } : null; });
}
export async function readMoods(sinceDay: string): Promise<Read<MoodFeedRow>> { const r = await supabase.from("mood_days").select("day,valence,strongest,tally,samples").gte("day", sinceDay).order("day", { ascending: false }).limit(100); return out(r.data, r.error, (x) => { const m = sanitizeMoodDay(x); return m && { day: m.day, strongest: m.strongest }; }); }
// The newest stamp of what Library holds, for the rail dot.
export async function latestLibraryStamp(): Promise<string | null> { /* three `select col order col desc limit 1` on notes.created_at, memory_facts.updated_at, artifacts.created_at; return the max by Date.parse, null if all fail or are empty */ }
export async function openThingSource(id: string): Promise<string | null> { const r = await supabase.from("artifacts").select("source").eq("id", id).maybeSingle(); return r.error || typeof r.data?.source !== "string" ? null : r.data.source; }
const KEY = { actions: "id", reminders: "id", notes: "id", artifacts: "id", messages: "id", mood_days: "day" } as const;
// Deletes one row as Gur. Zero rows deleted (a policy mismatch deletes nothing and reports no error) counts as failure.
export async function forgetRow(table: keyof typeof KEY, key: string | number): Promise<boolean> {
	const r = await supabase.from(table).delete().eq(KEY[table], key).select(KEY[table]);
	return !r.error && (r.data?.length ?? 0) > 0;
}
```
- [ ] Write the file exactly as above (implement the `latestLibraryStamp` body as described; it is the only prose). `npx tsc --noEmit -p .` clean. Commit `git add lib/shell/data.ts && git commit -m "feat(shell): shared readers and forgetRow for Library and Feed"`.

---
### Task 7: The rail (`components/osmo/rail.tsx`, `rail.module.css`)
**Consumes:** `RailItem`, `RailId`. **Produces:** `Rail({ items, fill?, onNavigate(id), linkRef(id), play? })`.

- [ ] **Step 1: `rail.tsx`.** `"use client"`. `<nav className={s.rail} aria-label="Osmo"><ul className={s.list}>` one `<li className={item.id === "settings" ? s.pinned : undefined}>` per item holding:
```tsx
<a href={item.href} ref={linkRef(item.id)} className={s.link} data-id={item.id} data-dot={item.dot ? "" : undefined}
   data-play={play ? "" : undefined} aria-current={item.active ? "page" : undefined}
   onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onNavigate(item.id); }}>
  <span className={s.icon}>{icon(item.id, fill)}</span>
  <span className={s.label}>{item.label}{item.sr && <span className={s.sr}>{item.sr}</span>}</span>
</a>
```
`icon(id, fill = 70)` returns, for `talk`, `<span className={s.heart} />`; for the rest an `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">` with (`P = pathLength={1}`; `--i` is set by `style={{ "--i": n } as CSSProperties}`):
- ideas: `<circle className={s.core} cx="12" cy="12" r="2.2"/>` and four `<path className={s.ray} P d=…>` (`--i` 0 to 3): `M12 7V3.5`, `M17 12h3.5`, `M12 17v3.5`, `M7 12H3.5`.
- goals: `<circle cx="12" cy="12" r="9" opacity=".25"/><circle className={s.arc} cx="12" cy="12" r="9" pathLength={100} style={{"--fill": fill}}/>`.
- library: three groups `<g className={s.shelf} style={{"--dir": 1|-1|1}}>`: `<path d="M4 7h16"/>` + `<rect x="6.5" y="3.2" width="2.2" height="3.8"/><rect x="10" y="4.4" width="2" height="2.6"/>`; shelf two `<path d="M4 13h16"/>` + `<rect x="12.5" y="9.2" width="2.2" height="3.8"/><rect x="16" y="10.4" width="2" height="2.6"/>`; shelf three `<path d="M4 19h16"/>` + `<rect x="6.5" y="15.2" width="2.2" height="3.8"/><rect x="10" y="16.4" width="2" height="2.6"/>`.
- feed: `<polyline className={s.trace} P points="3 17 8 12 12.5 14.5 18.5 8"/><circle className={s.land} cx="20.5" cy="6.2" r="1.7" fill="currentColor" stroke="none"/>`.
- search: `<g className={s.lens}><circle cx="10.5" cy="10.5" r="6.5"/></g><path d="M15.5 15.5l5 5"/>`.
- settings: static ticks `<path d="M12 1.5v1.8M12 20.7v1.8M1.5 12h1.8M20.7 12h1.8"/>` and `<g className={s.dial}><circle cx="12" cy="12" r="6.5"/><path d="M12 12V7.5"/></g>`.

- [ ] **Step 2: `rail.module.css`** (write in full):
```css
.rail { --ease: cubic-bezier(0.2, 0.8, 0.2, 1); position: absolute; inset: 0 auto 0 0; width: var(--rail-w); z-index: 6; display: flex; flex-direction: column; align-items: center; padding: 1.25rem 0; background: var(--rail-ground); }
.list { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; flex: 1; width: 100%; }
.pinned { margin-top: auto; }
.link { position: relative; display: grid; place-items: center; width: 3rem; height: 3rem; border-radius: 0.9rem; color: color-mix(in oklab, var(--bone) 62%, transparent); }
.link:is(:hover, :focus-visible, [data-play]) { color: var(--bone); }
.link[aria-current="page"] { color: color-mix(in oklab, var(--aura-a) 85%, white); }
.link[aria-current="page"] .icon { filter: drop-shadow(0 0 6px color-mix(in oklab, var(--aura-a) 60%, transparent)); }
.link:focus-visible { outline: 2px solid var(--aura-a); outline-offset: 3px; }
.icon { position: relative; display: grid; place-items: center; width: 1.5rem; height: 1.5rem; }
.icon svg { width: 100%; height: 100%; overflow: visible; }
.label { position: absolute; left: calc(100% + 0.1rem); top: 50%; translate: 0 -50%; padding: 0.3rem 0.6rem; border-radius: 0.5rem; font-size: 0.78rem; font-weight: 500; white-space: nowrap; color: var(--bone); background: color-mix(in oklab, var(--rail-ground) 92%, transparent); opacity: 0; pointer-events: none; transition: opacity 120ms; }
.link:is(:hover, :focus-visible) .label { opacity: 1; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.link[data-dot] .icon::after { content: ""; position: absolute; top: -0.15rem; right: -0.2rem; width: 0.4rem; height: 0.4rem; border-radius: 50%; background: var(--aura-b); animation: dot-in 300ms ease both; }

/* Talk: his heart, the same blob as the old header heart. */
.heart { width: 1.25rem; height: 1.25rem; border-radius: var(--r1, 60% 40% 30% 70% / 60% 30% 70% 40%); background: radial-gradient(circle at 40% 35%, color-mix(in oklab, var(--aura-a) 80%, white), var(--aura-a) 70%); transform: scale(calc(1 + var(--voice) * 0.9)); box-shadow: 0 0 calc(0.3rem + var(--voice) * 1.1rem) color-mix(in oklab, var(--aura-a) 75%, transparent); transition: transform 90ms ease-out, box-shadow 90ms ease-out, border-radius 420ms cubic-bezier(0.4, 0.1, 0.3, 1); animation: idle-heart var(--pulse) ease-in-out infinite; }
:global([data-speaking]) .heart { animation: none; }
@keyframes idle-heart { 0%, 100% { scale: 1; } 50% { scale: 1.14; } }

/* The others rest in their settled state and play once to it. */
.ray, .trace { stroke-dasharray: 1; stroke-dashoffset: 0; }
.arc { stroke-dasharray: 100 100; stroke-dashoffset: calc(100 - var(--fill, 70)); rotate: -90deg; transform-box: fill-box; transform-origin: center; }
.core, .lens, .dial { transform-box: fill-box; transform-origin: center; }
.dial { transition: rotate 500ms var(--ease); }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .dial { rotate: 90deg; }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .ray { animation: draw 420ms var(--ease) both; animation-delay: calc(var(--i) * 60ms); }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .core { animation: flare 560ms var(--ease); }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .arc { animation: ring 650ms var(--ease) both; }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .shelf { animation: drawer 600ms var(--ease) both; animation-delay: calc(var(--n, 0) * 80ms); }
.shelf:nth-of-type(2) { --n: 1; } .shelf:nth-of-type(3) { --n: 2; }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .trace { animation: draw 700ms var(--ease) both; }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .land { animation: land 200ms ease 560ms both; }
.link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .lens { animation: focus-flat 600ms var(--ease) both; }
@supports not (-webkit-hyphens: none) { .link:is(:hover, :focus-visible, [aria-current="page"], [data-play]) .lens { animation-name: focus-blur; } }
.land { transform-box: fill-box; transform-origin: center; }
@keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes flare { 40% { scale: 1.35; } }
@keyframes ring { from { stroke-dashoffset: 100; } to { stroke-dashoffset: calc(100 - var(--fill, 70)); } }
@keyframes drawer { 50% { translate: calc(2.5px * var(--dir, 1)) 0; } }
@keyframes land { from { opacity: 0; scale: 0.4; } to { opacity: 1; scale: 1; } }
@keyframes focus-flat { from { scale: 1.18; } to { scale: 1; } }
@keyframes focus-blur { from { scale: 1.18; filter: blur(1.4px); } to { scale: 1; filter: blur(0); } }
@keyframes dot-in { from { opacity: 0; } }

:global([data-typing]) .rail { display: none; }
@media (max-width: 40rem) {
	.rail { position: fixed; inset: auto 0 0 0; width: auto; height: calc(var(--bar-h) + env(safe-area-inset-bottom)); padding: 0 0 env(safe-area-inset-bottom); flex-direction: row; }
	.list { flex-direction: row; justify-content: space-around; gap: 0; }
	.list li { flex: 1; display: grid; place-items: center; }
	.pinned { margin-top: 0; }
	.link { width: 100%; height: var(--bar-h); gap: 0.1rem; align-content: center; }
	.label { position: absolute; left: 0; right: 0; top: auto; bottom: 0.15rem; translate: 0; padding: 0; background: none; text-align: center; font-size: 0.7rem; }
	.link[aria-current="page"] .label { opacity: 1; }
	.link:not([aria-current="page"]) .label { opacity: 0; }
	.link { padding-bottom: 0.7rem; }
}
@media (prefers-reduced-motion: reduce) {
	.rail *, .rail *::before, .rail *::after { animation: none !important; transition: color 120ms, opacity 120ms !important; }
	.heart { transform: none; }
}
```
- [ ] **Step 3:** `npx tsc --noEmit -p . && npm run lint`; commit `git add components/osmo/rail.tsx components/osmo/rail.module.css && git commit -m "feat(shell): the rail with its seven icons and motions"`.

---
### Task 8: Navigation hook, dots, panel shell
**Files:** Create `components/osmo/use-shell.ts`, `use-rail-dots.ts`, `shell-panel.tsx`, `shell.module.css`.
**Consumes:** Tasks 1, 2, 6. **Produces:** `useShell(enabled, stageRef, ready)` returning `{ route, items, navigate(id: RailId), open(panel, page?, item?), go(route, kind?), close(), back(), linkRef(id) }`; `ShellPanel({ title, onBack?, onClose, children })`.

- [ ] **`use-shell.ts`:**
  - `hash` comes from `useSyncExternalStore(subscribe, enabled ? () => window.location.hash : () => "", () => "")`; `subscribe` listens to `popstate`, `hashchange` and a custom `osmo:navigate` event. `route = useMemo(() => parseRoute(hash), [hash])`.
  - `go(to, kind = navKind(parseRoute(location.hash), to))`: URL is `pathname + search + routeHash(to)`; `push` calls `history.pushState({ osmoPush: true }, "", url)`, else `history.replaceState(history.state, "", url)`; then `dispatchEvent(new Event("osmo:navigate"))` (these calls sync with the Next router, per the docs read above).
  - `navigate(id)`: Talk or the active item with no page closes; else `go({ panel: id })`. `close()` = `go(TALK)` then `requestAnimationFrame(() => linkRefs.current[previous]?.focus())`. `open(panel, page, item)` = `go({ panel, page, item })`. `back()`: `history.state?.osmoPush ? history.back() : go(parentRoute(route), "replace")` (a deep link never leaves the app).
  - `linkRef(id)` stores anchors in a ref map. A `useEffect` on `stageRef` (when enabled) adds `focusin`/`focusout` listeners that `toggleAttribute("data-typing", …)` when the target matches `input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea`; cleanup removes both and the attribute.
  - `items = railItems(route, { library: dots.library })`, with `dots = useRailDots(enabled, ready, route.panel)`.
- [ ] **`use-rail-dots.ts`:** `store = useMemo(() => createSeenStore(safeLocalStorage(), () => new Date().toISOString()), [])` where `safeLocalStorage()` returns `window.localStorage` inside try/catch else null (called only in effects, never at render). `check()` is `async`: `const latest = await latestLibraryStamp(); setLibrary(hasNew(store.get("library"), latest))`. One effect (when `enabled && ready`) runs `check()` and adds `window` `focus` listener running it again (cleanup removes). A second effect on `panel === "library"` runs `store.mark("library"); void check();`. Returns `{ library }`.
- [ ] **`shell-panel.tsx`:** same shape as `Panel` in `panel.tsx` (aside `id="osmo-panel"`, `aria-labelledby`, `h2` with `tabIndex={-1}` focused in an effect on `[title]`, document `keydown` Escape closing unless `event.defaultPrevented`), plus an optional `Back` button before the title (`onBack`). Classes from `shell.module.css`.
- [ ] **`shell.module.css`:** `.panel { composes: panel from "./panels.module.css"; }`, `.top`, `.title`, `.close` likewise composed from `panels.module.css`; `.back { composes: close from "./panels.module.css"; margin-right: 0.8rem; }`; `@media (max-width: 40rem) { .panel { bottom: calc(var(--bar-h) + env(safe-area-inset-bottom)); } }`; `:global([data-typing]) .panel { bottom: 0; }`; Library/Feed/Settings page lines also live here: `.chips { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 1rem; }`, `.chip { composes: link from "./panels.module.css"; }` (its `aria-expanded` underline is replaced by `.chip[aria-pressed="true"] { opacity: 1; border-bottom-color: var(--aura-a); }`), `.meta { font-size: 0.8rem; opacity: 0.6; font-variant-numeric: tabular-nums; }`, `.h3 { font-size: 1.05rem; font-weight: 600; margin: 0 0 0.4rem; }`, `.lit { animation: lit 1.2s ease-out; } @keyframes lit { from { background: color-mix(in oklab, var(--aura-a) 28%, transparent); } }` and `@media (prefers-reduced-motion: reduce) { .lit { animation: none; } }`, `.pageLink { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; padding: 0.7rem 0; cursor: pointer; }` with `.pageLink:focus-visible` outline as the others.
- [ ] `npx tsc --noEmit -p . && npm run lint`; commit `git add components/osmo/use-shell.ts components/osmo/use-rail-dots.ts components/osmo/shell-panel.tsx components/osmo/shell.module.css && git commit -m "feat(shell): hash navigation hook, rail dots and the panel shell"`.

---
### Task 9: Settings in five pages
**Files:** Create `components/osmo/devices-lock.tsx`, `settings-pages.tsx`; modify `settings-panel.tsx`, `connectors-settings.tsx`.
**Rule: the old Settings renders exactly what it does today, in the same order.**

- [ ] **Step 1 (extract, no behaviour change).** Move the whole "Devices" block and its state (`devices, now, deviceError, editing, confirming, adding`, `refresh`, `saveName`, `remove`, `addThisDevice`, the load effect, constants `UNREACHABLE`, `SAVE_FAILED`, `PASSKEY_FAILED_HERE`) from `settings-panel.tsx` into `export function DevicesBlock()` in `devices-lock.tsx`, and the "Lock Osmo" block (`lockError`, `lock`, `useRouter`) into `export function LockBlock()`. Move the AI paragraph into `export function AiLine({ aiUsage })`. `SettingsPanel` becomes `<DevicesBlock /><VoiceSettings voice={voice} /><ConnectorsSettings /><RemindersNotes /><AiLine aiUsage={aiUsage} /><LockBlock /><About section/>`. Run `npx tsc --noEmit -p .` and, with the switch unset, compare Settings visually before and after (same blocks, same order).
- [ ] **Step 2 (parts).** In `connectors-settings.tsx`: `export const CONNECTORS`; `export function ConnectorsSettings({ parts = ["mayDo", "place", "notifications"] }: { parts?: ("mayDo" | "place" | "notifications")[] })`; wrap the three `<section>`s in `{parts.includes("mayDo") && …}` etc. (the loading and error early returns stay). Default output is unchanged.
- [ ] **Step 3: `settings-pages.tsx`** exports `SettingsIndex({ voice, goTo(page) })` and `SettingsPage({ page, voice, aiUsage, agent })`.
  - Page titles for `ShellPanel`: devices "Devices and lock", voice "Voice", may-do "What he may do", place "Place and notifications", about "About" (panel title with no page: "Settings").
  - `SettingsIndex`: five `button.pageLink` rows (title 1.05rem 600, state line `styles.note`) in this order; state lines load once with `listDevices()` (count via `devicesLine`), `loadProfileRow(supabase)` (`paused`, `place`, count of `CONNECTORS` whose saved level is not `"off"`: `mayDoLine`, `placeLine`), `voiceLine(voice.naturalVoice, voice.listening)`, and this device's push state `await (await navigator.serviceWorker.ready).pushManager.getSubscription()` inside try/catch (false on failure). While loading a line is empty; a failure shows nothing rather than an error.
  - `SettingsPage`: devices → `<DevicesBlock /><LockBlock />`; voice → `<VoiceSettings voice={voice} />`; may-do → `<ConnectorsSettings parts={["mayDo"]} /><AiLine aiUsage={aiUsage} />`; place → `<ConnectorsSettings parts={["place", "notifications"]} />`; about → the version line section (`versionLine(OSMO_VERSION, OSMO_BUILD, OSMO_BUILT_AT)`), then "Who I am" (`characterLines()`) and "Our story" (`storyLines(agent.bond, now)` with the same empty text "Our story starts with your first message.") copied from `insights-panel.tsx`, using `insights.module.css`'s `.story`, `.moment`, `.when`. `now` is captured with `useState(() => Date.now())`.
  - Moved nowhere: `RemindersNotes` is not in any page (notes go to Library, reminders to Feed).
- [ ] Hand check the five pages at 375 px and desktop later (Task 14). `npx tsc --noEmit -p . && npm run lint`; commit `git add components/osmo/devices-lock.tsx components/osmo/settings-pages.tsx components/osmo/settings-panel.tsx components/osmo/connectors-settings.tsx && git commit -m "feat(shell): Settings as five pages; old Settings unchanged"`.

---
### Task 10: Library panel
**Files:** Create `components/osmo/library-memory.tsx`, `library-panel.tsx`. **Consumes:** Tasks 3, 6.
**Produces:** `LibraryPanel({ route, memory, onMemoryChange, onOpenThing, go })` (`go` is `shell.go`).

- [ ] **`library-memory.tsx`:** `useMemoryEdits(memory, onChange)` returns `{ save(key, value), forget(key), error }` with the same supabase calls and rollbacks as `MemoryPanel` (`upsert … onConflict "user_id,key"` with `updated_at`; `delete().eq("key", key)`; on failure restore from the removed copy; error "I could not save that. Try again."), using functional `onChange` updates only. `MemoryRow({ item: MemoryLine, edits })` shows `item.sentence` as a `lineText` button; click turns it into an `input` (Enter or blur saves via `cleanEditedValue`; Escape calls `preventDefault` and `stopPropagation` and cancels, so the panel stays open), and Forget/Keep inline confirm ("Forget this?"). Reuse `memoryLine` from `lib/shell/memory-lines`. This duplicates `MemoryPanel`'s logic on purpose until the old panel is removed.
- [ ] **`library-panel.tsx`:** filter = `route.page` if in `LIBRARY_FILTERS` else `"everything"`. On mount: `Promise.all([readNotes(), readThings(), readLinks(), readMemoryDates()])` once (nothing is fetched until the panel opens). A fact's date is `dates[key]` else the time the panel opened. Rows come from `mergeLibrary({ memory: memory.map(...), notes, things, links }, filter, shown)` with `shown` starting at 40 and "Show more" adding 40 (`mergeLibrary`'s `more` decides the button).
  - Chips: `<div className={shell.chips} role="group" aria-label="Show">` with buttons Everything, Memory, Notes, Things, Links, `aria-pressed`, calling `go({ panel: "library", page: f === "everything" ? undefined : f })`.
  - Each row is `<div className={panels.line} id={"row-" + row.id}>`: left the text (memory: `MemoryRow`; note: text; thing: `describeThing` from `lib/artifacts/things`; link: `link.title` then `link.host`), a `.meta` day, and actions. Actions: thing `Open` (`openThingSource(id)` then `onOpenThing(id, title, source)`; null shows "I could not open that. Try again.") and Forget; link `Open` (`<a href target="_blank" rel="noopener noreferrer">`) and Forget; note Forget. Forget is the inline two-step "Forget this?" / "Keep"; it removes the row at once, calls `forgetRow("notes" | "artifacts" | "messages", id or messageId)`, and on `false` puts the row back and shows "I could not save that. Try again." Thing confirm text: "This also deletes earlier versions." Link confirm text: "This also removes the line from our conversation." (grant verified above).
  - Deep link: when `route.item` is set and rows are loaded, `document.getElementById("row-" + item)?.scrollIntoView({ block: "center" })` and add `shell.lit` for 1.2 s (state cleared by `setTimeout`, cleaned up).
  - Empty (Everything): "I do not keep anything yet. Ask me to remember something, or to make a note." Each other filter has its own one-line empty text in the same voice. Failures from any reader show "I cannot reach my memory right now. Try again in a moment." once.
- [ ] `npx tsc --noEmit -p . && npm run lint`; commit `git add components/osmo/library-memory.tsx components/osmo/library-panel.tsx && git commit -m "feat(shell): Library panel over memory, notes, things and links"`.

---
### Task 11: Feed panel
**Files:** Create `components/osmo/feed-panel.tsx`, `feed.module.css`. **Consumes:** Tasks 4, 6. **Produces:** `FeedPanel({ onOpenThing })`.

- [ ] **Data:** on mount `readActions(30 days ago)`, `readReminders()`, `readMoods(six days before today)` (the week plus the full list for rows, limit 100), `readThings()`, and the profile zone from `loadProfileRow(supabase)` (`row !== "error" ? row.timezone : null`); `zone = resolveZone(profileZone, Intl.DateTimeFormat().resolvedOptions().timeZone)`; `feed = buildFeed(input, { zone, now, limit })` with `limit` 30 growing by 30 on "Show more"; `now` from `useState(() => Date.now())`.
- [ ] **Top:** "My mood, the last 7 days" section copied from `InsightsPanel` (same `weekSeries`, polyline segments, day buttons, `dayName`/`strongestPhrase` note, started-on line from `readMoods`' first day), using `insights.module.css` classes; the polyline gets `pathLength={1}` and class `feed.module.css .draw` (`stroke-dasharray: 1; animation: draw-line 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;` keyframes from `stroke-dashoffset: 1`; none under reduced motion). Then "Coming up" (only when `feed.comingUp` is not empty): each reminder as a `.line` with its `dueLine(due, now)` from `lib/shell/reminders-notes` and a Forget (inline confirm) using `forgetRow("reminders", id)`.
- [ ] **Days:** for each `FeedDay` a heading `<h3 className={shell.h3}>` and a list with a thin vertical line: `.days { border-left: 1px solid color-mix(in oklab, var(--aura-b) 40%, transparent); padding-left: 0.9rem; }` and a node per row (`.row::before` 0.4rem circle in `--aura-b`, absolutely placed on the line). Row text from `FeedRow.text`; build rows also get `Open` (`openThingSource`); every row gets Forget (inline "Forget this?" / "Keep"; the `warn` text from `ForgetTarget` is shown in the confirm state) calling `forgetRow(target.table, target.key)`; failure restores the row and shows "I could not forget that. Try again.". After the days: "Forgetting a line does not undo what was done." and, for the actions group only, `Forget all` (`supabase.from("actions").delete().gt("id", 0)`, same two-step confirm as Insights).
- [ ] Empty: "Nothing has happened yet that I can show. When I do something for you, it will appear here." `Show more` button when `feed.more`. Rows carry no numbers or badges.
- [ ] `npx tsc --noEmit -p . && npm run lint`; commit `git add components/osmo/feed-panel.tsx components/osmo/feed.module.css && git commit -m "feat(shell): Feed panel with the mood week and a timeline of what happened"`.

---
### Task 12: Host, room wiring, shell variables
**Files:** Create `components/osmo/shell-panels.tsx`; modify `app/assistant.tsx`, `app/assistant.module.css`, `app/layout.tsx`.

- [ ] **`shell-panels.tsx`:** `ShellPanels({ shell, memory, onMemoryChange, agent, voice, aiUsage, onOpenThing })` returns `null` when `shell.route.panel === null`, else `<ShellPanel title onBack onClose={shell.close}>` with: library → `<LibraryPanel route go={shell.go} memory onMemoryChange onOpenThing />` titled "Library"; feed → `<FeedPanel onOpenThing />` titled "Feed"; settings → no page: title "Settings" and `<SettingsIndex voice goTo={(p) => shell.open("settings", p)} />`; with a page: that page's title, `onBack={shell.back}`, `<SettingsPage … />`. A page change (and a panel change) re-focuses the title, because the title string changes.
- [ ] **`assistant.module.css`** (append, main's file; the variables live on `.stage`):
```css
/* Shell v2 (NEXT_PUBLIC_OSMO_SHELL2): a rail on the left, a bar on phones. */
.stage[data-shell] { --rail-w: 4.25rem; --bar-h: 3.5rem; --rail-ground: color-mix(in oklab, var(--ink) 38%, var(--base)); padding-left: calc(var(--rail-w) + 2rem); }
.stage[data-shell] .figure { left: calc(50% + var(--rail-w) / 2); }
@media (min-width: 40.01rem) { .stage[data-shell][data-panel] .column { --avail: calc(100vw - var(--rail-w) - var(--panel-w) - 3rem); } }
@media (max-width: 40rem) {
	.stage[data-shell] { --rail-w: 0rem; padding-left: 2rem; padding-bottom: calc(var(--bar-h) + env(safe-area-inset-bottom)); }
	.stage[data-shell][data-typing] { padding-bottom: 0; }
}
```
- [ ] **`app/layout.tsx`:** `export const viewport: Viewport = { themeColor: THEME_COLOR, ...(process.env.NEXT_PUBLIC_OSMO_SHELL2 === "on" ? { viewportFit: "cover" as const } : {}) };` (`env(safe-area-inset-bottom)` needs it; it is off when the switch is off so today's shell is byte-identical on notched phones).
- [ ] **`app/assistant.tsx` edits, all inside main's parts (room markup, panels, header, mic):**
  - **A1** imports: `SHELL2` from `@/lib/shell/flag`; `useShell` from `@/components/osmo/use-shell`; `Rail` from `@/components/osmo/rail`; `ShellPanels` from `@/components/osmo/shell-panels`.
  - **A2** after `const heart = useHeartMotion(stageRef);` add `const shell = useShell(SHELL2, stageRef, ready);` and **A3** `const openPanel = SHELL2 ? shell.route.panel : panels.panel;`.
  - **A4** (voice call, line ~274) `openSettings: () => (SHELL2 ? shell.open("settings", "voice") : panels.open("settings")),`.
  - **A5** stage attributes: `data-panel={openPanel ?? undefined}` and add `data-shell={SHELL2 ? "" : undefined}`.
  - **A6** before `<main className={styles.column}>`: `{SHELL2 && <Rail items={shell.items} fill={70} onNavigate={shell.navigate} linkRef={shell.linkRef} />}`.
  - **A7** header: wrap `<span className={styles.heart} aria-hidden="true" />` and `<PanelLinks … />` each in `{!SHELL2 && …}`.
  - **A8** `ThingPanel … hidden={openPanel !== null}`.
  - **A9** the bottom panel block: `{SHELL2 ? <ShellPanels shell={shell} memory={memory} onMemoryChange={setMemory} agent={agent} voice={voice} aiUsage={aiUsage} onOpenThing={(id, title, source) => { build.show(id, title, source); shell.close(); }} /> : panels.panel && ( …the existing <Panel> block unchanged… )}`.
  - Nothing else in the file changes. After the edits `git diff app/assistant.tsx` must show only A1 to A9.
- [ ] Run `npx vitest run && npx tsc --noEmit -p . && npm run lint`. Start the dev server once (`.claude/launch.json`, port 3000, only one) with the switch unset and confirm the old shell; then set `NEXT_PUBLIC_OSMO_SHELL2=on` in `.env.local` (Gur types env values; ask him) and restart. Commit `git add components/osmo/shell-panels.tsx app/assistant.tsx app/assistant.module.css app/layout.tsx && git commit -m "feat(shell): wire the v2 shell into the room behind NEXT_PUBLIC_OSMO_SHELL2"`.

---
### Task 13: `/dev/rail`
**Files:** Create `app/dev/rail/page.tsx`, `app/dev/rail/dev.module.css`. Same pattern as `app/dev/figure/page.tsx`: `"use client"`, `if (process.env.NODE_ENV === "production") notFound();` first line of the component, `Bricolage_Grotesque`, `styles from "../../assistant.module.css"` for `.stage`.
- [ ] A `.stage` with `data-shell`, `moodTheme(feeling(mood))` variables as the figure page does (mood buttons: calm, joy, sadness, fear, anger, love, loneliness, hope, setting `data-tone` and `--aura-a/-b/--base/--pulse`), and these panels, each a `<Rail>` wrapped in a 4.25rem-wide relatively positioned box (the dev page overrides `.rail { position: relative; height: 30rem }` in `dev.module.css`; the phone bar is checked with the browser at 375 px):
  1. every item in rest state: `railItems({ panel: null }, {}, ALL)` with Talk active;
  2. one rail per item active: `railItems({ panel: id }, …)`;
  3. all dots on: `railItems({ panel: null }, { library: true, goals: true }, ALL)`;
  4. `play` forced on (every motion at once, with a "Replay" button toggling it off and on);
  5. Goals ring fill 0, 70, 100 (three rails with `fill`);
  6. a Speaking toggle that sets `data-speaking` and `--voice` 0.8 on the stage, and a Quiet toggle (`--voice` 0);
  7. a note: "Resize to 375 px for the bar; set prefers-reduced-motion in devtools for the static end states."
- [ ] `npx tsc --noEmit -p . && npm run lint`; commit `git add app/dev/rail && git commit -m "feat(shell): /dev/rail shows the rail in every state (404 in production)"`.

---
### Task 14: The gate
**Files:** Create `lib/shell/contrast.ts`, `lib/shell/contrast.test.ts`.
- [ ] **Contrast test (spec 2.1).** `contrast.ts` exports `mixOklab(a: Rgb, b: Rgb, p: number): Rgb` (convert sRGB to linear, then to oklab with the standard matrices, mix `p` of `a`, convert back), `hslToRgb(h, s, l)` and `contrastRatio(a, b)` (WCAG relative luminance). The test builds the Rail ground as `mixOklab(ink #0c111b, base, 0.38)` for `hsl(H 30% L%)` over H in {0, 60, 172, 212, 300} and L in {7, 11, 15} (the exact range `moodTheme` writes: `7 + (valence + 1) * 4`), computes the resting icon as `mixOklab(bone #f3efe8, rail, 0.62)`, and expects `contrastRatio(icon, rail) >= 3` (measured 5.6 or better) and Bone label text on the rail >= 4.5. Also the rest-tone active stroke `mixOklab(hslToRgb(172, 38, 50), white, 0.85)` against the rail >= 3. If a row fails, raise the resting opacity in `rail.module.css` and update Global Constraints.
- [ ] **Automated:** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`. Then `npx next start` and `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dev/rail` must print 404. Re-run the grant check read-only on the live project: `select table_name, string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema='public' and grantee='authenticated' and table_name in ('messages','mood_days') group by 1;` must still list DELETE. Commit `git add lib/shell/contrast.ts lib/shell/contrast.test.ts && git commit -m "test(shell): the rail's contrast holds on every mood tone"`.
- [ ] **Brain:** update `brain/desks/main.md` (Just landed: commits, "phase A built behind NEXT_PUBLIC_OSMO_SHELL2, assistant.tsx edits A1 to A9") and `git -C brain push origin brain`. Post the Ask to Gur (switch, hand check) and the guest-dots Ask to speaking and main (no guest state is exposed by `useVoice`).
- [ ] **Hand check for Gur** (switch `on`; Chrome, then the phone):
  1. Switch unset: today's header links, Memory, Insights, Settings behave as before. Switch on: header heart and links are gone, a rail has Talk (beating), Library, Feed, Settings.
  2. Desktop: hover each item: the label appears and the motion plays once (Library shelves slide, Feed line draws and a dot lands, Settings dial turns a quarter and stays turned while open). Keyboard Tab shows the focus ring and plays the motion. Open `/dev/rail` for Ideas, Goals, Search, the ring at 0/70/100, every mood tone, speaking swell, and the dots.
  3. Panels: Library opens at 28 rem, the room narrows beside it; rail to rail replaces, Escape closes and focus returns to the rail link; Escape inside a rename or a memory edit cancels only the edit; browser Back goes page, list, Talk; `#library/notes`, `#settings/voice`, `#memory`, `#insights` open the right place; a new tab on `#settings/voice` has a Back button that stays in Osmo.
  4. Library: Everything/Memory/Notes/Things/Links; edit and Forget a memory; Forget a note and a thing (confirm mentions earlier versions); Open a thing (closes the panel); a link Open goes to a new tab; Forget a link removes its chat line (reload to see the log); a Forget that fails restores the row. Feed: mood week line draws; Coming up; days with Today and Yesterday; Forget on an action, a reminder, a mood day and a build; Show more.
  5. Settings: five lines with state lines; each page holds exactly what spec 5 says; the voice's "teach me" prompt opens Voice; Lock still works.
  6. Phone at 375 px: bar of four equal items, active label under its icon, panels sit above the bar, focusing the composer or a field hides the bar and it returns on blur. On an iPhone Safari check the same, the Search blur is not shown in phase A.
  7. Dots: add a note (ask Osmo); within a focus change Library shows the Echo dot; opening Library clears it; blocked storage shows no dot.
  8. Reduced motion (OS setting): no beating or motion, hover shows end states, panels fade.
  9. Contrast: the rail icons are readable on the lightest mood.
- [ ] Report to Gur: the switch is `NEXT_PUBLIC_OSMO_SHELL2=on` (typed by Gur in `.env.local` and Vercel; a push ships `main`, so the main agent pushes only with his OK); the old links stay until he says they can go.
