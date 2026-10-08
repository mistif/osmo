// The strict JSON schema for Osmo's turn response from the model, with no imports (chat-probe.mjs loads this file straight into Node).
// The descriptions are the only place JSON mode says what a field means (the intensity scale above all), so they stay short and
// carry no limit keywords: the code enforces the limits (3.1).

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
			tone: { type: "array", items: { type: "string", enum: TURN_TONES }, description: "How Gur sounds in this message; neutral for an ordinary one." },
			intensity: { type: "integer", description: "How strongly: 1 slight, 2 clear, 3 strong." },
			about: { type: "string", enum: TURN_ABOUT, description: "Who the message is mainly about." },
			wants: { type: "string", enum: TURN_WANTS, description: "What Gur seems to want from you." },
			note: { type: "string", description: "A few plain words about what happened, at most eight and no symbols, or empty for an ordinary message." },
		},
	},
} as const;

// With no action on this is TURN_FORMAT itself, so the request is the one it always was; with one on, the same schema plus a required
// action that is null or one of the names (its args travel as JSON text, since strict mode wants a fixed shape).
export function turnFormat(names: readonly string[]) {
	if (names.length === 0) return TURN_FORMAT;
	const action = { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["name", "args"], properties: { name: { type: "string", enum: [...names] }, args: { type: "string", description: "The action's arguments as JSON text." } } }] };
	return { ...TURN_FORMAT, schema: { ...TURN_FORMAT.schema, required: [...TURN_FORMAT.schema.required, "action"], properties: { ...TURN_FORMAT.schema.properties, action } } };
}
