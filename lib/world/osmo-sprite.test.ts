import { describe, expect, it } from "vitest";
import {
	FACE_AT, FACE_CELLS, FACE_H, FACE_IDS, FACE_W, FACES, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex, withGaze,
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
		expect(f.join("")).toMatch(/^[HIJKLMNOPQZade.]+$/);
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

describe("his faces", () => {
	it("are 8 by 4 with exactly two pupils", () => {
		for (const id of FACE_IDS) {
			expect(gridProblems(FACES[id], FACE_W, FACE_H)).toEqual([]);
			expect(FACES[id].join("")).toMatch(/^[HJNP.]+$/);
			expect(FACES[id].join("").split("P")).toHaveLength(3);
		}
	});
	it("moves both pupils with his gaze and nothing else", () => {
		expect(withGaze(["NPN..NPN"], -1)).toEqual(["PNN..PNN"]);
		expect(withGaze(["NPN..NPN"], 0)).toEqual(["NPN..NPN"]);
		expect(withGaze(["NPN..NPN"], 1)).toEqual(["NNP..NNP"]);
		expect(withGaze(["HHH..HHH", "NPN..NPN"], 1)).toEqual(["HHH..HHH", "NNP..NNP"]);
	});
	it("lays out the face cells three gazes per face", () => {
		expect(FACE_CELLS).toHaveLength(9);
		expect(faceCell("warm", -1)).toBe(0);
		expect(faceCell("warm", 0)).toBe(1);
		expect(faceCell("tired", 1)).toBe(8);
		expect(FACE_CELLS[faceCell("attentive", -1)]).toEqual(withGaze(FACES.attentive, -1));
	});
});
