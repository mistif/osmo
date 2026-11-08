import { describe, expect, it } from "vitest";
import {
	BLINKS, blinkCell, FACE_AT, FACE_CELLS, FACE_H, FACE_IDS, FACE_W, FACES, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex,
	TRAIL_AT, TRAIL_CELLS, TRAIL_H, TRAIL_W, withGaze,
} from "./osmo-sprite";
import { snapshot } from "./png";
import { colours, gridProblems, rasterize } from "./raster";

const NAMES = [
	"idle-1", "idle-2", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6", "build-1", "build-2", "build-3",
	"build-4", "turn-1", "turn-2", "turn-3", "face-1", "face-2", "sit-1",
];

describe("his frames", () => {
	it("are the 18 frames in the fixed cell order", () => {
		expect([...FRAME_NAMES]).toEqual(NAMES);
		expect(Object.keys(FRAMES).sort()).toEqual([...NAMES].sort());
		expect(frameIndex("idle-1")).toBe(0);
		expect(frameIndex("sit-1")).toBe(17);
	});
	it.each([...FRAME_NAMES])("%s is 16 by 32 in his letters, wears the scarf, and stands on row 31", (name) => {
		const f = FRAMES[name];
		expect(gridProblems(f, FRAME_W, FRAME_H)).toEqual([]);
		expect(f.join("")).toMatch(/^[HIJKLMNOPQZ0234abcdeklm.]+$/);
		expect(f.join("")).toContain("Z");
		expect(f[31].replace(/\./g, "").length).toBeGreaterThan(0);
	});
	it("never repeats a frame", () => {
		const all = FRAME_NAMES.map((n) => FRAMES[n].join("\n"));
		expect(new Set(all).size).toBe(all.length);
	});
	it("leaves the face box plain skin where a face is stamped", () => {
		for (const name of ["turn-3", "face-1", "face-2"] as const) {
			for (let y = FACE_AT.y; y < FACE_AT.y + FACE_H; y++) {
				expect(FRAMES[name][y].slice(FACE_AT.x, FACE_AT.x + FACE_W)).toBe("I".repeat(FACE_W));
			}
		}
	});
	it("writes a contact sheet when WORLD_SNAPSHOT_DIR is set", () => {
		const bmp = rasterize(FRAME_NAMES.map((n) => FRAMES[n]), FRAME_W, FRAME_H, 6, colours({ Z: "hsl(172 38% 50%)" }));
		snapshot("osmo-frames", bmp);
		expect(bmp.w).toBe(18 * 96);
	});
});

