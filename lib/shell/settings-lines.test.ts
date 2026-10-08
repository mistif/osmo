import { expect, it } from "vitest";
import { devicesLine, mayDoLine, placeLine, voiceLine } from "./settings-lines";

it("writes the five state lines in his register", () => {
	expect(devicesLine(2)).toBe("2 devices remember you.");
	expect(devicesLine(1)).toBe("1 device remembers you.");
	expect(devicesLine(0)).toBe("No device remembers you yet.");
	expect(voiceLine(true, false)).toBe("Natural voice on, listening off.");
	expect(mayDoLine(false, 6)).toBe("Paused: no. 6 things on.");
	expect(mayDoLine(true, 1)).toBe("Paused: yes. 1 thing on.");
	expect(placeLine("Rotterdam", false)).toBe("Saved: Rotterdam. Notifications off on this device.");
	expect(placeLine(null, true)).toBe("No place saved. Notifications on this device.");
	for (const s of [devicesLine(3), voiceLine(false, true), mayDoLine(false, 0), placeLine(null, false)]) expect(s).not.toContain("!");
});
