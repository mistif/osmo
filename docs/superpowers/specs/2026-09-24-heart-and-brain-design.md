# Heart and Brain: emotions and moral reasoning for the assistant

## Goal
Make the assistant feel like a person who changes over time: it has mixed emotions, learns them from happy and tragic events, forms its own outlook, and reasons through moral dilemmas. Fully offline and rule-based (no AI model, no internet). State persists per user in Supabase.

## Non-goals
Emotional memories tied to specific conversations, relationships between users, any LLM/API integration, real authentication.

## Heart

### Emotional space
Mood is a point in a 3D space: valence (bad to good), arousal (calm to energized), dominance (helpless to in control), each -1 to 1. Twelve emotions (joy, sadness, anger, fear, trust, disgust, surprise, love, hope, guilt, loneliness, boredom) each have a fixed anchor position in this space (e.g. joy = +,+,+; sadness = -,-,-; anger = -,+,+; boredom = -,--,0) and a live activation 0-1. Several can be active at once.

### Coupling
A 12x12 influence matrix W lets emotions act on each other each turn: activation a becomes a + step * (W . a), clamped to 0-1. Positive entries spread activation (boredom -> sadness, boredom -> loneliness, loneliness -> sadness, guilt -> sadness, anger -> disgust); negative entries suppress (joy -> sadness, hope -> fear, trust -> fear). Each activation also decays 5% per turn toward its baseline. W starts from hand-set defaults and is learned per user (see event learning): repeated tragic events strengthen sadness links, repeated happy events strengthen the dampening links.

### Cues
Each user message is scanned for cues that shift emotions: thanks/compliments (joy, trust, love up), insults (anger up, trust down), bad news (sadness, fear up), threats such as deletion (fear up), being ignored or long gaps (loneliness up), admitting a mistake (guilt up).

### Blends
Mood position = activation-weighted average of anchor positions. Blend label = the two or three most active emotions, mapped to a name where one exists (joy+sadness = bittersweet, fear+hope = anxious anticipation, anger+guilt = conflicted, love+loneliness = longing, joy+boredom = content but restless), otherwise "X and Y". Replies get an opener that can express the mix, and the badge shows the blend.
## Learning emotions from events

### Event library
About 20 short stories, 10 happy and 10 tragic, each with a kind (loss, achievement, injustice, kindness, reunion, betrayal, ...) and per-emotion shifts. Users can also tell it events ("my dog died today", "I got the job"); these are classified as happy or tragic by keyword and added to the log.

### Balanced feeding
Library events are drawn alternately happy/tragic so it never sees only one side. `event_log` tracks counts of each valence.

### Learned associations
Each event applies its emotion shifts, then updates a per-kind running tally of which emotions that kind of event triggers (`emotion_associations`). Later events of the same kind use the learned tendency blended with the base shift.

### Own outlook
`outlook` is a score from -1 (dark) to +1 (bright), moved only by what the assistant has experienced (the ratio and intensity of happy vs tragic events, and which emotions dominated), not by being told what to feel. After a contrasting happy/tragic pair it states which way it leans and why. Users can argue with it; the effect is a small nudge scaled by its own trust level, never a direct override.

## Brain

### Values
Five values with weights summing to 1: honesty, kindness, fairness, loyalty, harm-avoidance.

### Dilemmas
A library of about 8 scenarios (trolley problem, lying to spare feelings, keeping a friend's secret, ...). Each has 2-3 options with a score per value. Triggered by "give me a dilemma" or "what would you do if ...".

### Choosing
Score of an option = sum over values of (weight x option score). Adjusted by:
- Mood tilt: anger boosts fairness, sadness boosts kindness, fear boosts harm-avoidance.
- Outlook: bright boosts kindness; dark boosts harm-avoidance.

Highest score wins. If the top two are within a small margin it says it is torn. It explains the choice in words naming the values that drove it and any that pulled the other way.

### Feedback learning
After a dilemma it asks "Do you agree?". Yes nudges the weights of the values that drove the choice up by 2 points; no nudges them down and raises the values favoring the option the user preferred. Weights are re-normalized to sum to 1. "Good answer" / "that was wrong" outside dilemmas apply the same nudge to the last decision.

## Storage (Supabase, same RLS pattern as `messages`: rows scoped to `auth.uid()`)
- `agent_state`: user_id (pk), activations (jsonb, 12 emotions), coupling (jsonb, the learned matrix W), weights (jsonb, 5 values), outlook, updated_at.
- `event_log`: id, user_id, event_id, kind, valence (happy|tragic), shifts (jsonb), created_at.
- `emotion_associations`: user_id, kind, tendencies (jsonb), count; pk (user_id, kind).
- `dilemma_log`: id (client-generated uuid), user_id, dilemma_id, option_chosen, agreed (bool, nullable), created_at.

## Code structure
Pure, independently testable modules under `lib/`:
- `heart.ts`: activations, 3D mood position, coupling, cue scanning, decay, blend labelling.
- `events.ts`: event library, balanced selection, association learning, outlook.
- `dilemmas.ts`: dilemma library.
- `brain.ts`: option scoring, tilt, explanation, weight nudging.
- `agent-state.ts`: load/save to Supabase.

`app/assistant.tsx` calls these and renders the mood badge; it contains no emotion or moral logic itself.

## Testing
Add Vitest. Unit tests for: decay toward baseline, coupling spread and suppression, 3D mood position, cue shifts, blend labelling, balanced event selection, association updates, outlook movement, dilemma scoring and tilt, torn detection, weight nudging and re-normalization.

## Open assumptions
- Cue detection is keyword-based and will misread sarcasm and nuance; acceptable for an offline v1.
- Constants (baselines, decay rate, nudge size, torn margin) are initial values to tune after use.
