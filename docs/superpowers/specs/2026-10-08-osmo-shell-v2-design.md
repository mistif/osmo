# Osmo's shell, version 2: a rail, and rooms for ideas, goals, what he keeps, and what happened

Spec of 2026-10-08, by the main lane's design pass, for Gur. It builds on `2026-09-26-osmo-shell-design.md` (today's shell: three text links and three panels), `2026-10-07-osmo-connectors-design.md` (sections 3 to 5: the action contract, tiers and the log), `2026-10-08-osmo-artifacts-design.md` (sections 6 to 8: the alive animation, storage, "Things I made") and `2026-10-02-osmo-one-character-design.md` (section 2: his register). Nothing here is built yet. Items I could not check are marked **Unverified** and collected in section 17.

## 1. Goal and principles

Today Osmo has a room and three text links (Memory, Insights, Settings) in the top right. They worked while there was little to see. Now there is a lot: memory, notes, reminders, things he built, what he did, moods, and soon ideas and goals. This spec gives all of it a home that stays out of the way of the room.

What changes, in plain words:
- A slim **rail** on the left (a **bottom bar** on phones) replaces the three links. Seven places: Talk, Ideas, Goals, Library, Feed, Search, Settings.
- **Memory** folds into Library. The **mood week** from Insights folds into Feed. "Things I made", reminders, notes and "What I did" fold into Library and Feed. Settings becomes five short pages.
- Two new things Osmo keeps for Gur: **Ideas** (things Gur thinks out loud) and **Goals** (what Gur works toward, with progress Osmo tracks).
- **Search** looks across all of it at once.
- The room stays what it is: voice first, his heart, subtitles. Chat bubbles show only when text is on, quieter than today, and links get small cards.

Principles:
1. **One memorable thing: the rail's motion.** Seven icons, each with a small motion that means something. Everything else is quiet: plain lines of text, no card grids, no boxes, no extra color.
2. **The room is the home.** The rail and panels are visitors. Osmo stays visible and alive behind a panel, as today.
3. **His register everywhere.** First person, calm, exact, no exclamation marks (section 11).
4. **Nothing new is hidden or permanent.** Every row of every page can be forgotten. Nothing new is sent to OpenAI except what section 7 says, and the page says so.
5. **Phone first in thought.** Gur will use this on a phone; every wireframe works at 375 px wide.

