// The strict JSON schema for Osmo's turn response from the model, with no imports (chat-probe.mjs loads this file straight into Node).

export const TURN_TONES = ["neutral", "happy", "excited", "grateful", "playful", "sad", "worried", "angry", "tired", "lonely"] as const;
export const TURN_ABOUT = ["gur", "someone_close", "osmo", "other"] as const;
export const TURN_WANTS = ["listen", "advice", "distraction", "nothing"] as const;
export const TURN_FORMAT = {
	type: "json_schema",
	name: "osmo_turn",
	strict: true,
	schema: {
		type: "object",
		additionalProperties: false,
		required: ["reply", "crisis", "tone", "intensity", "about", "wants", "note"],
		properties: {
			reply: { type: "string" },
			crisis: { type: "boolean" },
			tone: { type: "array", items: { type: "string", enum: TURN_TONES } },
			intensity: { type: "integer" },
			about: { type: "string", enum: TURN_ABOUT },
			wants: { type: "string", enum: TURN_WANTS },
			note: { type: "string" },
		},
	},
} as const;
