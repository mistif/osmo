# Osmo's voice: he speaks, wakes to his name, and knows your voice

Spec 2 of 2. It follows the shell (`2026-09-26-osmo-shell-design.md`).

## Goal
Osmo speaks his replies and wakes when you say "Osmo". He tells your voice from anyone else's. With you, he is himself. With someone else, he is polite and keeps everything of yours to himself.

Your voice becomes the second check on what he says out loud. The passkey (Face ID or fingerprint) stays the only way in.

## Non-goals
- **Listening in the background, and the native apps.** Gur eventually wants Osmo as a laptop app and a phone app. This spec keeps every platform-specific piece swappable for that, but builds neither.
- **A paid natural voice.** He uses the device's built-in voices.
- **Unlocking Osmo by voice,** or voice replacing the passkey.
- **Knowing several people by name.** There is only "you" and "someone else".
- **Interrupting him by talking over him.** Tapping the circle stops him instead.
- **Choosing a different voice in Settings.**

## Part 1: talking with him

### Turning it on
- **Settings → Voice has a switch, "Listen for 'Osmo'".** The first time you turn it on (or first tap the mic button), Osmo walks you through teaching him your voice (Part 2). The browser asks for the microphone once.
- **Whenever the microphone is on,** a small line under the text box says **Listening for "Osmo"**. The microphone is never on without that line.
- **Stored per device:** the switch, and "Speak typed replies too", are kept on each device in `localStorage`, because microphone permission is per device.

### A conversation
1. **You say "Osmo".**
   - The wake-word detector (Part 3) hears it and a soft chime plays.
   - The circle changes to a distinct listening state (`data-listening` on the stage).
   - You speak after the chime: words spoken before it may be cut off. Pulling the rest of a sentence out of "Osmo, …" is kept as a fallback, in case the recognizer catches the name.
2. **Your words appear in the text box as you speak.** The browser's speech recognition turns them into text. Chrome and Edge use `processLocally: true` when the offline English pack is installed or can be installed (`SpeechRecognition.available` / `install`), so the audio never leaves the device. Otherwise they use the browser's default recognizer. Safari uses Apple's dictation.
3. **When you pause for about a second, the message is sent** by the same path as a typed message.
4. **He answers aloud.**
   - While he speaks, the circle's rhythm follows his voice word by word, using the speech engine's word-boundary events.
   - Where a device reports no word timing, the current typing rhythm runs, stretched to the length of the speech.
5. **For 6 seconds after he finishes, he listens for a follow-up** without the wake word. If no speech starts in that time, he goes back to waiting for "Osmo".

### Rules
- **He doesn't listen while he speaks.** The detector and the recognizer pause, so his own voice can never wake him.
- **Tapping the circle** while he speaks stops him.
- **After a wake-up, if no speech starts within 4 seconds,** he goes back to sleep silently, with no reply. This absorbs false wake-ups.
- **The mic button** next to Send starts listening without the wake word. It's hidden where speech recognition doesn't exist (Firefox).
- **Typed messages get silent replies,** as now, unless "Speak typed replies too" is on. Replies to spoken messages are always spoken.
- **Tab hidden or screen off:** listening pauses, and resumes by itself when the page is visible again.

### His voice
He speaks with the first available voice in this order:
1. an on-device British English male voice (`localService` true; for example "Daniel" on iPhone and Mac, "Microsoft George" on Windows);
2. any on-device British English voice;
3. an on-device US English male voice;
4. any on-device English voice;
5. any English voice.

On-device voices come first so the text of his replies isn't sent to a speech service.

If no English voice exists, he stays silent and the text still appears. His voice is steady: rate 1.0, pitch 0.95.

## Part 2: knowing your voice

### Teaching him (Settings → Voice)
- **"Teach Osmo my voice"** shows 5 short sentences, read one at a time (about 30 seconds in total).
- **Each reading must contain at least 2 seconds of speech.** A reading that is too quiet or too short is asked for again.
- **Each reading becomes a voice embedding on the device,** and the recording is discarded at once. Audio is never stored or uploaded.
- **The 5 embeddings are averaged into one voiceprint.** If any reading is far from the others, it is asked for again, so nothing half-learned is saved.
- **"Teach again on this device"** adds another voiceprint alongside the existing ones. Microphones differ, and this lets each device match well.
- **"Forget my voice"** deletes every voiceprint and turns listening off on this device. Other devices find no voiceprint and turn their own listening off too.

### Storage
A new table `voiceprints`:
- `id` (uuid, default `gen_random_uuid()`);
- `user_id` (uuid, default `auth.uid()`);
- `device` (text: a readable label such as "Windows · Chrome");
- `model` (text: which recognition model produced it);
- `embedding` (`real[]`);
- `created_at` (timestamptz, default `now()`).

