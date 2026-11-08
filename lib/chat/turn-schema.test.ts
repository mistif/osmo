import { describe, expect, it } from "vitest";
import { TURN_FORMAT, turnFormat } from "./turn-schema";

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

describe("turnFormat", () => {
	it("is TURN_FORMAT itself when no action is on", () => {
		expect(turnFormat([])).toBe(TURN_FORMAT);
	});

	it("adds a required action, null or a name from the list with its args as JSON text, when an action is on", () => {
		const format = turnFormat(["a", "b"]);
		expect(format).toMatchObject({ type: "json_schema", name: "osmo_turn", strict: true });
		const { schema } = format;
		expect(schema.additionalProperties).toBe(false);
		expect(schema.required).toHaveLength(8);
		expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
		const { anyOf } = (schema.properties as unknown as { action: { anyOf: Record<string, unknown>[] } }).action;
		expect(anyOf).toHaveLength(2);
		expect(anyOf[0]).toEqual({ type: "null" });
		expect(anyOf[1]).toMatchObject({ type: "object", additionalProperties: false, required: ["name", "args"] });
		const { name, args } = (anyOf[1].properties as Record<string, { type: string; enum?: string[] }>);
		expect(name.enum).toEqual(["a", "b"]);
		expect(args.type).toBe("string");
		expect(JSON.stringify(format)).not.toMatch(/maxItems|minimum|maximum|maxLength/); // code enforces the limits (3.1)
	});

	it("leaves TURN_FORMAT with its seven keys", () => {
		turnFormat(["a"]);
		expect(TURN_FORMAT.schema.required).toHaveLength(7);
		expect(Object.keys(TURN_FORMAT.schema.properties)).not.toContain("action");
	});
});
