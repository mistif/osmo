# Osmo artifacts: design

Date 2026-10-08. Status: draft for Gur to read; no plan and no code until he approves it. Written for Gur, who is not a specialist: plain words first, file names after. Anything I could not check is marked **Unverified** and collected in section 15. This spec reuses the connectors spec (`2026-10-07-osmo-connectors-design.md`, sections 2 to 5): the `action` field, the tiers, the pause switch and the `actions` log. Where this spec says "as in the connectors spec" it changes nothing there.

## 1. Goal, and what this is not

**Goal (Gur, 2026-10-08).** Osmo can make small working things for Gur: a tip splitter, a countdown, a unit converter, a little game, a page of calculations. The thing is code. It runs in the room, beside Osmo, while the conversation carries on. Gur asks in words ("make me a tip splitter"), Osmo says one short sentence, and the thing grows on screen over 10 to 25 seconds. Gur can then use it, keep it, throw it away, or say "make the button bigger" and get a changed version.

**How it works, in one paragraph.** A second model call writes one React component (React is the toolkit most modern web pages are built with). The room turns that text into something the browser can run, and runs it inside a locked box (an iframe with the sandbox switched on) that cannot see Gur's account, his memory, his messages or the internet. Code decides everything that matters; the model only writes the thing.

**What it is not, in version 1:**
- **No hosting and no sharing links.** A thing exists only inside Gur's own room. There is no public address for it and nobody else can open it.
- **No network from inside a thing.** It cannot fetch, post, load an image from the web, or talk to a server.
- **No access to Gur's data from inside a thing.** It cannot read his memory, his chat, his reminders, his notes or his cookies. It starts blank every time it opens.
- **No saving state inside a thing.** A counter resets when the thing is reopened. (A later spec could add this, safely, through the room.)
- **No new permissions for Osmo.** Building a thing touches nothing outside the room. It spends only tokens from the daily allowance.
- **No guests.** A guest cannot make Osmo build anything (section 9).

## 2. Architecture

**In words.** Five parts. The **room** (the browser) asks, shows, compiles and runs. The **`/api/build` route** is the only place that calls the model for a thing; it streams the text back as it is written. The **`/api/artifacts` route** checks a finished thing once more and saves it. The **`artifacts` table** in Supabase holds the saved things. The **sandbox frame** is the locked box; it loads a small **runtime** (React and a tiny bridge) from Osmo's own site, never from anyone else's.

```
  Gur: "make me a tip splitter"
     |
  Room --- /api/chat (turn: reply + action "build") ------------------> model call 1 (the usual turn)
     |       runAction validates: level, pause, daily cap
     |
     +--- POST /api/build {brief, from?} ---> reserve tokens -> model call 2 (writes the component, streams)
     |         <--- NDJSON stream of source text <---------------------+
     |
  Room: draws the outline as bytes arrive -> Sucrase turns JSX into plain script (in the room, not in the frame)
     |
     +--- builds the frame page (srcdoc) ---> [ sandbox frame: runtime.js from our site + the component ]
     |                                              | postMessage: ready, title, height, error only
     +--- POST /api/artifacts {source,title,from?} -> check again -> artifacts table -> actions log "Built <title>"
```

