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
});
