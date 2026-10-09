// Osmo in the village (spec 3): one sprite, 16 by 32, 18 frames, and three face patches stamped over the facing
// frames. Light from the top left (see palette.ts). FRAME_NAMES is the cell order of the atlas and of the optional
// public/village/osmo-sheet.png (288 by 32).
//
// The frames are built from a few drawn parts so he stays one character: a head (side, front, three-quarter), a
// torso, legs per pose, and small patches painted over them (arms, the scarf's tail, the stone he lays).
import type { Grid } from "./raster";

export const FRAME_W = 16;
export const FRAME_H = 32;
export const FRAME_NAMES = [
	"idle-1", "idle-2", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6", "build-1", "build-2", "build-3",
	"build-4", "turn-1", "turn-2", "turn-3", "face-1", "face-2", "sit-1",
] as const;
export type FrameName = (typeof FRAME_NAMES)[number];

const EMPTY = "................";
const blank = (n: number): string[] => Array.from({ length: n }, () => EMPTY);
// Paints a patch over rows at (x, y); a space in the patch keeps what is underneath.
function paint(rows: readonly string[], x: number, y: number, patch: readonly string[]): string[] {
	const out = [...rows];
	patch.forEach((p, dy) => {
		const r = [...out[y + dy]];
		[...p].forEach((ch, dx) => {
			if (ch !== " ") r[x + dx] = ch;
		});
		out[y + dy] = r.join("");
	});
	return out;
}
const paints = (rows: readonly string[], ...patches: (readonly [number, number, readonly string[]])[]) =>
	patches.reduce<string[]>((acc, [x, y, p]) => paint(acc, x, y, p), [...rows]);

// --- Heads, rows 0 to 11. ---
const HEAD_SIDE = [
	EMPTY,
	".....HHHHHH.....",
	"....HOOOOHHH....",
	"...HOOHHHHHHH...",
	"...HOHHHHHHHHH..",
	"...HOHHHHHHJIH..",
	"...HHHHHHJIIIH..",
	"...HHHHJIIIIIH..",
	"...HHHJIIINPIH..",
	"...HHHJJIIIIIH..",
	"....HJIIIIIIHH..",
	"....HHJIIIIIJH..",
];
// Facing: the face box (columns 4 to 11, rows 7 to 10) is plain skin for the stamped face.
const HEAD_FRONT = [
	EMPTY,
	".....HHHHHH.....",
	"....HHOOOHHH....",
	"...HHOOHHHHHH...",
	"...HOHHHHHHHH...",
	"...HIIIHHHHHH...",
	"...HIIIIIIJHH...",
	"...HIIIIIIIIH...",
	"...HIIIIIIIIH...",
	"...HIIIIIIIIH...",
	"...HIIIIIIIIH...",
	"...HIIIIIIIJH...",
];
// Three-quarter to the right: the near eye, and the edge of the far one at the cheek.
const HEAD_TQ_SIDE = paints(HEAD_SIDE, [3, 5, ["HHHHHHJIIH"]], [3, 6, ["HHHHJIIIIH"]], [3, 7, ["HHHJIIIIIH"]], [3, 8, ["HHJIINPIINH"]], [3, 9, ["HHJIIIIIIIH."]], [3, 10, ["HHIIIIIHIIH"]]);
// Three-quarter toward the viewer: both eyes, the far one narrower.
const HEAD_TQ_FRONT = paints(HEAD_FRONT, [3, 8, ["HIINPNINPH"]], [3, 10, ["HIIIIIHIIH"]]);

