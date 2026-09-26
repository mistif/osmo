import { describe, expect, it } from "vitest";
import { deviceRow } from "./devices";

const now = new Date(2026, 8, 30, 15).getTime();
const at = (d: number, h = 10) => new Date(2026, 8, d, h).toISOString();

describe("deviceRow", () => {
	it("names a device and says when it was last used", () => {
		expect(deviceRow({ id: "a", friendly_name: "Work laptop", created_at: at(20), last_used_at: at(30, 9) }, now)).toEqual({ id: "a", name: "Work laptop", lastUsed: "Used today" });
		expect(deviceRow({ id: "b", friendly_name: "Phone", created_at: at(20), last_used_at: at(29) }, now).lastUsed).toBe("Used yesterday");
		expect(deviceRow({ id: "c", friendly_name: "Tablet", created_at: at(20), last_used_at: at(26) }, now).lastUsed).toBe("Used 4 days ago");
		expect(deviceRow({ id: "d", friendly_name: "Old", created_at: at(1), last_used_at: at(2) }, now).lastUsed).toBe("Used on 2 Sep");
	});

	it("still reads well with no name and no use", () => {
		expect(deviceRow({ id: "e", friendly_name: "  ", created_at: at(20) }, now)).toEqual({ id: "e", name: "Unnamed device", lastUsed: "Not used yet" });
	});
});