Non-goals: changing how he answers or what he remembers (language's files); mail and calendar items in Library (they come later, section 8); sharing, accounts, anything for more than one person; a motion library or any new dependency.

## 2. The design plan (per the frontend-design guidance)

### 2.1 Palette: reuse what the room already has
The room's colors change with his mood (`--aura-a`, `--aura-b`, `--base` are set from `theme` in `app/assistant.tsx` and ease over 1.8 s). The rail and pages use those. I add two derived names and no new hue.

| Name | Value | Used for |
|---|---|---|
| Ground (`--base`) | mood-driven; at rest `hsl(172 30% 12%)` | the room, and panels (panel = ground with 16% of Lit mixed in, as today) |
| Lit (`--aura-a`) | mood-driven; at rest `hsl(172 38% 50%)` | the active rail item, rings, progress, focus outlines, link underline on filters |
| Echo (`--aura-b`) | mood-driven; at rest `hsl(212 38% 50%)` | the Feed's timeline line, the dot on a rail item, the second stop of a link card |
| Bone (`--bone`) | `#f3efe8` | text, resting icons at 62% |
| Ink (`--ink`) | `#0c111b` | text on bone (the user's bubble), the rail's shade |
| Rail ground (new, derived) | `color-mix(in oklab, var(--ink) 38%, var(--base))` | the rail only: a little darker than the room, so it reads as furniture, not content |

Secondary text is Bone at 60 to 72% (already how `.note` works). Errors keep `#f2b8a2`. Contrast: Bone on every Ground tint is already used by the panels; the rail's resting icons at 62% Bone on Rail ground must reach 3:1 for graphics (**Unverified** on the lightest mood tint; check each `data-tone` once, and raise the resting opacity if one fails).

### 2.2 Type: Bricolage Grotesque stays
One family, as the shell spec says; no monospace. Scale: panel title `clamp(1.9rem, 4vw, 2.5rem)`, 700, tight (`-0.035em`), as now. Block heading 1.05rem, 600, full-strength Bone (today's 0.95rem at 72% is too faint to scan on a long page). Body 1rem, line 1.5. Meta (dates, hosts, counts) 0.8rem, tabular figures. Rail labels 0.78rem, 500, sentence case. No all-caps labels, no eyebrow above headings, no numbered markers (the Feed is a real sequence, so it gets a line, section 9). Lines stay under 60 characters wide inside panels (`max-width: 34ch` on prose, as `.empty` does).

### 2.3 Layout concept
A rail of furniture on the left, the room in the middle taking all the leftover width, a panel that slides in from the right. The room keeps fitting itself into the space left of the panel (the existing `--avail` and `--fit` rule in `assistant.module.css`), now also minus the rail.

Desktop, no panel open (rail 4.25 rem wide):
```
+------+-------------------------------------------------------+
| (h)  |  Osmo                                                 |
|  *   |  Feeling calm                                         |
|  o   |                                                       |
|  =   |                    ~ heart ~                          |
|  ~   |               "subtitles as he speaks"                |
|  q   |                                                       |
|  +   |   [ Tell Osmo how you're doing ......] (mic) Send     |
+------+-------------------------------------------------------+
 Talk, Ideas, Goals, Library, Feed, Search, Settings (top to bottom; Settings pinned to the bottom)
```
Desktop, Library open (panel 28 rem, over the right of the room; the room column shifts left and narrows):
```
+------+----------------------------------+--------------------+
| (h)  |  Osmo                            |  Library       Close|
|  *   |  Feeling calm                    |  Everything  Memory |
|  o   |                                  |  Notes  Things Links|
| [=]  |        ~ heart ~                 |  ------------------ |
|  ~   |    "subtitles"                   |  You like green tea |
|  q   |                                  |  Note: call Dad     |
|  +   |  [ message .....] (mic) Send     |  Tip splitter  v2   |
+------+----------------------------------+--------------------+
```
Phone (bottom bar 3.5 rem tall plus the safe area; the active item shows its label under the icon):
```
+-----------------------+      +-----------------------+
| Osmo   Feeling calm   |      | < Settings      Close |
|                       |      | Voice                 |
|      ~ heart ~        |      | I speak with Daniel.. |
|   "subtitles"         |      | [x] Natural voice     |
| [ message ] (mic) Send|      |  ...                  |
|-----------------------|      |-----------------------|
| (h) * o = ~ q +       |      | (h) * o = ~ q [+]     |
|  Talk                 |      |                 Settings
+-----------------------+      +-----------------------+
```
On a phone a panel fills the screen **above** the bar, so the bar stays as the way to move between places and to get back to Talk. Panels below 40 rem wide are full width (today's rule).

**Alignment.** Rail icons centered in the rail. Page text left-aligned, ragged right, never justified or centered. Counts and dates in a page sit at the line end, right-aligned, tabular. The room's column stays centered in the space between rail and panel (the shell spec's rule).

### 2.4 Plan review: what I changed from my first draft
My first draft had a 2 px bar on the rail's left edge and a filled pill behind the active icon, and a card with a border for every Idea and Goal. That is the usual SaaS kit and it fights the one thing I want remembered. I changed it: **the active icon itself lights** (stroke in Lit, a soft glow in Lit) and nothing else is added; Ideas and Goals are **plain lines with a quiet second line**, like Memory is today, not cards. The one card in the whole app is the link card (2.6), because a link is a destination and deserves a clear edge. I also dropped per-row icons in the Feed (the sentence already says what happened) and kept only the line.

### 2.5 Principles for this build
The rail is the only place that moves without being asked (the Talk heart beats; the rest move when touched). Panels slide as today (0.32 s). Color comes from his mood and nothing else. Words are chosen once and reused.

### 2.6 The room: bubbles and link cards (phase D)
The room is voice first. Bubbles appear only when "Show the conversation as text" is on (`data-chat`), as today.
- **Quiet bubbles.** Rounded (the per-emotion `--radius` stays: his shape still changes with his mood), no outline and no resting glow. Osmo's bubble: Lit at 10% over transparent, Bone text. Gur's: Bone at 12%, Bone text (today it is a solid bone block with ink text, which is the loudest thing in the room). The glow stays only on the bubble being spoken (`.agent.speaking`), driven by `--voice` as now. The small tail corner stays.
- **Link cards.** When his text contains an http or https address, the address leaves the bubble and a card appears under it: the title (one line, 0.95rem, 600), the host under it (0.8rem, 60%), on a soft gradient from Lit at 26% to Echo at 22% over the ground, radius 1rem, no border, no shadow, max 22 rem wide, at most three per reply. Like Muse's cards, but with **no scraping**: no request is made to the site, no preview image, no favicon (a favicon fetch would tell the site that Gur's Osmo saw the link).
- **Title rule (pure function).** If the text before the address ends with a colon, the title is the last sentence fragment before it ("The Next.js docs:" gives "The Next.js docs", cut at 60 characters). Otherwise the title is the host without "www.". The host shown is the address's own hostname exactly as written (an odd lookalike shows as `xn--...`, which is the honest form). Only http and https; anything else stays as plain text. If removing the address leaves nothing in the bubble, the bubble is skipped and only the card shows. The whole card is one link (`target="_blank"`, `rel="noopener noreferrer"`), with a visible focus ring.
- **Voice.** What he says aloud must not read an address letter by letter. **Unverified:** whether `lib/chat/speakable.ts` (language) already drops addresses. Ask (d) in section 14.

## 3. The rail

### 3.1 Markup
- `<nav class="rail" aria-label="Osmo">` containing one `<ul>`; each `<li>` holds one real link: `<a href="#library" aria-current="page">` (anchors, because each place has a real hash address, section 4). Clicking is intercepted by the panel state so the page does not jump; middle-click and "open in new tab" still work.
- Inside each link: an `svg` 24 by 24 (`aria-hidden="true"`, `fill="none"`, `stroke="currentColor"`, `stroke-width` 1.6, round caps and joins), a `span.label` with the word (it is the link's accessible name), and, only when needed, a `span.sr` with " , something new" (hidden visually).
- Order, top to bottom: Talk, Ideas, Goals, Library, Feed, Search; Settings is pinned to the bottom by `margin-top: auto`. On a phone it is one row of seven, equal widths (about 53 px at 375 px wide, so each tap target is at least 48 px tall by 53 wide).
- The rail is a sibling before `<main>` inside the stage, `position: absolute; inset: 0 auto 0 0; width: var(--rail-w)`, with `z-index: 6` (above the panel's 5 is not needed; it never overlaps the panel). The stage gets `padding-left: var(--rail-w)` on desktop. On phones the rail is `position: fixed; bottom: 0` and the stage reserves its height as bottom padding.
- The header heart (`.heart` in the room's header) **moves into the rail** as the Talk icon, same shape (`--r1`), same idle beat and voice swell. One small heart in the app, not two (Question 4).
- A text field gaining focus on a phone (the composer, Search) hides the bar (`data-typing` on the stage, from `focusin` and `focusout`), so the keyboard never stacks on top of it. **Unverified** on iPhone Safari.

### 3.2 The seven motions
General technique: every icon is inline SVG; motion is CSS only (`stroke-dashoffset` with `pathLength="1"` on strokes, `transform` or the individual `scale`, `rotate`, `translate` properties, `transform-box: fill-box` with `transform-origin: center` for SVG parts). Each plays **once, in 400 to 700 ms**, with the easing the panels already use (`cubic-bezier(0.2, 0.8, 0.2, 1)`), when the link is **hovered, keyboard-focused, or becomes active**. The one exception is Talk, which is alive all the time because he is. On touch there is no hover: a tap makes it active and plays the active settle.

| Item | What it means | The motion, in one sentence | Technique |
|---|---|---|---|
| Talk | his heart | The heart beats with his own mood: faster when he is stirred, slower when calm. | The same blob as the old header heart; `animation: idle-heart var(--pulse) ease-in-out infinite` (scale 1 to 1.14). While `[data-speaking]` the beat stops and it swells with `calc(1 + var(--voice) * 0.9)`, as the header heart does today. |
| Ideas | a spark | Four rays draw outward from a small core, one after another, and the core flares once. | Four short strokes with `pathLength="1"`, `stroke-dasharray: 1`, `stroke-dashoffset` 1 to 0, staggered 60 ms with `animation-delay`; the core circle runs one `scale` 1 to 1.35 to 1. |
| Goals | progress | A ring fills from empty to how far you really are. | Track circle at 25% opacity; arc circle `pathLength="100"`, `stroke-dasharray: 100`, starts at the top (`rotate: -90deg`); keyframe from `stroke-dashoffset: 100` to `calc(100 - var(--fill))`. `--fill` is set from the average progress of active goals (3.4); with no goals it is 70, a plain decorative ring. |
| Library | shelves | Three shelves slide out and back like drawers, one after another. | Three horizontal strokes (with small book rectangles) animate `translate: 0 0` to `2.5px 0` to `0 0`, alternating direction, 80 ms apart. |
| Feed | what happened | A line draws itself across, then a dot lands at its newest end. | One polyline with `pathLength="1"`, `stroke-dashoffset` 1 to 0 over 700 ms, then the end dot fades in (`animation-delay: 560ms`). |
| Search | looking | A lens comes into focus: it starts soft and slightly large, then settles sharp. | The lens group: `filter: blur(1.4px)` and `scale(1.18)` to `blur(0)` and `scale(1)`; the handle stays still. **Unverified:** CSS `filter` on an SVG child in Safari; fallback is the scale alone (the blur is dropped under `@supports not`). |
| Settings | a dial | The dial turns a quarter, to a new notch. | The dial group `rotate: 0deg` to `90deg`, `transform-box: fill-box`, `transform-origin: center`; it stays at 90 while active and returns to 0 when not. |

### 3.3 States
- **Rest:** Bone at 62%. **Hover or keyboard focus:** Bone at 100%, the label appears, the motion plays. **Active** (`aria-current="page"`; Talk is active when no panel is open): the stroke becomes `color-mix(in oklab, var(--aura-a) 85%, white)` with `filter: drop-shadow(0 0 6px color-mix(in oklab, var(--aura-a) 60%, transparent))`; the settled end state of its motion stays shown (Goals ring filled, Settings dial turned, Feed line drawn).
- **Label:** on desktop it appears to the right of the icon on hover and on `:focus-visible` (a small plain text, Bone, on Rail ground at 92%, 0.78rem, fades in 120 ms; it overlaps the room or panel edge by design, `pointer-events: none`). On a phone only the active item shows its label, under the icon; the others keep their label for screen readers.
- **Quiet dot:** `data-dot` on the link draws a 0.4 rem circle in Echo at the icon's top right, fading in over 300 ms. **No numbers.** Only Library and Goals may carry it (3.4). The link's hidden `span.sr` says "something new".
- **Focus:** 2 px Lit outline, offset 3 px, the same as every control today.
- The rail never shows the shell's old `border-bottom` underline treatment.

### 3.4 What makes the dots and the ring
- **Library dot:** something was added to Library since Gur last opened Library: a new note, memory fact or thing, by `created_at` or `updated_at` newer than a "last seen" time. **Goals dot:** a goal changed (progress or done) since Goals was last opened, which is how Gur sees that Osmo updated one. "Last seen" is kept per device in `localStorage` (a per-viewer convenience: wrapped in try/catch, the dot simply stays off if storage is unavailable). The check is a few `head` count queries on load and when the window regains focus. Opening the page clears its dot. A guest never sees a dot (section 12).
- **Ring fill:** `ringFill(goals)` is the mean of `progress / target` over active goals that have a target, as a number 0 to 100 (a steps goal counts steps done over steps).

### 3.5 Keyboard and screen readers
Tab moves through the seven links in order; Enter or Space activates. Escape closes an open panel and puts focus back on its rail link. The panel's title takes focus when it opens (as today). The rail is one landmark (`nav`, "Osmo"); the room keeps `main`; a panel is `aside` with its title as its name. The room's live regions (`role="status"` mood, the log's `aria-live`) are unchanged. Labels and "something new" are read; icons are not.

### 3.6 Reduced motion
Under `prefers-reduced-motion: reduce`: every rail animation and transition is `none` except a 120 ms color and opacity change. The Talk heart does not beat or swell (like the header heart today). Hover shows the label and shows each icon's **final** state statically (the Goals ring is simply filled to its amount, the Feed line fully drawn) so the meaning is still there without the movement. Dots do not fade, they just appear. The panel's slide becomes the 0.15 s fade it already uses.

## 4. Panels and navigation

### 4.1 One Panel shell
`components/osmo/panel.tsx` keeps one `Panel` component and the hook `usePanels`, now with six panel ids: `ideas`, `goals`, `library`, `feed`, `search`, `settings` (`memory` and `insights` are retired). A route is `{ panel, page?, item? }`. Talk is simply "no panel". The panel has: an optional **Back** (only on a Settings page or an opened row), the title (`h2`, takes focus), and **Close**. The body is one of `IdeasPanel`, `GoalsPanel`, `LibraryPanel`, `FeedPanel`, `SearchPanel`, `SettingsPanel`, all using the shared `panels.module.css` lines (`.section`, `.line`, `.action`, `.note`, `.empty`); no card styles are added.

### 4.2 Deep links by hash
The address stays `/`. The panel state lives in the hash and is pure client state (nothing is fetched because of it).
- `#library`, `#library/notes` (a filter), `#library/notes/<id>` (a row, opened and briefly lit), `#feed`, `#ideas`, `#ideas/<id>`, `#goals`, `#goals/<id>`, `#search`, `#settings`, `#settings/voice`.
- Old forms still work: `#memory` becomes `#library/memory`, `#insights` becomes `#feed`.
- Unknown hashes mean Talk. **The search words are never put in the address** (nothing personal in a URL); only ids and page names are. Ids are random uuids.
- Pure functions `parseRoute(hash)` and `routeHash(route)` round-trip every valid route (tested, section 15).

### 4.3 Back, Escape, history
- Opening a place from Talk **pushes** one history entry; moving between rail items **replaces** it; opening a page or row inside a panel **pushes**. So the phone's system Back (or the browser's) goes page, then list, then Talk, as a person expects.
- **Escape** closes the whole panel and returns focus to the rail link (a field that already used Escape to cancel an edit still wins, as today: `defaultPrevented`).
- Clicking the active rail item, or Talk, closes the panel.
- The voice's "teach me" prompt calls `open("settings", "voice")` (today `panels.open("settings")`).
- The thing viewer from the artifacts spec still opens over the room; opening a thing from Library or Feed closes the panel, as Insights does.

## 5. Settings: five pages, and exactly what moves where

Settings opens on a short list of five lines, each with one quiet state line under it. Pages open inside the panel with Back. One idea per block, privacy lines where they apply, no exclamation marks.

| Page | Contents, moved from today's `settings-panel.tsx` and its children |
|---|---|
| **Devices and lock** | The "Devices" block as it is (passkey list, rename, remove with confirm, "Remember this device", its errors) and the "Lock Osmo" block (note, button, error). State line: "2 devices remember you." |
| **Voice** | `VoiceSettings` whole: his voice line, Natural voice and its privacy note, Listen for "Osmo", Show the conversation as text, Speak typed replies, Fade my words, the teaching and "forget my voice" block. In phase D it also holds one switch, "Quiet chat bubbles", default on. State line: "Natural voice on, listening off." |
| **What he may do** | The top of `ConnectorsSettings` ("What I may do": Pause everything, one level per connector with its plain meaning, the artifacts privacy line, the OpenAI line), plus the AI conversation line and token count that today sits loose in `SettingsPanel` (it is about what he sends out, so it lives here). Phase B adds two connectors to the list, **Ideas** and **Goals**, with their own levels and these lines: "To mention your goals I send up to five goal titles and your progress to OpenAI with a message. Ideas are never sent." State line: "Paused: no. 6 things on." |
| **Place and notifications** | "My place" (city search, use my location, the saved place, the Open-Meteo coordinates line) and "Notifications on this device" (turn on, test, the device list, "Hide reminder text on the lock screen" and its line), both from `ConnectorsSettings`. State line: "Saved: Rotterdam. Notifications off on this device." |
| **About** | The version line (`versionLine`), and from Insights: "Who I am" (`characterLines()`) and "Our story" (the bond's milestones, `storyLines`). |

Leaves Settings entirely: **`RemindersNotes`** ("Reminders and notes"): notes go to Library (section 8), reminders to Feed (section 9). Nothing else is dropped, and every existing line of copy keeps its words except where a section above says so.

## 6. Ideas

**What it is.** Things Gur thinks out loud with Osmo that are worth coming back to, kept as short cards: the gist, what Gur said, the date. An idea can grow into a plan or into a built thing.

**Data: table `ideas`** (migration by main, applied only with Gur's OK; the code that needs it ships after):
- `id uuid`, `user_id uuid` (default `auth.uid()`, cascade), `gist text` (1 to 120), `said text` (1 to 1000), `created_at`, `status` (`kept`, `grown`, `dropped`; default `kept`), `grown_into uuid` nullable (references `artifacts(id)`, set null on delete).
- Row-level security, owner only. The browser may **select and delete**, and **update only `status` and `grown_into`** (column grant, like `artifacts` allows `title` and `kept`). **Insert only from the server** (`/api/chat`'s action, through the owner-pinned admin client), so a card cannot be forged from the browser. Checks in the database repeat the limits. At most 300 rows (the action refuses more with a plain line).

**How an idea is captured.**
- By asking: "Keep that idea" or "save that as an idea". Or Osmo proposes it by setting a new **tier 2** action `idea_keep` with args `{ gist, said }` (a string of JSON, per the contract in connectors section 3.1). Tier 2 means it runs without asking at level "act" and waits for a yes at level "ask".
- **Code validates, never the model:** `gist` 1 to 120 and `said` 1 to 1000 characters, control characters stripped, nothing else accepted. The model's `said` is only a hint: code compares it (lowercased, spaces collapsed) against Gur's own lines in that request (the text and the history the server already receives) and, if it is not a quote of them, replaces it with Gur's last real line. So "what Gur said" is always **Gur's own words**, not a paraphrase. That needs the action's run context to carry Gur's recent lines (a small addition to `RunCtx`, main's).
- **Log line:** "Kept an idea" in "What I did" (code-written, no idea text, per connectors section 5). Daily cap: 10 (the `caps.ts` pattern).
- **Whether he may do it on his own initiative** is Question 1.
- Gur-only. A guest turn never reaches the action (section 12).

**The card.** A plain block in the Ideas panel, newest first: the gist as the first line (1.05rem, 600), what Gur said below it (0.95rem, 72%, clamped to three lines, tap to expand), the date at the end of a meta line (0.8rem). Three actions in the quiet `.action` style: **Grow**, **Set aside**, **Forget**. Filter row above: Kept (default), Grown, Set aside.

**Grow.** Tapping Grow offers two lines: "Make a plan" and "Build it".
- *Make a plan:* closes the panel and sends Osmo (as a typed message, so the whole normal path runs) "Help me plan this idea: <gist>". He answers in his voice and may propose `goal_add` with steps (section 7), which is a tier 2 action with its own log line. The idea becomes `grown` once Gur taps this (a plan was asked for; the page says "Grown into a plan").
- *Build it:* closes the panel and sends "Build this: <gist>. <said>" so the existing `build` action (artifacts spec) gets the idea as its brief. The room remembers which idea started the build; when `/api/artifacts` answers with the new thing's id, the room sets that idea's `status = grown` and `grown_into = id`. The card then reads "Became: <title>" and opens the thing.
- **Unverified:** that the model reliably chooses the `build` action from a typed "Build this". If it does not, the fallback is that Osmo says what he can do and Gur says yes; it is never silent.

**Set aside** sets `status = dropped`: the card leaves the default list and Osmo stops mentioning it; "Forget" removes the row (inline confirm "Forget this?", as Memory does today).

**Empty state:** "I have not kept any ideas yet. When you think out loud, ask me to keep one."

## 7. Goals

**What it is.** What Gur works toward, with progress Osmo tracks: a count ("23 applied") or steps (a short checklist), an optional due date. Osmo updates progress when Gur tells him, and mentions a goal when it fits.

**Data: table `goals`:**
- `id uuid`, `user_id` (default `auth.uid()`), `title text` (1 to 80), `kind` (`count` or `steps`), `target int` nullable (1 to 100000; a count goal without a target is allowed: it shows a number and no ring), `progress int` (0 or more, default 0; for steps it is the number of steps done), `steps jsonb` nullable (only for `steps`: an array of up to 12 objects `{ text (1 to 80), done boolean }`; null for `count`), `due date` nullable, `status` (`active`, `done`, `dropped`; default `active`), `created_at`, `updated_at` (a touch trigger, like `artifacts`).
- Rights as for ideas: the browser selects, deletes, and may update `status`, `title`, `due`, and tick steps (`steps`, `progress`); the **actions** insert and move progress from the server. At most 30 active goals.
- **`goal_events`** (so Feed can show progress; not optional if Feed shows goal progress): `id bigint identity`, `user_id`, `goal_id uuid` (set null on delete), `goal_title text` (a copy, so a forgotten goal's history still reads), `at`, `kind` (`added`, `progress`, `done`), `from_progress int`, `to_progress int`. Written by the server in the same step as the goal change; the browser selects and deletes.

**Actions (all tier 2, connector `goals`, log lines code-written):**
| Name | Args | Behaviour |
|---|---|---|
| `goal_add` | `title` (80), `kind`, `target` or `steps` (up to 12 strings of 80), `due` (a date, not past, within two years) | Creates the goal. Log: "Added the goal: Apply to jobs." |
| `goal_progress` | `goal` (a label such as `g1`, see below) and exactly one of `add` (1 to 1000), `set` (0 to 100000), `step` (the step's words or its number) | `add` and `set` for count goals, `step` for steps goals. Writes a `goal_events` row. Log: "Apply to jobs: 23 of 40." |
| `goal_done` | `goal` | Sets `done`; a count goal with a target is set to the target. Log: "Finished a goal." |

- **Never past the target without a yes.** If `add` or `set` would pass `target`, nothing is applied. Code answers "That would be 45, past your target of 40. Shall I raise the target to 45?" and holds the change through the existing waiting-confirmation path (`pending_actions`, ten minutes, a bare "yes" or "no" matched by code). The held action is a code-only twin (`goal_progress_raise`, tier 3) that the model cannot name. **Unverified:** that `run()` of a tier 2 action can return a `waiting` outcome in `lib/actions/core`; if not, main adds that to the action core, and it is the one change here that touches the core.
- **Labels, not ids.** The model sees each active goal as `g1 Apply to jobs: 23 of 40, due 30 October` and writes `g1`; code maps it to the real id and checks it is Gur's. An unknown label is a failed action with a plain line, never a guess.

**How the prompt is told (language writes the words; main supplies the lines).** A block is added only when Gur has active goals: up to **five** goals, one line each as above (about 25 tokens each, so under 200 tokens a turn with the rules; an estimate), after the crisis rule. The rules, in his register: "Gur's goals are listed. Mention a goal only when it fits what he is saying, never to remind him, never to push, and never more than one in a reply. If he tells you progress, set goal_progress. If he seems upset, do not mention goals." **Never nag, enforced in code too:** a line is added "You mentioned a goal recently; do not bring one up unless he does" when any of Osmo's last six lines (already in the request's history) contains a word of 4 or more letters from a goal title; and no goal is ever mentioned by the app itself (no reminders, no pushes, no Feed entry that says "you are behind"). The server reads the five lines itself, as Gur through his token (a `select` the policy allows), so the list is fresh after an update.

**The Goals page.** Active goals first, as plain lines: the title (1.05rem, 600), under it a **ring** (1.6 rem, Lit arc over a 25% track, same technique as the rail icon) with the count at its side ("23 of 40") or "23" with no target, and the due date at the line end ("due 30 October"; "overdue" in plain text if past, with no red). A steps goal shows its steps as a checklist under the title (native checkboxes; ticking one updates `steps`, `progress` and writes a `goal_events` row). Actions per goal: **Update** (a small number field and Save), **Done**, **Set aside**, **Forget**. Filter: Active (default), Done, Set aside. Empty: "You have no goals yet. Tell me what you are working toward and I will keep track."

## 8. Library: everything he keeps

A union view over tables that already exist. **No new table.**

| Kind | Source | Row shows | Forget (existing right) |
|---|---|---|---|
| Memory | `memory_facts` (key, value, updated_at) | the first-person sentence from `memory-lines.ts`; tap to edit, as Memory does today | `delete` on `memory_facts` |
| Notes | `notes` (id, text, created_at) | the note, its day | `delete` (granted) |
| Things | `artifacts` (latest of each chain, no source) | title, version, day; Open | `delete` (granted); confirm says earlier versions go too |
| Links | derived from Osmo's `messages` lines that contain an http or https address, newest first, no table | the card title (2.6 rule) and host, the day; Open opens the link in a new tab | removes that chat line (confirm: "This also removes the line from our conversation."). **Unverified:** that the browser has a `delete` right on `messages`; if not, Links shows no Forget and the confirm text is not needed |
| Mail, calendar | later (connectors phases 2 and 3) | would hold **references only** (sender, subject, date; never a body, per connectors section 5) | not in this spec |

- **Filters:** a quiet row of text buttons, "Everything", "Memory", "Notes", "Things", "Links", with `aria-pressed` and the active one underlined in Lit (the old link style). Default Everything, newest first; Memory sorts by `updated_at`. The filter is in the address (`#library/notes`).
- **Size:** each source is fetched with a limit of 100, merged by a pure function, 40 rows shown with "Show more". Nothing is fetched until the panel opens.
- **Forget** is inline and one step ("Forget this?" then Forget or Keep), as Memory and "What I did" do; failures restore the row with "I could not save that. Try again."
- **Empty:** "I do not keep anything yet. Ask me to remember something, or to make a note."

## 9. Feed: what happened, newest first

A timeline of the days, built from tables that exist (plus `goal_events`). **No new table beyond that.**

- **Top of the page:** "My mood, the last 7 days" line as it is in Insights (it is the line that draws, like the rail icon), then **Coming up**: reminders still pending, soonest first, each with Forget.
- **Then the days**, newest first, each under a plain heading ("Today", "Yesterday", "Tuesday 7 October"). Days are cut in Gur's saved time zone (`profile.timezone`), else the browser's. A thin vertical line in Echo at 40% runs down the left, with a small node per row: the content is a sequence in time, so a line is information here (as "Our story" was).
- **Sources and the sentence for each:**
  | Source | Rows | Sentence (first person) |
  |---|---|---|
  | `actions` | last 30 days | `describeAction` wording as today, shortened to the day's heading: "Done. Reminder set for 9:00: call Dad." |
  | `reminders` | status `sent` or `missed` | "A reminder went off at 9:00: call Dad." / "I missed a reminder at 9:00: call Dad." |
  | `mood_days` | one per day | "Mostly hopeful." (the day's `strongest`) |
  | `artifacts` | created | "I built Tip splitter." with Open |
  | `goal_events` | all | "Apply to jobs: 23 of 40." / "You finished: Learn the guitar chords." |
- **Forget per source:** `actions`, `reminders`, `goal_events` and `mood_days`: delete their own row (mood days: **Unverified** that the browser has a `delete` right on `mood_days`; if not, mood rows show no Forget). A build row: Forget deletes the thing itself, with the line "This also deletes the thing I built." "Forget all" exists for the actions group only, as today. Forgetting a line does not undo what was done; the page says so in one line (existing copy).
- **Not here:** the bond's milestones (they are the bond; they live in Settings, About), and ordinary chat.
- **Size:** 30 rows, "Show more" adds 30. Retention for `actions` stays 90 days (connectors section 5).
- **Empty:** "Nothing has happened yet that I can show. When I do something for you, it will appear here."

## 10. Search

One box over memory, ideas, goals, Library (notes, things, links), the chat log and the Feed (what he did).

- **How, in the database.** Postgres full-text search, using `to_tsvector('english', ...)` computed **at query time**, with **no stored columns and no new index to begin with**, in one SQL function `osmo_search(q text, lim int default 40)` declared `security invoker`, `stable`, `set search_path = ''`, returning `kind, id, title, snippet, at, rank`. Because it runs as Gur, row-level security applies to every table inside it; it cannot return anyone else's row, and it does not need the service role. It is `union all` over: `memory_facts` (the value), `notes`, `ideas` (gist and said), `goals` (title and step texts), `artifacts` (title only, never source), `messages` (Gur's and Osmo's lines, rows with `speaker = 'guest'` excluded), and `actions` (summary). Mail and calendar are not searched (they are not stored).
- **Why query-time.** At Osmo's size (one person; likely a few thousand rows in all) computing the vector as it searches is fast enough and adds nothing to migrate or keep in sync. If `messages` grows slow, the fix is one expression index on `messages` (`to_tsvector('english', text)` is immutable) and the function is unchanged. (My decision 2.)
- **The query builder is plain code.** `searchQuery(input)` (pure) turns what Gur typed into a safe `to_tsquery` string: letters and digits only, each word `&`-joined, the last word given a prefix match (`appl:*`, so results appear while typing), words over 40 characters or more than 8 words cut, anything empty returns null (no request). Gur's text is never put into SQL as such.
- **Ranking.** `ts_rank_cd` with the title or gist weighted A and the body B, times a small recency lift (`1 + 1 / (1 + age_in_days / 30)`), times a kind weight: memory, ideas, goals, notes, things 1.0; links 0.9; messages 0.6; actions 0.5. Matching is by words and stems ("applied" finds "apply"); it does not understand meaning. Said plainly on the page when nothing matches.
- **The UI.** Search panel; a single `type="search"` field at the top, focused on open, labelled "Search". Starts after two characters, 200 ms after typing stops. Results are grouped by kind, in this order: "In what I remember", "In your ideas", "In your goals", "In what I keep", "In our conversation", "In what I did". At most five rows per group with "Show all 12". Each row: the title or the best snippet (about 140 characters around the match, matched words in 700 weight; highlighting is done in the browser, not by `ts_headline`, to keep the query cheap) and the date. Arrow keys move through rows; **Enter opens the highlighted row's page** (the first row is highlighted at first), as a deep link such as `#ideas/<id>` or `#library/notes/<id>`, which scrolls the row into view and lights it for 1.2 s (a plain fade in Lit; none under reduced motion). A conversation hit cannot be opened in the room (the log does not scroll back to old lines), so it shows its text in place with the date, and Enter skips it. A short line says "Search stays between you and your memory. Nothing goes to OpenAI."
- **The phone.** The field sits at the top; the bottom bar hides while it has focus (3.1) and returns when it loses it; results scroll under the field; the system Back closes Search.
- **Unverified:** that Supabase's Postgres has the `english` text search configuration enabled (it normally does); the real time of the function on Gur's data (target under 150 ms, measured on a branch before shipping); and that `messages` has the columns assumed (`role`, `text`, `speaker`, `created_at`; the code reads them today).

## 11. Register and copy rules

Everything follows the character sheet (one-character spec, section 2.1), applied to interface text:
- First person for what he knows or did ("I have not kept any ideas yet."). Second person for what Gur can do ("Ask me to keep one."). No exclamation marks, no emoji, no slang, full forms ("cannot", "do not").
- Sentence case everywhere. Headings are plain nouns. No all-caps, no eyebrows, no numbered steps.
- **One verb for one act, everywhere:** **Open**, **Grow**, **Set aside**, **Forget**, **Keep**, **Back**, **Close**, **Show more**, **Save**. "Forget" replaces "Delete" for things made (today's "Things I made" says Delete), so one word means "remove it for good" across Library, Feed, Ideas and Goals. "Set aside" is the soft version for ideas and goals (the database value is still `dropped`).
- Errors say what happened and what to do, with no apology: "I could not save that. Try again." / "I cannot reach my memory right now. Try again in a moment." (both exist).
- Dates in the existing speakable style ("Thursday 8 October, 09:00"; short form "8 Oct").
- Empty states are invitations with one concrete thing to say (sections 6 to 9).
- Counts are written as words in a sentence ("2 devices remember you" is acceptable as a state line; a bare number on a badge is not allowed anywhere: dots carry no numbers).

## 12. Guests and crisis

- **Guests.** Nothing here is for a guest. A guest's spoken line never reaches `/api/chat` (the room's existing rule), so it cannot keep an idea or move a goal, and the goals block is not in a guest's turn (a guest turn uses the rule-based chain and empty memory). While the voice judges the speaker to be a guest, the rail's dots are hidden and any open panel is closed, so Gur's memory and goals are not on the screen for someone else. **Unverified:** that the voice engine exposes "a guest is speaking" to the room as a state the shell can read; if not, the panel-closing part waits for speaking and main to agree an interface.
- **Crisis.** Nothing new. The crisis check stays code and first; a crisis turn runs no action (connectors section 4.3), so no idea or goal is written; the goals block says not to mention goals when he is upset and sits after the crisis rule; a fixed crisis reply has no link, so no card.

## 13. Phases

The old three links stay until the rail is done, behind one build-time switch, `NEXT_PUBLIC_OSMO_SHELL2` (name only; Gur types the value in Vercel; `on` shows the new shell, anything else the old). The lanes rule applies: a push ships everything on `main`, so unfinished work stays dark. The rail grows as pages arrive: only items whose page exists are shown (so there are no "coming soon" pages).

| Phase | Contents | Gate | What Gur sees when it lands |
|---|---|---|---|
| **A** | The rail (4 items: Talk, Library, Feed, Settings) with its motion, hash navigation, Settings in five pages, Library and Feed from existing data (memory, notes, things, links; actions, reminders, mood, builds). Old Memory and Insights panels removed. No migration. | `NEXT_PUBLIC_OSMO_SHELL2=on`; removed once Gur says the old links can go | A rail with a beating heart; Library holding what Memory held, plus notes and things; Feed with the mood week and "What I did"; Settings as short pages |
| **B** | Ideas and Goals: both tables and `goal_events` (migration first, Gur's OK), the four actions, the prompt lines, the two pages, two rail items, the connectors "Ideas" and "Goals" in What he may do. | The new connectors start **off**; also needs `OSMO_CHAT=on` and `OSMO_ACTIONS=on` | Two more icons; saying "keep that idea" or "I applied to Meta" leaves a card or a moved ring, and a line in Feed |
| **C** | Search: the `osmo_search` function (migration, Gur's OK), the builder, the panel, the rail item. | Nothing (read-only on his own data) | A seventh icon; one box that finds things anywhere |
| **D** | Quiet bubbles and link cards, and the "Quiet bubbles" switch. | The switch (default on); links need nothing | Calmer chat; a link he gives is a small card |

Order after A is Gur's call (Question 5). Version numbers follow the project rule (patch per push, minor when a feature switch goes on).

## 14. Lane split (per `brain/lanes.md`) and the Asks

- **Main (everything in the shell and the data):** `components/osmo/*` (rail, panel, the six panels, link cards), `app/assistant.tsx` and `assistant.module.css` (the room's markup, `--rail-w`, `data-typing`, `data-guest` handling, bubble restyle), `lib/shell/*` (route, rail, library, feed, search, ring, link-card), `lib/ideas/*` and `lib/goals/*` (validators, the four `Def`s in the registry, prompt lines), the `CONNECTORS` list, every migration (`ideas`, `goals`, `goal_events`, `osmo_search`; the SQL is posted for Gur's OK, only main applies it), the Search/Library/Feed UI.
- **Language (words, not storage):** (a) the four new action names are accepted by `turnFormat(enabledNames)`; they arrive from main's registry through `listEnabledActions`, so language confirms by test that `turn-schema.ts` carries them; (b) the prompt: the `idea_keep` and goal rules (sections 6 and 7), the goals block position (after the crisis rule) and the cooldown line, and "give a link as a full address after a short name and a colon" (2.6); (c) the handler reads the goals lines from main's helper; (d) `speakable.ts` keeps addresses out of speech. **Note: the request said three new action names; the design has four** (`idea_keep`, `goal_add`, `goal_progress`, `goal_done`).
- **Speaking:** nothing.
- **Asks to post on the desks:** to language: items (a) to (d). To main (own desk): the migrations. To Gur: the switch name `NEXT_PUBLIC_OSMO_SHELL2`, and the answers in section 16. Shared files go under Now before editing: `app/assistant.tsx` (main's markup), `lib/actions/types.ts` (a `said` field on the run context), `lib/actions/core` only if the waiting outcome needs it.

## 15. Tests per piece (vitest only; pure functions, in the repo's `*.test.ts` style)

- **`route.ts`:** `parseRoute` and `routeHash` round-trip every valid route; `#memory` and `#insights` map to their new homes; unknown and malformed hashes mean Talk; a search term can never appear in a route.
- **`rail.ts`:** `railItems(route, dots, shipped)` gives the right active item (Talk when no panel), only shipped items, the dot only on Library and Goals, `aria-current` only on the active one.
- **`ring.ts`:** `ringFill` clamps 0 to 100, ignores goals with no target, counts steps goals as done over total, returns the decorative default with no goals; `dashOffset` gives `100 - fill`.
- **`library.ts`:** `mergeLibrary` sorts newest first across kinds, filters by kind, limits per source and total, takes only the latest of each thing chain; `extractLinks` finds http and https addresses in Osmo's lines only, drops other schemes, strips trailing punctuation, dedupes.
- **`link-card.ts`:** title from "Name:" before the address, else the host without "www."; cut at 60 characters; at most three cards; a bubble left empty is dropped; a lookalike host is shown as written.
- **`feed.ts`:** `buildFeed` merges all sources, groups by day in a given time zone (a row near midnight lands on the right day), pending reminders go to "Coming up", missed and sent word correctly, goal events render the right sentence, and each item says which source's delete applies.
- **`search.ts`:** `searchQuery` strips operators and quotes, handles `&`, `:`, `'`, `\`, unicode, adds the prefix to the last word only, caps words and length, returns null for empty; `highlight` marks matched stems without breaking on regex characters.
- **`lib/ideas`:** `idea_keep` check enforces the limits, strips control characters, rejects empty, and replaces a `said` that is not a quote of Gur's own lines with his last real line.
- **`lib/goals`:** `goal_add` limits and the 12-step cap; `goal_progress` add, set and step; overshoot is detected and not applied; label mapping `g1` to an id and an unknown label fails; `goalPromptLines` returns at most five, in order, with the right wording; the cooldown line appears exactly when a goal word is in the last six Osmo lines.
- **`dots`:** `hasNew(seen, latest)` is false with no storage and false when nothing is newer.
- **Not vitest:** the motion, the layout and the SQL are checked by hand by main in the browser pane (desktop, 375 px, reduced motion, each mood tone) and with `execute_sql` on a branch (another user sees no row; `osmo_search` as `authenticated`; timing). Gur checks the phone by hand.

## 16. Open questions for Gur (choose a letter)

1. **Should Osmo keep an idea on his own, or only when you ask?** A: only when you ask. B: he may also keep one when you have spoken at some length about a thing you might make or do, at most three a day, and he tells you each time. (I would pick B: it is what "Osmo proposes" asks for, and the cap and the line keep it honest.)
2. **How should the rail look while the pages are still being built?** A: it grows as pages arrive (four items first, then Ideas and Goals, then Search). B: all seven from day one, the unfinished ones showing a short "not yet" page. (I would pick A.)
3. **A link in Library: should Forget remove the chat line it came from?** A: yes, with a warning. B: no delete for links, they only disappear when you clear the conversation. (I would pick A, if the browser is allowed to delete messages.)
4. **Should the small heart in the header move into the rail as Talk's icon?** A: yes, one heart. B: keep both. (I would pick A.)
5. **After the rail, which first?** A: Ideas and Goals, then Search. B: Search, then Ideas and Goals. (I would pick A: it is the part with the new tables, and the longest to settle.)

**Decisions I made myself (tell me if you disagree):**
1. **"Our story" and "Who I am" go to Settings, About** (not Feed), because they are about him, not about what happened to you, and the bond's milestones should not be deletable.
2. **Search computes its text vectors at query time,** with no stored columns or index to start with.
3. **The panels are states in the page's hash, not separate routes,** so the room, the voice engine and the microphone are never torn down by moving between places.

Smaller calls, in the text above: the new connectors start off; "Forget" for every removal and "Set aside" for soft removal; the rail grows with the pages; Feed rows never show a number of any kind in a badge.

## 17. Unverified (collected)

1. Contrast of resting rail icons (Bone at 62% on Rail ground) on the lightest mood tint (2.1).
2. CSS `filter: blur` on an SVG child in Safari, for the Search lens (3.2); the fallback is scale only.
3. iPhone Safari: hiding the bottom bar when a field has focus, and `position: fixed` with the keyboard (3.1).
4. Whether the browser has `delete` rights on `messages` (Library Links, 8) and on `mood_days` (Feed, 9); read from the live grants before building.
5. Whether `run()` of a tier 2 action can return a `waiting` outcome in the action core, for the "never past the target without a yes" rule (7).
6. That the model reliably picks the `build` action from a typed "Build this" (6); and how reliably `idea_keep` is chosen without being asked (Question 1).
7. Strict mode accepting the four extra names in the action enum is the same open item as connectors section 16, item 2; it is not a new risk.
8. Whether `lib/chat/speakable.ts` drops web addresses from speech (2.6).
9. Whether the voice engine exposes a guest speaking as state the room can read (12).
10. That the `english` full-text configuration is available, and the real time of `osmo_search` on Gur's data (target under 150 ms) (10).
11. Whether `localStorage` "last seen" for the dots is acceptable per device, or Gur wants it to follow him across devices (it would then need a column on `profile`) (3.4).
12. Costs: the goals block is about 200 tokens a turn and the idea rule about 40 (estimates; the existing probe script can measure them). Nothing else here calls a model.