// The polish pass's detail pass on him (spec 3's 16 by 32 and 18 frames unchanged).
const legRows = (name: (typeof FRAME_NAMES)[number]) => FRAMES[name].slice(25, 31).join("");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
describe("his detail pass (polish pass)", () => {
	it("wears trousers a tone apart from his outline, so his legs read, in every standing and walking frame", () => {
		for (const name of ["idle-1", "idle-2", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6", "turn-1"] as const) {
			expect(count(legRows(name), /[23]/g), name).toBeGreaterThanOrEqual(6);
		}
		const lum = (hex: string) => {
			const n = parseInt(hex.slice(1), 16);
			return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
		};
		const c = colours();
		const l = (ch: string) => lum(`#${[0, 1, 2].map((i) => c[ch][i].toString(16).padStart(2, "0")).join("")}`);
		expect(l("3") - l("H")).toBeGreaterThan(20);
		expect(l("2") - l("M")).toBeGreaterThan(30);
	});
	it("lights the edge of his coat", () => {
		for (const name of ["idle-1", "walk-1", "build-1", "face-1"] as const) expect(FRAMES[name].join(""), name).toContain("4");
	});
	it("breathes with his chest only: the head and the feet stay, standing and facing", () => {
		for (const [out, inn] of [["idle-1", "idle-2"], ["face-1", "face-2"]] as const) {
			expect(FRAMES[inn].slice(0, 11), inn).toEqual(FRAMES[out].slice(0, 11));
			expect(FRAMES[inn].slice(27), inn).toEqual(FRAMES[out].slice(27));
			expect(FRAMES[inn], inn).not.toEqual(FRAMES[out]);
		}
	});
	it("bobs as he walks: the down frames sit a row lower than the contact frames", () => {
		const top = (name: (typeof FRAME_NAMES)[number]) => FRAMES[name].findIndex((r) => r.replace(/\./g, "") !== "");
		expect(top("walk-2")).toBe(top("walk-1") + 1);
		expect(top("walk-5")).toBe(top("walk-4") + 1);
	});
	it("swings a hammer as he builds: raised over his head, then down on the stone at his toes", () => {
		const head = (name: (typeof FRAME_NAMES)[number]) => {
			const rows = FRAMES[name].map((r, y) => [y, [...r].filter((ch) => ch === "c").length] as const).filter(([, n]) => n > 0);
			return rows.length === 0 ? -1 : rows.reduce((a, [y, n]) => a + y * n, 0) / rows.reduce((a, [, n]) => a + n, 0);
		};
		for (const name of ["build-1", "build-2", "build-3", "build-4"] as const) {
			expect(FRAMES[name].join(""), name).toMatch(/[kl]/); // the handle
			expect(head(name), name).toBeGreaterThan(-1); // the head
		}
		expect(head("build-1")).toBeLessThan(14);
		expect(head("build-3")).toBeGreaterThan(24);
	});
});

describe("his eyes, blinks and scarf (polish pass)", () => {
	it("are two rows each: a glint over the pupil, both moved by his gaze", () => {
		for (const id of FACE_IDS) {
			expect(FACES[id].join("")).toMatch(/^[HIJNP1.]+$/);
			expect(count(FACES[id].join(""), /1/g)).toBe(2);
			FACES[id].forEach((row, y) => {
				[...row].forEach((ch, x) => {
					if (ch === "1") expect(FACES[id][y + 1]?.[x], `${id} ${x},${y}`).toBe("P");
				});
			});
		}
		expect(withGaze(["N1N..N1N", "NPN..NPN"], 1)).toEqual(["NN1..NN1", "NNP..NNP"]);
		expect(withGaze(["N1N..N1N", "NPN..NPN"], -1)).toEqual(["1NN..1NN", "PNN..PNN"]);
	});
	it("shut for a blink: one patch per face, no pupil, after the nine face cells", () => {
		expect(FACE_CELLS).toHaveLength(12);
		for (const id of FACE_IDS) {
			expect(gridProblems(BLINKS[id], FACE_W, FACE_H)).toEqual([]);
			expect(BLINKS[id].join("")).not.toMatch(/[P1N]/);
			expect(FACE_CELLS[blinkCell(id)]).toEqual(BLINKS[id]);
		}
		expect(blinkCell("warm")).toBe(9);
		expect(blinkCell("tired")).toBe(11);
	});
	it("trails his scarf in two cells of 8 by 6 in his letters, reaching back from the root of the tail", () => {
		expect(TRAIL_CELLS).toHaveLength(2);
		for (const g of TRAIL_CELLS) {
			expect(gridProblems(g, TRAIL_W, TRAIL_H)).toEqual([]);
			expect(g.join("")).toMatch(/^[HZ.]+$/);
			expect(g.join("")).toContain("Z");
		}
		expect(TRAIL_CELLS[0]).not.toEqual(TRAIL_CELLS[1]);
		expect(TRAIL_AT.x + TRAIL_W).toBeGreaterThan(0); // it overlaps the sprite's first columns
		expect(TRAIL_AT.x + TRAIL_W).toBeLessThanOrEqual(3);
	});
});

describe("his faces", () => {
	it("are 8 by 4 with exactly two pupils", () => {
		for (const id of FACE_IDS) {
			expect(gridProblems(FACES[id], FACE_W, FACE_H)).toEqual([]);
			expect(FACES[id].join("")).toMatch(/^[HIJNP1.]+$/);
			expect(FACES[id].join("").split("P")).toHaveLength(3);
		}
	});
	it("moves both pupils with his gaze and nothing else", () => {
		expect(withGaze(["NPN..NPN"], -1)).toEqual(["PNN..PNN"]);
		expect(withGaze(["NPN..NPN"], 0)).toEqual(["NPN..NPN"]);
		expect(withGaze(["NPN..NPN"], 1)).toEqual(["NNP..NNP"]);
		expect(withGaze(["HHH..HHH", "NPN..NPN"], 1)).toEqual(["HHH..HHH", "NNP..NNP"]);
	});
	it("lays out the face cells three gazes per face, then a blink for each", () => {
		expect(FACE_CELLS).toHaveLength(12);
		expect(faceCell("warm", -1)).toBe(0);
		expect(faceCell("warm", 0)).toBe(1);
		expect(faceCell("tired", 1)).toBe(8);
		expect(FACE_CELLS[faceCell("attentive", -1)]).toEqual(withGaze(FACES.attentive, -1));
	});
});