It gets row-level security for own rows only, like the other tables. Voiceprints from a different `model` are ignored when matching, because embeddings from different models can't be compared.

### Deciding who is speaking
- **Every spoken message is judged,** using the message audio plus the wake word's audio when there is one (the mic button has none). Both come from the microphone stream (Part 3).
- **Score:** the highest cosine similarity between the speaker's embedding and your voiceprints for the current model.
- **At or above the threshold it's you. Anything else is someone else,** including unsure cases. The model check (Part 3) sets the threshold.
- **Carry-over:** once a conversation has recognized you (from wake-up until he goes back to sleep), follow-ups with under 1.5 seconds of speech stay yours. Longer follow-ups are judged again, so someone else joining in with a full sentence is caught.
- **Typed messages are always you,** because the device was unlocked with the passkey.

### Someone else
- **He is polite and professional.** The first time in a conversation, he greets them: "Hello. I don't believe we've met."
- **He answers general things:** what he can do, how he is, word meanings, arithmetic.
- **Nothing of yours comes out:** no name, no memory facts, taught words or meanings, no chat history, no story or milestones, no mood history.
- **He learns nothing and saves nothing from a guest turn:**
  - no memory facts, slang, meanings, vocabulary or pending learning;
  - no dictionary cache writes;
  - no agent state, bond, milestones or mood day.
  - The turn's resulting agent state and session are discarded, so his mood and your bond are exactly as before.
- **Their messages, and his replies to them,** are saved with `speaker = 'guest'` and shown in the conversation labelled **Someone else**.
- **Guest messages never feed your conversation context:**
  - the recent words;
  - "what did I say";
  - finding your name in the chat;
  - reading the last thing he asked.
- **Guests can't change his settings or memory by voice.**

### Voice as the second check
- **The passkey is the lock.** Supabase's servers check it, and it is what protects the data.
- **Your voice decides what he says out loud.** His personal side opens only when the device is unlocked and the voice is yours.
- **Voice never unlocks Osmo, and never stands in for the passkey.** Voices can be recorded or cloned, and the check runs on the device.
- **Listening can't be turned on until your voice is taught,** so the check is active whenever the microphone is on.

## Part 3: how it's built

### Swappable parts
**Pure logic in `lib/voice/`,** tested with Vitest, with no browser APIs:
- `machine.ts`: the conversation states (off, sleeping, awake, thinking, speaking, follow-up) and every transition.
- `wake.ts`: the detector's decision:
  - the score threshold;
  - how many frames must agree;
  - a 2-second cooldown before it can wake again;
  - the 4-second "no speech, back to sleep".
- `utterance.ts`: pulls your message out of a transcript ("Osmo, what's up?", "ozmo …", "Osmo" on its own), and decides when speech has ended.
- `voiceprint.ts`:
  - averaging readings;
  - the outlier check;
  - cosine similarity;
  - best-of-many matching;
  - the threshold decision;
  - the carry-over rule.
- `voices.ts`: picks his voice from a list, in the Part 1 order.
- `guest.ts`: the guest view (empty memory, no name, no vocabulary or slang, no recent words), the guest greeting, and which writes are off.

**Browser parts in `lib/voice/web/`,** one job each. A native app later replaces only these:
- `mic.ts`: one microphone stream, resampled to 16 kHz mono PCM in an AudioWorklet. It keeps a short rolling buffer, so the wake word's own audio is available for the voice check.
- `wake-detector.ts`: runs openWakeWord's three ONNX models on 80 ms frames (melspectrogram, then embedding, then the `osmo` model).
- `transcriber.ts`: wraps `SpeechRecognition`, with the on-device mode where available.
- `speaker-id.ts`: turns audio into a voice embedding with the recognition model, after the model's own feature step.
- `say.ts`: wraps `speechSynthesis`, with word-boundary callbacks and cancel.

**A hook, `components/osmo/use-voice.ts`,** connects the parts to the room and the Settings panel.

### Models and runtime
- **One runtime: `onnxruntime-web`,** for both the detector and the recognition model. No other speech runtime is added.
- **The recognition model is chosen by a short check at the start of the plan.** Candidates are the small speaker-embedding models from wespeaker and 3D-Speaker (about 25-40 MB); WavLM (`wavlm-base-plus-sv`, about 100 MB) is the fallback. The winner is the smallest model that:
  - clearly separates two different speakers on the test clips;
  - runs one judgement in under 300 ms on the PC;
  - has a license that allows this use.
- **The check also fixes the match threshold.**
- **All model files and the runtime's WebAssembly files are served from Osmo's own site** (`public/models/`), and the browser caches them after the first download. No third-party host sees the traffic.