// --- Torsos, rows 12 to 24, with no arm drawn; arms and the scarf's tail are painted on. ---
const TORSO_SIDE = [
	"....HZZZZZZZH...",
	"....ZZZZZZZZH...",
	"....HLLLLLLMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HMMMMMMMH...",
];
// The near arm in profile, painted at (3, 15): back, half back, down, half forward, forward.
const ARM = {
	back: ["    LKH", "   LKH ", "  LKH  ", " HLKH  ", "HLKH   ", "HIJH   ", " HH    ", "       ", "       "],
	backMid: ["    LKH", "    LKH", "   LKH ", "   LKH ", "  LKH  ", "  IJH  ", "  HH   ", "       ", "       "],
	down: ["    LKH", "    LKH", "    LKH", "    LKH", "    LKH", "    LKH", "    LKH", "    IJH", "    HHK"],
	fwdMid: ["    LKH", "    LKH", "     LKH", "     LKH", "      LKH", "      IJH", "      HH", "       ", "       "],
	fwd: ["    LKH", "    LKKH", "     LKKH", "      LKKH", "       LKH", "        IJH", "        HH", "       ", "       "],
} as const;
type Arm = keyof typeof ARM;
// Breathing in: the shoulders and chest one row higher (the scarf's lower row tucks under them), the hem stays.
const TORSO_IN = [TORSO_SIDE[0], "....ZZZZZLLMH...", ...TORSO_SIDE.slice(3, 12), TORSO_SIDE[11], TORSO_SIDE[12]];
// The scarf's tail behind him, painted at (0, 12): it hangs when he stands and streams back when he walks.
const TAIL = {
	hang: ["...H", "..HZ", ".HZZ", "HZZH", "HHH."],
	hang2: ["...H", "..HZ", ".HZZ", ".HZH", ".HH."],
	stream: [".HHH", "HZZZ", "HHZZ", "..HH", "...."],
	streamLow: ["..HH", "HHZZ", "HZZZ", "HHHH", "...."],
	streamHigh: ["HHHH", "HZZZ", ".HZZ", "..HH", "...."],
	flick: ["..HH", ".HZZ", "HZZZ", "HZHH", "HH.."],
} as const;
type Tail = keyof typeof TAIL;
const sideTorso = (arm: Arm, tail: Tail) => paints(TORSO_SIDE, [3, 3, ARM[arm]], [0, 0, TAIL[tail]]);

// --- Legs in profile, rows 25 to 31 (the first row is the coat's hem, where the legs come out). ---
const LEGS = {
	stand: [
		"....HHMMHMMHH...",
		".....HMMHMMH....",
		".....HMMHMMH....",
		".....HMMHMMHH...",
		"....HQQQHQQQQH..",
		"....HQQQHQQQQH..",
		"....HHHHHHHHHH..",
	],
	contact: [
		"....HHMMMMMHH...",
		"....HMMMHMMMH...",
		"...HMMHHHMMH....",
		"...HMMH..HMMH...",
		"..HQQH...HQQH...",
		"..HQQQH..HQQQH..",
		"..HHHHH..HHHHH..",
	],
	pass: [
		"....HHMMMMHH....",
		".....HMMMMH.....",
		"....HMMHMMH.....",
		"...HMMHHMMH.....",
		"..HQQH.HQQH.....",
		"..HHH..HQQQH....",
		".......HHHHH....",
	],
	up: [
		"....HHMMMMHH....",
		".....HMMMMH.....",
		".....HMMHMMH....",
		"....HMMH.HMMH...",
		"...HQQH..HQQQH..",
		"...HQQQH.HHHH...",
		"...HHHHH........",
	],
} as const;
// The down frame: the body one row lower, so the legs are one row shorter and more bent.
const LEGS_DOWN = [
	"....HHMMMMMHH...",
	"....HMMMHMMMH...",
	"...HMMHHHMMH....",
	"...HQQH.HQQH....",
	"...HQQH.HQQQH...",
	"...HHHH.HHHHH...",
];
const side = (arm: Arm, tail: Tail, legs: readonly string[], dip = 0): string[] =>
	dip ? [...blank(1), ...HEAD_SIDE, ...sideTorso(arm, tail), ...legs] : [...HEAD_SIDE, ...sideTorso(arm, tail), ...legs];

