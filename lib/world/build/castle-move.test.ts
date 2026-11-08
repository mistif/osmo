import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { castleMoveValues } from "./castle-move";

const SQL = fileURLToPath(new URL("../../../docs/migrations/free-will-builds.sql", import.meta.url));

describe("the castle's move into builds (spec 6.3)", () => {
	it("carries the six rooms' footprints exactly as the code has them", () => {
		const values = castleMoveValues();
		if (process.env.WORLD_SNAPSHOT_DIR) writeFileSync(join(process.env.WORLD_SNAPSHOT_DIR, "castle-move-values.sql"), values);
		expect(values.split("\n")).toHaveLength(6);
		expect(values).toContain("('hall', 468, 71, '");
		expect(values).toContain("::jsonb, 180)");
		expect(readFileSync(SQL, "utf8")).toContain(values);
	});
});