**Where the runtime comes from.** React 19 no longer ships a ready-made single-file browser build (I checked: this repo's `react` 19.2.8 and `react-dom` have no `umd` folder). So main adds a small build step that bundles React, ReactDOM and the bridge into one file, `public/artifact/runtime.<hash>.js`, served by Osmo's own site with a long cache. The transpiler (section 3) is a normal dependency that Next puts into its own downloadable chunk, loaded the first time a thing is made. Nothing comes from a third-party CDN.

**What is stored where.** Source text: the `artifacts` table. The brief (Gur's wording of what to build): nowhere. It travels in the request and is gone, like a chat message. The compiled script: nowhere (section 7). Tokens: the same `ai_calls` ledger as chat.

## 3. The build flow, step by step

1. **The turn.** Gur asks for something that runs. Model call 1 (the usual strict JSON turn) sets `action` to `{ "name": "build", "args": "{\"brief\": ..., \"from\": ...}" }` and writes the **holding sentence** as its reply, in Osmo's voice, for example "Certainly. I will start on that now, and it will appear beside me." Allowlist name `build`, tier 2 (act without asking), connector `artifacts`.
2. **Code decides.** `runAction` (main) checks the args (brief 1 to 500 characters; `from` empty or one of Gur's recent things), the `artifacts` level in Settings, the pause switch, and the daily cap. Refused means a plain code line replaces the holding sentence ("My building is switched off in Settings."). Allowed means the answer carries a **build ticket** (the validated brief and `from`) and the room starts the build. The chat is never held: `thinking` ends when the holding sentence arrives, and Gur can keep talking while the thing grows.
3. **The stream.** The room POSTs `/api/build` with the ticket (Gur's bearer token). The route re-checks everything itself (owner, `OSMO_BUILD=on`, level, cap, allowance), loads the previous source if `from` is set (read as Gur, so row-level security applies), books an upper-bound token estimate in the ledger, and calls the model with streaming on. It forwards text as lines of JSON (NDJSON): `delta` (a piece of source), then one final `done` (tokens used) or `error` (a short code).
4. **The outline.** As bytes arrive the room counts the page elements the source has opened so far and draws that many outline blocks (section 6). The first line of the model's output is a title comment; the room reads it as soon as it arrives and shows the title above the sketch.
5. **Compile.** When the stream ends, the room checks the source (size, allowed imports, forbidden words) and runs **Sucrase** on it, in the room's own page, never in the frame. The frame receives only finished script.
6. **Render.** The room builds the frame page and sets it as the frame's `srcdoc`. The runtime mounts the component inside an error boundary. The frame sends `ready`, then `height`. The sketch fades into the real thing.
7. **Save.** The room POSTs `/api/artifacts` with the source, the title and `from`. The route checks it again (it compiles it too, with the same Sucrase, so nothing that does not compile is ever stored), saves a new row (a new version when `from` is set), and writes the log row "Built Tip splitter" (no brief text). The reply carries the id and version. Keep and Discard appear (section 8).

**Failure paths.** Every one ends with one plain line in his voice, no exclamation mark, and an `actions` row (`failed` or `refused`).

| What goes wrong | What happens | His line |
|---|---|---|
| **Compile error** | One automatic repair call with the compiler's message (section 5). If the repaired source also fails, stop. | "I could not get that to work. Shall I try a different approach?" |
| **Runtime error** (the thing breaks while running) | The error boundary inside the frame catches it and sends `error`. No automatic repair. The panel offers Repair, which makes the same single repair call, once per thing. | "Something I built has stopped working. I can try to repair it." |
| **Source over 12 KB** | The route cuts the stream at the cap, settles the tokens, saves nothing. | "That came out larger than I allow, so I stopped. Could you ask for something smaller?" |
| **Allowance short** | Refused before any call, as in chat (`fits` fails). The plain line replaces the holding sentence in the panel. | "I have used my share for today, so I cannot build that now." |
| **Daily build cap reached** | Refused by `runAction`; no call. | "I have reached today's limit for building." |
| **Model or network failure** | Stream ends without `done`. The partial text is dropped. Tokens stay booked at the estimate, as in `handler.ts`. | "I could not finish that just now. Would you like me to try again?" |
| **Another build running** | One at a time. The second ticket is declined in the room. | "I am still building the last one." |
| **Crisis message mid-build** | The stream is aborted, the panel closes without a line, the crisis reply stands alone (section 9). | none |

**Transpiler: Sucrase, Babel standalone, or esbuild-wasm?** All three are MIT licensed (free to use in a private app). The sizes below are my recollection, not measured here.

| | Sucrase | @babel/standalone | esbuild-wasm |
|---|---|---|---|
| Size in the browser (minified) | a few hundred KB, roughly 100 KB sent compressed | about 3 MB, roughly 0.8 MB sent compressed | the engine file is about 10 MB or more |
| Speed | very fast; its authors claim many times faster than Babel | slow to start, then moderate | fast once loaded, but starts slowly |
| On an iPhone | light; fine | heavy parse and memory; risky on older phones | heaviest; the largest memory spike |
| Errors | a short message with line and column | the best, with code frames | very good |
| Does what we need | JSX and TypeScript to plain script; turns `export default` into something the runtime can pick up | the same, and more | the same, and more |

**Choice: Sucrase** (my decision 1, section 14 of this spec lists it). We need only two things done: remove JSX/types and read `export default`. Sucrase does exactly that, is the smallest by far, and is the one that will not hurt on an iPhone. What it lacks (deep syntax checking, polished error text) costs little: the error boundary catches runtime breakage, and the repair call only needs a short message with a position. Babel and esbuild-wasm are the fallbacks if a probe shows Sucrase mangling what the model writes. **Unverified:** all sizes and speeds above, and Sucrase's behaviour on the model's real output (probe in phase A).

## 4. The sandbox

**The frame.** An iframe with `sandbox="allow-scripts"` and nothing else: no `allow-same-origin`, `allow-forms`, `allow-popups`, `allow-modals`, `allow-top-navigation` or `allow-downloads`. Also `allow=""` (no camera, microphone, location or the like) and `referrerpolicy="no-referrer"`. Without `allow-same-origin` the frame gets an empty, one-off identity ("opaque origin"): to the browser it is a stranger, even though the room put it there.

**Delivery: srcdoc, not a blob address and not a separate page** (my decision 2). The room builds the whole frame page as text and sets it as `srcdoc`. Why: (a) a separate frame page would be refused by Osmo's own header that forbids all framing (`next.config.ts` sends `X-Frame-Options: DENY` and `frame-ancestors 'none'` on every address), and loosening that for one address is a change to a security header; (b) a blob address needs `blob:` allowed in the policy, which is a wider door; (c) srcdoc has no network response, so those two headers do not apply to it. **Unverified:** that iOS Safari and current Chrome apply (c) as I expect, and that a srcdoc page inherits no policy from the room that would block it. If (c) fails, the fallback is a dedicated frame address with its own two headers, which is main's change in `next.config.ts`.

**Why a nonce, not `'self'`.** The frame has an opaque origin, so `'self'` may match nothing. Each time a thing opens, the room makes a fresh random nonce (a one-use password) and puts it on exactly two script tags: the runtime file and the thing's own script. The policy then lets in only scripts carrying that nonce. The runtime is still fetched from Osmo's own site (the web address is absolute); a script fetch needs no permission from the site.

**The policy, put in the frame page's first line as a meta tag:** `default-src 'none'; script-src 'nonce-<N>'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'`. `style-src 'unsafe-inline'` is needed because React writes styles inline; with every other source closed, a style cannot carry data out.

**What "no network" means, and how each door is shut.**
- fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon: shut by `connect-src 'none'`.
- Images, fonts, audio, video, plug-ins, frames, workers from the web: shut by `default-src 'none'` and the listed sources, which allow only data already inside the page.
- Forms and popups: no `allow-forms`, no `allow-popups`, and `form-action 'none'`.
- Changing the room's address: no `allow-top-navigation`, so the frame cannot move the room.
- Links: the runtime catches every click on a link and cancels it, so a thing cannot lead Gur's frame to another site.
- Cookies, localStorage, the Supabase login: the room's login lives in the room's storage; the frame's opaque identity cannot read it, and the runtime has no code for it. A thing that tries `localStorage` gets an error and nothing else.
- **The one gap I know of.** The browser still lets a framed page send itself to another address (the old `navigate-to` rule was dropped by browsers). A thing could do this on purpose and carry what the model knew: only Gur's brief and the previous source, since the build prompt carries nothing else (section 5). Defences, in order: the forbidden-words scan catches the obvious attempts; the runtime blanks `location` changes it can see; and the room counts the frame's load events and tears the frame down if it loads twice. That is detection, not prevention. Question 3 and the unverified list touch on it.

**The bridge.** The only way in or out is `postMessage`, and only four messages leave the frame: `ready`, `title` (text up to 60 characters), `height` (a number), `error` (text up to 200 characters). The room accepts a message only if it came from that frame's own window, carries that open's nonce, has exactly the expected shape, and fits the limits; everything else is dropped silently. Nothing goes into the frame after it is built (no commands, no data). Heights are clamped (160 pixels up to 70% of the screen height or 560 pixels, whichever is smaller; the frame scrolls inside).

**Looks.** At open, the room writes Gur's current aura colours into the frame page as variables (`--osmo-a`, `--osmo-b`, `--osmo-bg`, `--osmo-ink`) so a thing can match the mood. They are fixed for that open.

**Defence in depth inside the frame.** Before the thing runs, the runtime removes `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `open` and `eval` from the frame's window, and the `require` it offers answers only for `react`. These are belts; the policy and the sandbox are the braces.

## 5. The model contract for a component

**The rules the component must follow (checked by code, not trusted):**
- One file. Exactly one `export default` that is a component taking **no props**. Plain JavaScript with JSX; TypeScript syntax is allowed and removed.
- **Imports:** only `react`, and only its hooks and `memo`, `useId`, `Fragment`. Anything else (including any web address or `import()`) fails the check. Whether to add a small chart helper is question 1.
- **Size:** at most 12,288 bytes of source (about 12 KB; roughly 3,500 tokens).
- **Forbidden words**, scanned in the source before compiling: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`, `eval`, `Function(` , `import(`, `window.top`, `window.parent`, `parent.`, `top.`, `document.cookie`, `localStorage`, `sessionStorage`, `indexedDB`, `location`, `history`, `postMessage`, `navigator`. The scan is a speed bump for honest mistakes; a false hit (the word "location" in a sentence) just triggers the repair call, which says which word to avoid. The sandbox, not the scan, is the wall.
- Look and copy: use the `--osmo-*` colours or plain neutral ones; no external fonts or images.

**The output format.** Plain text, no fences, no commentary. The first line is `// title: ` followed by two to five words (no punctuation), then the component.

**The build prompt (language writes the final text in `lib/chat/build-prompt.ts`; the draft below shows what it must say).** In Osmo's register (one-character spec, section 2):
> You write one small React component for Osmo's room. Output only the component, preceded by one comment line giving a title of two to five words. The component is the default export, takes no props, imports only from react, and stays under 12 kilobytes. It runs in a sealed frame with no network, no storage and no access to anything outside itself, so keep all state in memory. Use plain inline styles; you may use the colours var(--osmo-a), var(--osmo-b), var(--osmo-bg) and var(--osmo-ink). Make it work on a phone screen. Every word the thing shows to a person is written in Osmo's voice: calm, exact, understated, in complete sentences or short plain labels, with full forms such as "do not" and "cannot". Never use an exclamation mark, an emoji, slang or a symbol that a voice would read out. Do not praise the person or the thing. Brief: {brief}.

When `from` is set, the prompt adds: "Here is the current source. Change it as the brief asks and return the whole new component." followed by the previous source.

**The repair prompt.** The same rules, plus: "This source failed with: {error}. Return the whole component, corrected. Change only what is needed." followed by the failing source. The error text is cut to 300 characters, and it is the compiler's or the scan's message, never Gur's words. One repair per build; one repair per runtime failure on request.

**What the model is never given:** Gur's name, memory, mood, history, other things, or any key. Only the brief, the previous source when asked, and the fixed rules. Settings gets one line saying so.

**Honesty about quality.** A small model writing a working 12 KB component in one go will sometimes fail. That is what the repair call and the probe (section 13) are for. **Unverified:** how often the allowlisted `gpt-5.4-mini` does it well; phase A's probe measures this on 30 realistic briefs before phase B ships.

## 6. The alive animation

**The idea.** The thing is not a spinner. It is drawn into being beside Osmo as the model writes it, and it breathes in time with him. Everything below is CSS and a few attributes; no new motion library.

**Attributes and variables (main adds them to the stage in `app/assistant.tsx`, `figure.module.css`, `assistant.module.css`):**
- `data-building` on the stage (the element that already has `data-tone`, `data-speaking`, `data-panel`): present from the first byte until the thing is rendered or the build fails.
- `data-built` on the stage: set for 1.6 seconds after the thing renders (the settle).
- `--build-progress` (0 to 1) on the stage, written by the room at most 30 times a second, as the room already writes `--voice`.
- `--build-blocks` (0 to 12, integer): how many outline blocks to show.
- `--quicken` on the stage: 1 at rest, 1.3 while `data-building`. Registered as a number so it eases (the stage already eases `--aura-a` this way).
- The panel (`data-thing-state="building" | "ready" | "failed"`) has its own class module, `thing.module.css`.

**What moves.**
1. **Outline.** Inside the panel, a sketch of 12 slots (a frame, a heading, rows, a button, a footer). Each slot is an SVG stroke with a length of 1. Slot number i draws in when `--build-blocks` passes i, with a stroke offset easing from 1 to 0 over 400 ms. `--build-blocks` comes from the pure function `sketchBlocks(sourceSoFar)`, which counts the page elements the source has opened (the `<` followed by a letter), capped at 12. So the drawing follows what is actually being written.
2. **Fill and shading.** A wash of `--aura-a` rises from the bottom of the sketch; its opacity is `--build-progress` mapped through a smooth curve (nothing before 0.2, full at 1). A soft highlight sweeps across the sketch once per `--pulse`.
3. **Pulse.** The panel's glow breathes with `animation-duration: var(--pulse)`, the same variable the orbs and the heart use (`heartbeat var(--pulse)`), so the panel, the heart and the room rise and fall together. It never fights the speaking motion: `[data-speaking]` already stops the heart's idle breath and the panel's glow stays gentle.
4. **Rings.** `[data-building]` raises `--quicken`, and the ring spin duration divides by it (an added `/ var(--quicken, 1)` in the existing formula): the rings turn about 30% faster. It eases back over 800 ms when the build ends.
5. **Settle.** On completion `data-built` triggers one slow swell of the panel (scale 1 to 1.03 and back over half a pulse), the sketch dissolves into the live frame over 500 ms, and the heart takes one deeper beat. Then everything returns to rest.

**Progress is a pure function** (`lib/room/build-progress.ts`, main): `buildProgress(bytes, expected)` returns a number that rises smoothly with bytes received, never reaches 1 on its own (it stops near 0.95), and is set to 1 only by completion. `expected` is the previous source's length when changing a thing, else 4,000. The room has no way to know the true length in advance, and this keeps the motion honest: it slows rather than lying about being finished.

**Layout.**
- **Wide screens (the room is wider than about 68 rem):** the panel sits to the right of the conversation column, in the space beside the figure's aura, up to 26 rem wide. If the Memory, Insights or Settings panel opens, the thing steps aside and shrinks to a small chip with its title; closing the panel brings it back. (Question 2.)
- **Phones and narrow windows:** the panel sits **below the figure**, as a card above the composer, about a third of the screen high; the conversation log above it shrinks. **Tap the card** and the thing goes **full screen** (an overlay over the room, with Close and the Keep/Discard bar at the bottom). Close returns to the card.
- **Reduced motion** (`prefers-reduced-motion: reduce`): no stroke drawing, no pulse, no quickening, no swell. The panel shows a still outline and the title, and when the thing is ready it **fades in over 200 ms**. A hidden status line says "Building" and then "Finished: <title>" for screen readers (`aria-busy` while building).

## 7. Storage

**Table `artifacts`** (main writes the migration; Gur approves it before the code ships):
- `id` (uuid), `user_id` (Gur), `title` (1 to 60 characters), `kind` (only `'react'` for now), `source` (text, at most 12,288 bytes), `version` (1 to 99), `parent_id` (the version this one came from, empty for the first), `kept` (true or false), `created_at`, `updated_at`.
- **Not stored:** the brief, the compiled script, any model text besides the source.

**Compile on every open, or store the compiled script? Compile on every open, and cache it in memory for the session** (my decision 3). Reasons: compiling 12 KB with Sucrase is quick (my estimate: well under 100 ms; unverified); storing only source means one thing to keep safe and to check; and every open runs today's checks, so if the forbidden-words list or the policy gets stricter later, old things are covered at once. The cost is a repeated small piece of work, never a network call.

**Rights (row-level security, owner only):**
- **select:** the owner. Lists in Insights ask for every column except `source`; opening one asks for the source of that single row.
- **update:** the owner may change `title` and `kept` only (column rights).
- **delete:** the owner.
- **insert:** nobody in the browser. Only `/api/artifacts` inserts, using the server-only admin client from the connectors spec (decision 1 there, question 1 there). If Gur declines that decision, the route inserts as Gur through his token with an owner-only insert rule instead; the database limits below make that safe too.
- **Database limits (checks):** `source` at most 12,288 bytes, `title` 1 to 60 characters, `kind` is `'react'`, `version` 1 to 99. The route also refuses a 201st saved row for Gur ("You have as many things as I can keep. Please delete one first."), so storage tops out near 2.4 MB.
- **Retention:** none; things stay until Gur deletes them. Exception, only if Gur picks "Discard by default" in question 4: a row with `kept = false` older than 24 hours is removed by the daily clean-up that the connectors spec already schedules.
- **Versions:** a changed thing is a new row with `parent_id` set and `version` one higher. The latest of a chain is the row nobody points to. Discarding a version removes that row only, which returns Gur to the one before.

## 8. "Things he made" in Insights, and the full-screen view

**In Insights** (main's `insights-panel.tsx`), a new section **"Things I made"** under "What I did": one row per thing (its latest version): title, version, the day, and two buttons, Open and Delete. Delete uses the one-step inline confirm that Memory and "What I did" already use. Empty state: "I have not made anything yet. Ask me for something small."

**Full-screen view.** Open (from Insights, the card on a phone, or the chip on a wide screen) shows the thing large with a bar: Close, Keep or Discard (only for a thing just built), Delete (for a saved one), and an "Earlier versions" list when the chain has more than one (each opens that version, read-only). A thing opened later is compiled again and runs fresh.

**Right after a build.** Two buttons appear under the card: **Keep** and **Discard**. With the default in question 4, the recommended one, the thing is already saved and kept; Discard removes it (that version only). Nothing is lost by ignoring the buttons.

**Changing a thing by asking.** Gur says "make the button bigger". The chat request already carries a short list of his recent things (up to five, titles and versions, sent by the room); the model sees them as `t1 Tip splitter (version 2)` and sets `from` to `"t1"`. Code turns the label into the real id and checks that it is Gur's; the model never copies an id. `/api/build` loads that row's source, puts it in the build prompt, and the result is saved as a new version (`parent_id` = that row). A `from` that does not resolve is treated as a new thing, and Osmo says "I could not find that one, so I have made a new one." (a code line). The "most recent" in the list is the one on screen when there is one.

## 9. Guests, crisis, register

- **Guests never build.** A guest's lines never reach `/api/chat` (the room's rule today), so they never produce an action. `/api/build` and `/api/artifacts` also reject any request that marks a speaker as a guest, with a 400, as the confirmation route does. Things already on screen stay; the Insights section and the buttons are Gur's (they are only ever reachable with his signed-in session).
- **Crisis.** As in the connectors spec (9.1): a crisis turn (the code's check, or the model's flag, on call 1) drops the `action` and runs nothing in that turn. A build already streaming when a crisis message arrives is aborted at once (the room cancels the request; the route stops reading and settles), the panel closes without a line, and only the crisis reply speaks. Tokens used so far stay counted.
- **Register.** The holding sentence, every failure line and every label the room adds are in his voice: composed, exact, full forms, no exclamation marks, no emoji. The sentences in section 3's table are the fixed ones. The thing's own copy is held to the same rule in the build prompt; code cannot fully enforce this, so the probe scans a sample of generated text for exclamation marks and emoji.
- **Nothing spoken at the end.** When the thing finishes, the panel shows the title and the settle; Osmo does not speak a second line (no extra turn, no extra voice cost). The holding sentence is the only thing said.

## 10. Tokens and cost (all estimates; the probe measures them)

- **Call 1** is the usual turn plus the action line and the recent-things list: about 150 to 250 extra input tokens, only while building is on.
- **The build call.** Input: the fixed rules (about 700 tokens), the brief (up to about 150) and, when changing a thing, the previous source (up to about 3,500): up to about 6,000 with margin. Output: 1,500 to 4,000 tokens; the output cap is **4,000**, and the route also stops at 12,288 bytes. One build is therefore about 2,500 to 10,000 tokens, typically 4,000 to 6,000. The repair call is similar, since it returns the whole source.
- **The ledger.** The route uses the same pool, ledger and rules as chat: it books an upper bound (input bytes plus the 4,000 output cap) before the call, checks it fits Osmo's share (630,000 on Gur's setting), and settles with OpenAI's real counts after. Language factors the reserve-call-settle steps in `handler.ts` into one helper (already asked for in the connectors spec) and the build route reuses it. The 20,000 per-call ceiling is not an issue.
- **Daily cap: 30 builds** (counted in the `actions` log over 24 hours as the other caps are; failed builds count too, because they cost tokens; repair calls do not count as extra builds). At about 6,000 tokens each that is up to about 180,000, roughly 29% of the 630,000 share, leaving the rest for chat. If tokens run short first, the allowance check refuses before the cap does.
- **Latency: 10 to 25 seconds** for the thing to be complete (estimate: roughly 4,000 tokens at the model's streaming speed, plus the compile). The holding sentence arrives in the usual 3 to 4 seconds and hides none of it: the sketch begins drawing at the first byte, so Gur sees progress from about second 3.
- **Vercel.** `/api/build` needs a longer limit than chat's 20 seconds: I propose `maxDuration = 60`. **Unverified:** that Gur's plan allows 60 seconds and streams small chunks without buffering them.
- **Money.** The build uses the free-allowance models, so no new bill. It is billed only if OpenAI's free allowance does not cover streaming calls (unverified, as for tool calls in the connectors spec).

## 11. Phases (each behind a setting that is off)

| Phase | What ships | Switch | What Gur sees |
|---|---|---|---|
| **A. Frame, runtime, manual test page** | The sandbox frame component, the runtime bundle and its build step, the bridge, the Sucrase compile and the checks, the forbidden-words scan, the `/dev/artifact` page (404 in production, like `/dev/figure`) where Gur pastes a component and sees it run and fail safely, and a probe script (`scripts/build-probe.mjs`, needs Gur's OK for real calls) for the model's quality | none needed: the dev page is not served in production | A test page on his laptop. No change in the real room. |
| **B. The `build` action, route, streaming, save, Insights** | The `build` entry in the registry, the `artifacts` migration, `/api/build`, `/api/artifacts`, the panel with a plain progress bar, Keep and Discard, "Things I made" | `OSMO_BUILD` unset (server) and the `artifacts` level `off` (Settings). Needs `OSMO_CHAT=on` and `OSMO_ACTIONS=on` too. | "Make me a tip splitter" produces a working thing in a panel, and Insights lists it. |
| **C. Animation polish and versions** | The alive animation of section 6 in full, the full-screen view, versions by asking (`from`), Earlier versions, Repair | the same switches; `data-building` styling is inert without them | The thing is drawn in beside him, the rings quicken, the settle breath; "make the button bigger" makes version 2. |

Each phase ends with the checks in `lanes.md` (vitest, `tsc`, lint), then Gur's hand check, then his OK before any push to `main`. Phase A can start as soon as Gur approves this spec; it needs no model and no migration. B builds on the connectors spec's phase 0, which main's desk reports done on local main and not pushed (the `action` field wiring in `handler.ts` is language's part and I did not check that it exists; `lib/actions/index.ts` and `types.ts` do).

## 12. Lane split (per `brain/lanes.md`) and the Asks

| Lane | Owns in this spec |
|---|---|
| **Main** | The frame component, the runtime bundle and its build script, the bridge; the animation (`figure.module.css`, `assistant.module.css`, `thing.module.css`, stage attributes in `assistant.tsx`); `lib/room/build-progress.ts` and `sketchBlocks`; the `artifacts` table and migration; `/api/artifacts`; the `build` Def in `lib/actions/registry.ts` with its cap in `caps.ts` and the small type change for the ticket; Insights and Settings (the `artifacts` level, the privacy line); `/dev/artifact`; `next.config.ts` (a long-cache header for `/artifact/*`; the frame header only if the srcdoc check fails); `project.md` keys |
| **Language** | The `build` action's wording (the Def's `line`, the prompt block that offers it and the recent-things list), `lib/chat/build-prompt.ts` (build and repair prompts), `/api/build` (the model call, streaming, the ledger use via the shared helper), a streaming variant of `openai.ts`, the `things` field in the chat body, the ticket in `ChatAnswer`, the probe |
| **Speaking** | Nothing. |
| **Cloud** | Review on GitHub after each push: the sandbox, the policy, the bridge checks, the row-level security. |

**Proposed addition to `lanes.md` (main keeps it):** `app/api/build/**` belongs to language (like `app/api/chat/**`); `app/api/artifacts/**` and `lib/artifacts/*` belong to main. The seam is the build ticket: `runAction` (main) returns it, `handler.ts` (language) passes it through `ChatAnswer`, and the room (main) starts the build.

**Asks (written on desks once Gur approves):**
- **Main:** (1) the `artifacts` migration (section 7); (2) the `build` Def and its cap entry, with a way for a Def to say "log later" so the row is written by `/api/artifacts` as "Built <title>" and not at validation; (3) the runtime build step and its dependency (an install of `sucrase`, and a build tool such as esbuild as a dev dependency; one install at a time per `lanes.md`); (4) the `artifacts` connector name in `CONNECTORS` and Settings; (5) tell language when `RunResult` carries the ticket.
- **Language:** (1) `build-prompt.ts` with the two prompts, in Gur's register; (2) `/api/build` and its streaming call; (3) the `things` list in the chat body and the prompt block; (4) the ticket on `ChatAnswer`; (5) the probe with Gur's go; (6) measure the real tokens of a build.
- **Speaking:** none.
- **Cloud:** review phase A (the sandbox) first; it is the part where a mistake matters most.

## 13. Tests per piece (vitest, the repo's style)

- **Sandbox (the most important).** A set of hostile components, each run in a real frame in a browser test (Playwright, on Gur's go) and checked to fail safely with nothing leaving: one that calls `fetch`; one that reads `window.top` or `window.parent`; one that touches `localStorage`, `sessionStorage` and `document.cookie`; one that opens a WebSocket; one that submits a form; one that clicks a link; one that tries `eval`; one that loads an image from the web; one that sets `location`. Each must produce the `error` message or nothing, and the room must show his line. Because vitest cannot run a real frame, the logic around it is also unit-tested: the frame page builder produces exactly the expected policy and sandbox list, and a test fails if `allow-same-origin` ever appears.
- **Bridge.** Messages from another window, with a wrong nonce, with extra fields, with an oversized title or error, with a negative or huge height: all dropped or clamped.
- **Transpile and checks.** A good component compiles; a syntax error yields a short message with a position; an import other than `react` fails; each forbidden word fails; no `export default` fails; a component with required props fails; 12,288 bytes passes and 12,289 fails (counted in bytes, with a multi-byte character case).
- **Size caps.** The stream reader stops at the cap; a server-side save of an over-long source is refused; the database checks match the code's constants (one shared constant).
- **The schema and the Def.** `build` appears in the enum only when the level allows it; the args checker accepts a brief of 1 to 500 characters, rejects an empty brief, extra keys, a `from` that is not a recent label or an id; the registry names still equal the schema enum.
- **The ledger.** The reserve, the fits check, the settle with real counts, the stop after a mismatched model, and the cut-off stream (estimate stays), all against the fake store; a repair call reserves and settles separately; a crisis abort settles what was used.
- **Caps and tiers.** The 31st build in 24 hours is refused; failed builds count; level `off` refuses, `ask` holds for a yes, `act` runs.
- **Stream protocol.** The NDJSON reader handles split chunks, a final `done`, an `error`, a missing `done`, and garbage lines.
- **The animation's pure functions.** `buildProgress` rises with bytes, never reaches 1 by itself, is 1 only on completion, handles 0 bytes and a huge count; `sketchBlocks` counts opened elements, ignores comments and strings, caps at 12.
- **Save route.** A source that does not compile is refused; a guest marker is a 400; the 201st row is refused; a `from` of someone else's thing is treated as new; the log row text has no brief.
- **Insights.** The row-to-sentence and the chain's "latest version" logic as pure functions.

## 14. Open questions for Gur (choose a letter), and my own decisions

**The three decisions I made myself (tell me if you disagree):**
1. **Sucrase** is the transpiler (section 3).
2. **The frame is built from text (`srcdoc`) with a one-use nonce**, not from a blob address, a separate page, or `'self'` (section 4). The room compiles; the frame only runs.
3. **Source only is stored; compile on every open** (section 7), and saving goes through a separate small route that compiles once more as a gate, so a streaming route never writes to the database.

**Questions**
1. **What may a thing import?**
   - A. Only `react` (recommended for version 1: the smallest door, and the model is good at plain React).
   - B. `react` and Osmo's own tiny chart helper (bars and lines, about 3 KB, written by us, in the runtime).
   - C. `react`, the chart helper and a small set of icons.
2. **Where does the thing sit on a wide screen?**
   - A. To the right of the conversation, stepping aside when Memory, Insights or Settings opens (recommended).
   - B. To the left of the conversation.
   - C. Under the figure, with the figure shrinking.
3. **May a thing ask Osmo something from inside itself** (for example a button "Explain this to me")?
   - A. No. The bridge stays at four one-way messages (recommended: it keeps the frame unable to steer Osmo).
   - B. Yes, as typed text that goes through the normal chat path and costs a turn.
   - C. Yes, but only from a fixed list of questions the room offers.
4. **After a build, keep or discard by default?**
   - A. Kept by default; Discard removes it (recommended: ignoring the buttons loses nothing).
   - B. Discarded by default: it is a draft and disappears after 24 hours unless Gur taps Keep.
5. **The daily cap on builds.**
   - A. 30 (as drafted; the token allowance would stop things sooner).
   - B. 10 to begin with, raised after a week of use.
   - C. 60.

## 15. Unverified (collected)

1. **iOS Safari (and current Chrome): a sandboxed srcdoc frame with a meta policy.** That the nonce on an external script works in a frame with an opaque origin; that srcdoc takes no response headers (so `X-Frame-Options: DENY` and `frame-ancestors 'none'` do not apply); that no policy is inherited from the room; that `postMessage` between room and frame behaves the same on an iPhone. All of section 4 stands on these; phase A tests them on a real iPhone first.
2. **Transpiler sizes and speeds** in section 3 are from memory. Measured in phase A on Gur's phone: download size, compile time for 12 KB, memory.
3. **Sucrase specifics:** which options give the output the runtime expects (JSX style, how `export default` is read), the wording of its errors, and whether it ever accepts code that a full parser would reject.
4. **React 19 in a frame.** The repo has no ready single-file browser build (checked: no `umd` folder in `react` or `react-dom`), so the runtime needs a bundling step; esbuild is not currently installed at the top of `node_modules` (checked), and a dev dependency would be added. The size of the resulting file (I expect roughly 60 KB sent compressed; not checked).
5. **Vercel:** whether Gur's plan allows `maxDuration = 60` and passes a streamed response through unbuffered; whether the first byte must arrive within a time limit.
6. **OpenAI:** that the allowlisted models stream through the Responses API, report usage in the final event, and report usage (or not) when we stop a stream early; that streaming calls are covered by the free allowance; that `gpt-5.4-mini-2026-03-17` writes a good 12 KB component, how often a repair is needed, and whether it obeys "no exclamation marks" in the thing's own text.
7. **The self-navigation gap** (section 4): whether any browser Gur uses blocks a sandboxed frame from sending itself to an outside address, and whether the load-event detection fires in time on iOS.
8. **The service worker** (`public/sw.js`) and a frame with an opaque origin: that the worker does not intercept or break the runtime fetch.
9. **Registered CSS variables easing** (`--quicken`, as `--aura-a` already does) on iPhone Safari, and the smoothness of the ring speed change (the existing `--flow` approach changes a running animation's duration the same way).
10. **ResizeObserver inside the frame** reports height correctly in iOS Safari.
11. **All token, time and money figures** in section 10 and the share arithmetic (630,000 × 29%).
12. **Connectors spec dependencies:** the whole action path (`runAction`, the log, `turnFormat`) is as that spec describes; none of it is built yet, and its own unverified items (strict mode accepting the `action` field, the service-role decision) carry over.
