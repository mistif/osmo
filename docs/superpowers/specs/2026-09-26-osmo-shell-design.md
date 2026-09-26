# Osmo's shell: a lock that knows you, and his room as the whole app

Spec 1 of 2. Spec 2 (voice: speaking, listening, telling voices apart, voice as a second check) gets its own spec after this ships.

## Goal
Osmo belongs to one person, Gur. The site becomes Osmo and nothing else: a lock screen that recognizes Gur's device with a passkey (fingerprint, face or Windows Hello), then his room, with three quiet panels over it: Memory, Insights and Settings. He is deployed on Vercel, so the lock matters. With no lock, anyone with the link could read what he remembers.

## Non-goals
- Anything in spec 2: text-to-speech, speech-to-text, speaker recognition, voice as a confirmation step.
- More than one user. No sign-up, no account management beyond Gur's own passkeys.
- A bond meter or closeness score anywhere. The bond is shown only as a story of milestones.
- Changing how Osmo understands or answers (the language session's files: `talk.ts`, `context.ts`, `safety.ts`, `lib/facts.ts`, `lib/agent/lexicon/*`, `dictionary*.ts`, and the language chain in `app/assistant.tsx`).

## Part 1: getting in

### Addresses
- `/` is Osmo's room (today at `/assistant`; `/assistant` redirects to `/`).
- `/lock` is the lock screen (replaces `/login`; `/login` redirects to `/lock`).
- Removed: the template home page (`app/page.tsx` content), `app/about.tsx`, the Dashboard link, the top navigation bar (`layout.tsx`), `components/auth-link.tsx`, and the sign-up mode of the login form. The room fills the whole viewport (its height no longer subtracts a nav bar).

### The gate
The room checks for a Supabase session on load and sends the browser to `/lock` without one. This is presentation only: the data is protected by the existing per-user row-level security on every table.

### Passkeys
Supabase's built-in passkeys (experimental), enabled in the client with `auth: { experimental: { passkey: true } }` in `lib/supabase.ts`. The installed `@supabase/supabase-js` 2.117.1 includes `signInWithPasskey`, a full-ceremony passkey registration for the signed-in user, and `supabase.auth.passkey.list/update/delete`.

### The lock screen
- **Locked** (the usual case): his breathing circle, his name, one button, "Unlock with fingerprint or face", and a quiet link, "This device doesn't have my passkey".
- **New device, once**: the link reveals email and password fields and an "Unlock" button. After a successful sign-in, Osmo asks "Remember this device?", with "Remember" (registers a passkey) and "Not now". Declining still enters the room.
- **Unlocking** blooms the circle outward into the room. This is the one bold motion in the shell. With reduced motion it is a fade.
- There is no sign-up link anywhere.
- If the browser does not support passkeys, the passkey button is hidden and the email and password fields are shown directly.

### Staying unlocked
Supabase refreshes the session on its own, so a device stays unlocked until Gur chooses "Lock Osmo" or the browser's site data is cleared.

## Part 2: the room and its panels

### Layout
The room stays as it is (name, mood line, circle, conversation, text box). Three quiet text links sit at the top right: Memory, Insights, Settings. Each opens a panel that slides in from the right over about half the room. Osmo stays visible and alive behind it, dimmed and shifted slightly aside, and the text box stays usable. Only one panel is open at a time. Clicking the open panel's link again, the panel's close control, or Escape closes it.

On a phone (narrow screens) a panel becomes a full-width sheet over the room.

### Visual direction
The room's identity carries into the panels; the panels must not read as a generic settings UI.
- **Panels are the inside of his mind, not cards:** the panel background is tinted from his current mood color (`--aura-a` mixed into `--base`), so it shifts with his mood. No boxes, shadows or card grids. Items are plain lines of text with generous spacing.
- **Everything is in his voice, first person:** "You told me your name is Gur", "You taught me that bet means okay". Section headings are sentence case ("About you", "Words you taught me", "Things you explained"). No all-caps labels, no key/value tables, no eyebrow labels.
- **One typeface:** Bricolage Grotesque throughout. Panel titles are large and tight like his name; items at a comfortable reading size; dates smaller with tabular figures. No monospace data face.
- **Motion:** the unlock bloom is the only bold moment. A panel opening is the only other motion (a slide, with Osmo stepping aside). Reduced motion turns both into fades.
- **Quality floor:** visible keyboard focus, sufficient contrast on every mood tint, responsive down to phone width.

### Memory panel ("What I remember")
- **Source:** the `memory_facts` table, in three groups:
  - "About you": the name and plain facts.
  - "Words you taught me": keys starting `slang:`.
  - "Things you explained": keys starting `meaning:`.
- **Each line** is a first-person sentence. If the language session exports a sentence helper for memory, it is reused rather than duplicated.
- **Editing:** tap a line to edit its value; Enter saves, Escape cancels. The × control removes it after one confirmation ("Forget this?").
- **Changes** save to Supabase and update the room's in-memory memory, so Osmo uses them on the very next message. That in-memory list lives in the language session's part of `assistant.tsx`; the room passes the panel the list and a change callback. The exact hookup is agreed with that session before editing.
- **Empty state:** "I don't know much about you yet. Tell me something, like your favorite food."

### Insights panel ("How I've been")
- **Mood, last 7 days:** a line of his daily mood in his aura colors. Tapping a day shows its strongest emotion ("Tuesday: mostly hopeful"). Days without data are gaps, not zeros. With no rows yet: "I'll start keeping track of how I feel from today." Once rows exist but fewer than 7 days: "I started keeping track on the 27th of September.", using the earliest `mood_days.day`, spoken the same way as the bond's dates.
- **Our story:** the bond's milestones as a dated timeline in past-tense sentences, including the quiet ones ("We met", "You told me your name", "I came to think of you as a friend"). A vertical line is used because the content is a sequence.
- **Made from:** his six donors, one sentence each ("My heart comes from The Night-Shift Nurse").

### Settings panel
- **Devices:** passkeys listed by name and last use, with rename and remove. Removing the passkey of the current device asks first.
- **Lock Osmo:** signs this device out and returns to `/lock`.
- Spec 2 adds voice setup here.

### Mood history data
A new table `mood_days`:
- `user_id` (uuid, defaults to `auth.uid()`),
- `day` (date, the user's local day),
- `valence` (the running average of his mood valence for the day, -1 to 1),
- `strongest` (text, the day's most frequent dominant emotion so far),
- `tally` (jsonb, how many turns each emotion was dominant today),
- `samples` (int),
- primary key `(user_id, day)`, and the same row-level security policy as the other tables (own rows only).

It is written in `persistTurn` (`lib/agent/agent-state.ts`) on each saved turn:
- read today's row,
- fold in the new valence as a running average,
- update `strongest` from a small per-emotion tally stored in a `tally` jsonb column,
- upsert.

Valence comes from the existing emotion anchors weighted by activation. A failure here never blocks saving the rest of the state.

## Part 3: deploying, errors, testing

### Repository and deploying
- The project is a git repository, pushed to the private GitHub repo `mistif/osmo` (branch `main`).
- It deploys to Vercel by importing that repo, so every push to `main` redeploys.
- Vercel environment variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `NEXT_PUBLIC_OSMO_DEMO` is never set in production.
- Passkeys are tied to one address: passkeys saved on the Vercel site do not work on `localhost`. Local development uses the email and password path.

### Supabase settings (Gur changes these in the dashboard)
1. Authentication: turn off new user sign-ups.
2. Authentication: enable passkeys, with the relying party ID set to the Vercel domain and the allowed origin set to its `https://` address.
3. Authentication URL configuration: set the Site URL to the Vercel address.

The database migration for `mood_days` is applied by the builder through the Supabase tools.

### Errors, in plain words
- **Passkey cancelled or failed:** "That didn't unlock. Try again, or use your email and password on this device."
- **Wrong email or password:** "That email and password didn't match. Check them and try again."
- **Supabase unreachable in a panel:** "I can't reach my memory right now. Try again in a moment."
- **An edit or removal fails:** the item returns to its previous value, with "Couldn't save that. Try again."
- **Passkey registration fails:** "This device couldn't save a passkey. You can try again from Settings." The room still opens.

### Testing
- **Vitest, for the pure logic:**
  - memory grouping and first-person sentences,
  - the `mood_days` running average and strongest-emotion tally,
  - the 7-day series with missing days,
  - milestones to dated story lines,
  - the gate's decision (session or none),
  - device labels (name, last use),
  - valence from activations.
- **Browser checks by the builder:**
  - signed out, `/` and `/assistant` send you to `/lock`,
  - `/login` redirects to `/lock`,
  - panels open and close with focus moving to the panel title, Escape closing, and focus returning to the link,
  - phone width,
  - reduced motion,
  - no console errors.
- **Gur checks by hand** (the builder never signs in): the passkey unlock, "Remember this device?", the password path on a new device, and removing a device. The plan ends with this checklist.

## Coordination
- `app/assistant.tsx` is shared. This work touches:
  - its route (moving to `/`),
  - the room's header (the three links),
  - the panel mount,
  - handing the panels the memory list and a change callback.

  It does not touch `sendMessage`'s language chain. The exact edits are messaged to the language session before editing, and each session commits its own files in small commits.
- A separate small task (not part of this spec) exposes the milestone a turn mentioned, so the language session can stop losing milestone lines when it swaps in its own reply.

## Risks
- Supabase marks passkeys experimental; its passkey API may change in a future version. The passkey calls live in one small module so an API change is a small edit.
- The whole-viewport room changes the page height rules in `assistant.module.css`; the sticky composer and the scroll area must be rechecked on phones.