// --- Facing the viewer: both arms at his sides, a shirt strip down the centre, a belt. ---
const BODY_FRONT = [
	"...HZZZZZZZZH...",
	"..HZZZZZZZZZZH..",
	"..HLLLZNNLLLMH..",
	"..HLKMZNNKMKMH..",
	"..HLKMZNNKMKMH..",
	"..HLKMLNNKMKMH..",
	"..HLKMLNNKMKMH..",
	"..HLKMLNNKMKMH..",
	"..HLKMLNNKMKMH..",
	"..HLKMQQQQMKMH..",
	"..HIJMLKKKMIJH..",
	"..HHHMLKKKMHHH..",
	"....HLKKKKMH....",
	"....HMMHHMMH....",
	"....HMMHHMMH....",
	"....HMMHHMMH....",
	"....HMMHHMMH....",
	"...HQQQHHQQQH...",
	"...HQQQHHQQQH...",
	"...HHHHHHHHHH...",
];
// Breathing in: the shoulders rise a row, the hands with them; the head and the feet stay.
const BODY_FRONT_IN = [
	BODY_FRONT[0],
	"..HLZZZZZZZZMH..",
	BODY_FRONT[2],
	...BODY_FRONT.slice(4, 12),
	BODY_FRONT[12],
	BODY_FRONT[12],
	...BODY_FRONT.slice(13),
];

// --- Kneeling to build: the head drops to row 6, the back knee on the ground, the front foot planted. ---
const KNEEL_TORSO = [
	"....HZZZZZZZH...",
	"....ZZZZZZZZH...",
	"....HLLLLLLMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HMMMMMMMH...",
];
const KNEEL_LEGS = [
	"....HMMMMMMMH...",
	"....HMMMHMMMMH..",
	"....HMMMHHHMMH..",
	"....HMMMH.HMMH..",
	"HHHHHMMMHHQQQH..",
	"HQMMMMMMHHQQQQH.",
	"HHHHHHHHHHHHHHH.",
];
const KNEEL = [...blank(5), ...HEAD_SIDE, ...KNEEL_TORSO, ...KNEEL_LEGS];
// The stone he lays: e top-left, d, an a outline; on the ground it sits at his toes.
const BLOCK = ["eda", "dda", "aaa"];
const SET_BLOCK = [13, 29, BLOCK] as const;
type Patch = readonly [number, number, readonly string[]];
const kneel = (tail: Tail, ...patches: Patch[]) => paints(KNEEL, [0, 17, TAIL[tail]], ...patches);
// His arm from the shoulder (row 20), painted at (5, 20).
const BUILD = {
	// The arm drawn back and bent, the stone held close at his chest.
	hold: ["  LKH  ", "  LKH  ", "  LKKKH", "  HHHIJ"],
	// The arm raised, the stone lifted to his face.
	raise: ["        IJH", "       LKH ", "      LKH  ", "     LKH   ", "    LKH    ", "   LKH     ", "  LKH      ", " LKH       "],
	// The arm reaching down to the ground, pressing the stone in.
	press: ["  LKH", "   LKH", "    LKH", "     LKH", "      LKH", "       LKH", "       HIJH", "       HIJH", "        HH"],
	// The hand open over the set stone, the arm coming back.
	release: ["  LKH", "   LKH", "    LKH", "     LKH", "     HIJH", "     HIHIH"],
} as const;

// --- Sitting on the bench (its seat is row 24): head tipped forward, the eye closed, a hand in his lap. ---
const HEAD_SIT = paints(
	HEAD_SIDE.map((r) => "." + r.slice(0, 15)),
	[11, 8, ["II"]],
	[11, 9, ["HH"]],
	[13, 10, ["I"]],
);
const SIT = [
	...blank(2),
	...HEAD_SIT,
	"...HHZZZZZZZZH..",
	"..HZZZZZZZZZH...",
	".HZZHLLLLLLMH...",
	"HZZHHLKLKHKMH...",
	"HHH.HLKLKHKMH...",
	"....HLKLKHKMH...",
	"....HLKLKHKMH...",
	"....HLKIJHKMH...",
	"....HLKHHKKKKHH.",
	"....HMMMMMMMMMH.",
	"....HHHHHHHHMMH.",
	"...........HMMH.",
	"...........HMMH.",
	"...........HMMH.",
	"...........HMMH.",
	"..........HQQQH.",
	"..........HQQQQH",
	"..........HHHHHH",
];

