import { describe, expect, it } from "vitest";
import { TURN_FORMAT } from "./turn-schema";

describe("TURN_FORMAT", () => {
	const { schema } = TURN_FORMAT;
	it("is strict, with every field required, nothing extra and no limit keywords", () => {
		expect(TURN_FORMAT).toMatchObject({ type: "json_schema", name: "osmo_turn", strict: true });
		expect(schema.additionalProperties).toBe(false);
		expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
		expect(schema.required).toHaveLength(7);
		expect(JSON.stringify(schema)).not.toMatch(/maxItems|minimum|maximum|maxLength/); // code enforces the limits (3.1)
	});

	// Without a scale in JSON mode a model answering 1 to 5 is clamped to 3, and the next turn turns heavy.
	it("describes the fields the model fills in, with the intensity scale of 1, 2 and 3", () => {
		const { tone, intensity, about, wants, note } = schema.properties;
		for (const field of [tone, intensity, about, wants, note]) expect(field.description).toMatch(/\S/);
		expect(intensity.description).toMatch(/\b1\b.*\b2\b.*\b3\b/);
		expect(intensity.description).not.toMatch(/[4-9]/);
		expect(note.description).toMatch(/empty/);
	});
});