### The wake word
- **Gur trains the `osmo` detector** with openWakeWord's automatic training notebook on Google Colab (target phrase "Osmo", about 1-2 hours). He hands over the resulting `.onnx` file.
- **`docs/osmo-wake-word.md` is the step-by-step guide.**
- **Until the file exists:**
  - the switch reads "His wake word isn't trained yet" and can't be turned on;
  - the mic button still works;
  - so does teaching his voice.
- **The detector starts strict.** If it wakes too often, the threshold is raised. If it still does, retraining on "Hey Osmo" means running the same notebook again with the new phrase.

### Settings → Voice
- "Listen for 'Osmo'" (switch).
- "Teach Osmo my voice", then "Teach again on this device".
- "Speak typed replies too" (switch).
- "Forget my voice", with one confirmation.
- A line naming the voice he is using on this device.

## Errors, in plain words
- **Microphone blocked:** "I can't hear you. Allow the microphone for this site in your browser settings, then try again."
- **No speech recognition (Firefox):** the mic button is hidden, and Settings says "Listening needs Chrome, Edge or Safari. I can still speak."
- **A model won't download:** "I couldn't load what I need to listen. Check your connection and try again."
- **A reading that was too quiet or too short:** "That was too quiet to learn from. Try again somewhere quieter."
- **The voiceprint doesn't save:** "Couldn't save your voice. Try again."
- **The recognizer stops on its own:** it restarts quietly. After 3 failures in a row: "Listening stopped. Tap the mic to start again."
- **No English voice on the device:** text only, no error.

## Testing
**Vitest, for everything in `lib/voice/` except `web/`:**
- every state transition;
- the wake rules, including the cooldown and "no speech, back to sleep";
- message extraction;
- voiceprint averaging, the outlier check, matching, the threshold, and carry-over;
- voice picking;
- the guest view and the list of writes it turns off.

**Browser checks by the builder.** The browser pane has no microphone, so the models are tested on sample clips made with the computer's own voices:
- two different Windows voices serve as two speakers;
- one of them saying "Osmo" tests the detector.
- The recognition model must score the same voice clearly above different voices.
- The detector must fire on "Osmo" and stay quiet on other words, once the `osmo` file exists.
- Plus the Settings voice section, the mic button hidden where unsupported, and no console errors.

**Gur checks by hand** (the plan ends with this checklist):
- teaching his voice;
- waking him from across the room;
- an evening with the TV on, counting false wake-ups;
- a friend talking to him: labelled "Someone else", and nothing of Gur's comes out;
- Safari on the iPhone;
- "Forget my voice".

## Coordination with the language session
`app/assistant.tsx` and the `messages` table are shared. These edits are agreed with the language session before anyone makes them:
- **One path for all messages.** `sendMessage(event)` becomes a thin wrapper around `sendText(text, { via: "typed" | "voice", speaker: "you" | "guest" })`, so spoken words go through the same path as typed ones.
- **Spoken replies.** `deliver(reply)` also hands the reply to the voice (spoken when `via` is `"voice"` or "Speak typed replies too" is on).
- **Guest turns.** They use the guest view from `lib/voice/guest.ts`, skip every write listed in Part 2, and discard the turn's agent state and session.
- **Guest messages stay out of your context:** out of `recent`, the last agent text, finding your name in the chat, and recall.
- **The `speaker` marker.**
  - `ChatMessage` gains an optional `speaker?: "guest"`.
  - The `messages` table gains a nullable `speaker` text column; null means you.
  - The log shows a "Someone else" label.
- **The listening state** goes on the stage element as `data-listening`, and the mic button goes in the composer.

This session builds everything under `lib/voice/`, `use-voice.ts`, the Settings voice section, the `voiceprints` migration, the listening styles in `assistant.module.css`, and the wake-word guide.

## Risks
- **Words cut off before the chime.** The recognizer starts a few hundred milliseconds after the wake word, so "Osmo, what's…" said in one breath can lose its first word. The chime is the cue to speak. If it annoys, a later upgrade could transcribe on the device from the microphone buffer (for example Whisper), which keeps the words spoken before the chime.
- **A two-syllable wake word wakes by mistake more often.** Mitigated by the strict threshold, the frame agreement, the cooldown, and "no speech, back to sleep". Retraining on "Hey Osmo" is the fallback.
- **iPhone Safari and two microphone users.** Safari may not let the detector's microphone stream and its own speech recognition run at the same time. If so, the detector's stream pauses while the recognizer listens. The voice check then judges only the wake word's audio and the follow-ups carried over, which is weaker and more often counts as someone else. This is checked by hand on the iPhone.
- **Recognition differs between devices.** Handled by "Teach again on this device" and best-of-many matching.
- **Word timing** isn't reported by every voice. The stretched typing rhythm covers it.
- **Download size on the phone:** 3 MB plus 25-40 MB, once per device, then cached.
- **Model files add 30-45 MB to the repository.** That's under GitHub's per-file limit, and no Git LFS is needed.