export const FRAMES: Readonly<Record<FrameName, Grid>> = {
	"idle-1": side("down", "hang", LEGS.stand),
	"idle-2": [...HEAD_SIDE, ...paints(TORSO_IN, [3, 2, ARM.down], [0, 0, TAIL.hang2]), ...LEGS.stand],
	"walk-1": side("back", "stream", LEGS.contact),
	"walk-2": side("backMid", "streamLow", LEGS_DOWN, 1),
	"walk-3": side("down", "streamHigh", LEGS.pass),
	"walk-4": side("fwdMid", "stream", LEGS.up),
	"walk-5": side("fwd", "streamLow", LEGS.contact),
	"walk-6": side("down", "flick", LEGS.pass),
	"build-1": kneel("hang", [5, 20, BUILD.hold], [12, 19, BLOCK]),
	"build-2": kneel("hang2", [5, 12, BUILD.raise], [13, 9, BLOCK]),
	"build-3": kneel("hang", [5, 20, BUILD.press], SET_BLOCK),
	"build-4": kneel("hang2", [5, 20, BUILD.release], SET_BLOCK),
	"turn-1": [...HEAD_TQ_SIDE, ...paints(TORSO_SIDE, [9, 3, ["NH", "NH", "NH", "NH", "NH", "NH"]], [3, 3, ARM.down], [0, 0, TAIL.hang]), ...LEGS.stand],
	"turn-2": [...HEAD_TQ_FRONT, ...paints(BODY_FRONT, [6, 3, ["ZLNN", "ZLNN", "LLNN", "LLNN", "LLNN", "LLNN"]])],
	"turn-3": [...HEAD_FRONT, ...paints(BODY_FRONT, [12, 16, ["H"]], [8, 17, ["HQQQQH", "HQQQQH", "HHHHHH"]], [6, 2, ["L", "L"]])],
	"face-1": [...HEAD_FRONT, ...BODY_FRONT],
	"face-2": [...HEAD_FRONT, ...BODY_FRONT_IN],
	"sit-1": SIT,
};
const FRAME_INDEX = new Map<FrameName, number>(FRAME_NAMES.map((n, i) => [n, i]));
export const frameIndex = (name: FrameName): number => FRAME_INDEX.get(name) ?? 0;

export const FACE_IDS = ["warm", "attentive", "tired"] as const;
export type FaceId = (typeof FACE_IDS)[number];
export type Gaze = -1 | 0 | 1;
export const FACE_W = 8;
export const FACE_H = 4;
// Where a face patch goes in a facing frame, in sprite pixels.
export const FACE_AT = { x: 4, y: 7 } as const;
export const FACES: Readonly<Record<FaceId, Grid>> = {
	warm: ["........", "NPN..NPN", "..H..H..", "...HH..."],
	attentive: [".HH..HH.", "NPN..NPN", "........", "...HH..."],
	tired: ["........", "HHH..HHH", "NPN..NPN", "..HHHH.."],
};

// The pupils within their 3-pixel eyes: -1 to his right (the viewer's left), 0 at Gur, 1 the other way.
const EYES = [[0, 2], [5, 7]] as const;
export function withGaze(face: Grid, gaze: Gaze): Grid {
	return face.map((row) => {
		const out = [...row];
		for (const [from, to] of EYES) {
			if (!out.slice(from, to + 1).includes("P")) continue;
			for (let i = from; i <= to; i++) out[i] = "N";
			out[from + 1 + gaze] = "P";
		}
		return out.join("");
	});
}
export const faceCell = (face: FaceId, gaze: Gaze): number => FACE_IDS.indexOf(face) * 3 + gaze + 1;
const GAZES: readonly Gaze[] = [-1, 0, 1];
export const FACE_CELLS: readonly Grid[] = FACE_IDS.flatMap((f) => GAZES.map((g) => withGaze(FACES[f], g)));
