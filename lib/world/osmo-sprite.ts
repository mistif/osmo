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

// --- Torsos, rows 12 to 24, with no arm drawn; arms and the scarf's tail are painted on. The coat's lit edge (4) runs
// along the top of his shoulders and down his back, the side toward the light. ---
const TORSO_SIDE = [
	"....HZZZZZZZH...",
	"....ZZZZZZZZH...",
	"....H44444LMH...",
	"....H4KKKKKMH...",
	"....H4KKKKKMH...",
	"....H4KKKKKMH...",
	"....H4KKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HMMMMMMMH...",
];
// Breathing in: the shoulders and chest one row higher (the scarf's lower row tucks under them), the hem stays.
const TORSO_IN = [TORSO_SIDE[0], "....ZZZZZ44MH...", ...TORSO_SIDE.slice(3, 12), TORSO_SIDE[11], TORSO_SIDE[12]];
// The near arm in profile, painted from the shoulder (row 15) at column 0; a space keeps what is under it. The near
// arm swings against the near leg; when it is back, the far hand shows past his chest, and the other way round.
const ARM = {
	back: ["       4KH", "      LKH", "     LKH", "    LKH", "   HLKH", "  HLKH", "  HIJH", "   HH"],
	backMid: ["       4KH", "      LKH", "      LKH", "     LKH", "     LKH", "    HLKH", "    HIJH", "     HH"],
	down: ["       4KH", "       LKH", "       LKH", "       LKH", "       LKH", "       LKH", "       LKH", "       IJH", "       HH"],
	fwdMid: ["       4KH", "       LKH", "        LKH", "        LKH", "         LKH", "         LKH", "         HIJH", "          HH"],
	fwd: ["       4KH", "       LKKH", "        LKKH", "         LKKH", "          LKH", "          HLKH", "           HIJH", "            HH"],
} as const;
type Arm = keyof typeof ARM;
// The far hand, past his chest or his back, painted at row 19.
const FAR = {
	none: [],
	fwd: ["            MH", "            HJH", "             H"],
	back: ["   HM", "  HJH", "   H"],
} as const;
type Far = keyof typeof FAR;
// The scarf's tail behind him, painted at (0, 12) of the frame: it hangs when he stands; as he walks it is a short root
// that the trail cells (TRAIL_CELLS) continue, at the same rows whether his body is up or down.
const TAIL = {
	hang: ["...H", "..HZ", ".HZZ", "HZZH", "HHH."],
	hang2: ["...H", "..HZ", ".HZZ", ".HZH", ".HH."],
	root: ["HHHH", "ZZZZ", "ZZZZ", "HHHH"],
} as const;
type Tail = keyof typeof TAIL;

// --- Legs in profile, rows 25 to 31 (one row fewer when he is down): trousers 2 with the shadow side 3, the far leg in
// 3 and its boot in k, the near boot Q. ---
const LEGS = {
	stand: [
		".....H33H223H...",
		".....H33H223H...",
		".....H33H223H...",
		".....H33H223H...",
		".....HkkHQQQQH..",
		".....HkkHQQQQQH.",
		".....HHHHHHHHHH.",
	],
	// Contact: the near leg forward, the far leg back, both feet down.
	contact: [
		"....H33H2223H...",
		"...H33H.H223H...",
		"..H33H...H223H..",
		"..H33H...H223H..",
		"..HkkkH..HQQQQH.",
		"..HkkkkH.HQQQQH.",
		"..HHHHHH.HHHHHH.",
	],
	// Down: the body a row lower, the knees bent, the feet closer.
	down: [
		"....H33H2223H...",
		"...H33H.H223H...",
		"..H33H..H223H...",
		"..HkkkH.HQQQQH..",
		"..HkkkkHHQQQQH..",
		"..HHHHHHHHHHHH..",
	],
	// Passing: the near leg straight under him, the far foot lifted behind.
	pass: [
		".....H33223H....",
		".....H33223H....",
		"....H33H223H....",
		"..HkkkkH223H....",
		"..HHHHHHQQQQH...",
		".......HQQQQQH..",
		".......HHHHHHH..",
	],
	// The other contact: the far leg forward, the near leg back.
	contact2: [
		"....H22333H.....",
		"...H223HH33H....",
		"..H223H..H33H...",
		"..H223H..H33H...",
		"..HQQQH..HkkkkH.",
		".HQQQQH..HkkkkH.",
		".HHHHHH..HHHHHH.",
	],
	down2: [
		"....H22333H.....",
		"...H223HH33H....",
		"..H223H.H33H....",
		"..HQQQH.HkkkkH..",
		".HQQQQHHkkkkH...",
		".HHHHHHHHHHHH...",
	],
	// The other passing: the far leg straight under him, the near foot lifted behind.
	pass2: [
		".....H22333H....",
		"....H223H33H....",
		"...H223HH33H....",
		"..HQQQH.H33H....",
		"..HHHHH.HkkkkH..",
		"........HkkkkkH.",
		"........HHHHHHH.",
	],
} as const;
type Legs = keyof typeof LEGS;
// A frame in profile: head, torso with the far hand and the near arm, legs; down = the body a row lower.
function side(arm: Arm, tail: Tail, legs: Legs, far: Far = "none", down = false): string[] {
	const torso = paints(TORSO_SIDE, [0, 7, FAR[far]], [0, 3, ARM[arm]]);
	const body = [...(down ? blank(1) : []), ...HEAD_SIDE, ...torso, ...LEGS[legs]];
	return paint(body, 0, 12, TAIL[tail]);
}

// --- Facing the viewer: both arms at his sides, a shirt strip down the centre, a belt, two legs in trousers. ---
const BODY_FRONT = [
	"...HZZZZZZZZH...",
	"..HZZZZZZZZZZH..",
	"..H444ZNN44LMH..",
	"..H4KMZNNKMKMH..",
	"..H4KMZNNKMKMH..",
	"..H4KMLNNKMKMH..",
	"..HLKMLNNKMKMH..",
	"..HLKMLNNKMKMH..",
	"..HLKMLNNKMKMH..",
	"..HLKMQQQQMKMH..",
	"..HIJMLKKKMIJH..",
	"..HHHMLKKKMHHH..",
	"....HLKKKKMH....",
	"....H23HH23H....",
	"....H23HH23H....",
	"....H23HH23H....",
	"....H23HH23H....",
	"...HQQQHHQQkH...",
	"...HQQQHHQQkH...",
	"...HHHHHHHHHH...",
];
// Breathing in: the shoulders rise a row, the hands with them; the head and the feet stay.
const BODY_FRONT_IN = [
	BODY_FRONT[0],
	"..H4ZZZZZZZZMH..",
	BODY_FRONT[2],
	...BODY_FRONT.slice(4, 12),
	BODY_FRONT[12],
	BODY_FRONT[12],
	...BODY_FRONT.slice(13),
];

// --- Kneeling to build: the head drops to row 6, the far knee on the ground, the near foot planted by the stone. ---
const KNEEL_TORSO = [
	"....HZZZZZZZH...",
	"....ZZZZZZZZH...",
	"....H44444LMH...",
	"....H4KKKKKMH...",
	"....H4KKKKKMH...",
	"....HLKKKKKMH...",
	"....HLKKKKKMH...",
	"....HMMMMMMMH...",
];
const KNEEL_LEGS = [
	"....H3332222H...",
	"....H333H2223H..",
	"....H333HH223H..",
	"....H333H.H23H..",
	"HHHHH333HQQQQH..",
	"Hk333333HQQQQH..",
	"HHHHHHHHHHHHHH..",
];
// The stone he lays: e top-left, d, an a outline; on the ground it sits at his toes.
const BLOCK = ["eda", "dda", "aaa"];
const KNEEL = paints([...blank(5), ...HEAD_SIDE, ...KNEEL_TORSO, ...KNEEL_LEGS], [13, 29, BLOCK]);
type Patch = readonly [number, number, readonly string[]];
const kneel = (tail: Tail, ...patches: Patch[]) => paints(KNEEL, [0, 17, TAIL[tail]], ...patches);
// The hammer in his near hand, painted at (0, 0) of the frame: the handle in wood (l lit, k shadow), the head c with
// a b shadow and an a outline. Raised over his head, swinging down past his shoulder, on the stone, the rebound.
const SWING = {
	raised: [
		"",
		"",
		" aaaaa",
		" aecca",
		" abbba",
		" aaaaa",
		"   lk",
		"   lk",
		"   lk",
		"   lk",
		"   lk",
		"  HIJH",
		"  HLKH",
		"   LKH",
		"   LKH",
		"    LKH",
		"    LKH",
		"     LKH",
		"     LKH",
		"      LKH",
		"       LKH",
	],
	down: [
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
		"            aaaa",
		"            aeba",
		"        HIJlacba",
		"       LKKHkacba",
		"      LKH   aaaa",
		"      LKH",
	],
	strike: [
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
		"       LKH",
		"       LKH",
		"        LKH",
		"        LKH",
		"        LKH aaaa",
		"        HIJlaeba",
		"         HHkacba",
		"            acba",
		"            aaaa",
	],
	rebound: [
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
		"       LKH  aaaa",
		"        LKH aeba",
		"        HIJlacba",
		"         HHkacba",
		"            aaaa",
	],
} as const;
const swing = (s: keyof typeof SWING): Patch => [0, 0, SWING[s]];

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
	".HZZH4444LLMH...",
	"HZZHH4KLKHKMH...",
	"HHH.H4KLKHKMH...",
	"....H4KLKHKMH...",
	"....HLKLKHKMH...",
	"....HLKIJHKMH...",
	"....HLKHH22222H.",
	"....H333333333H.",
	"....HHHHHHHH23H.",
	"...........H23H.",
	"...........H23H.",
	"...........H23H.",
	"...........H23H.",
	"..........HQQQH.",
	"..........HQQQQH",
	"..........HHHHHH",
];

const TURN_SHIRT = ["NH", "NH", "NH", "NH", "NH", "NH"];
export const FRAMES: Readonly<Record<FrameName, Grid>> = {
	"idle-1": side("down", "hang", "stand"),
	"idle-2": paint([...HEAD_SIDE, ...paints(TORSO_IN, [0, 2, ARM.down]), ...LEGS.stand], 0, 12, TAIL.hang2),
	"walk-1": side("back", "root", "contact", "fwd"),
	"walk-2": side("backMid", "root", "down", "none", true),
	"walk-3": side("down", "root", "pass"),
	"walk-4": side("fwd", "root", "contact2", "back"),
	"walk-5": side("fwdMid", "root", "down2", "none", true),
	"walk-6": side("down", "root", "pass2"),
	"build-1": kneel("hang", swing("raised")),
	"build-2": kneel("hang2", swing("down")),
	"build-3": kneel("hang", swing("strike")),
	"build-4": kneel("hang2", swing("rebound")),
	"turn-1": paint([...HEAD_TQ_SIDE, ...paints(TORSO_SIDE, [10, 3, TURN_SHIRT], [0, 3, ARM.down]), ...LEGS.stand], 0, 12, TAIL.hang),
	"turn-2": [...HEAD_TQ_FRONT, ...paints(BODY_FRONT, [6, 3, ["ZLNN", "ZLNN", "LLNN", "LLNN", "LLNN", "LLNN"]])],
	"turn-3": [...HEAD_FRONT, ...paints(BODY_FRONT, [12, 16, ["H"]], [8, 17, ["HQQQQH", "HQQQQH", "HHHHHH"]], [6, 2, ["4", "L"]])],
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
	warm: ["N1N..N1N", "NPN..NPN", "J.H..H.J", "...HH..."],
	attentive: [".HH..HH.", "N1N..N1N", "NPN..NPN", "...HH..."],
	tired: ["HHH..HHH", "N1N..N1N", "NPN..NPN", "..HHHH.."],
};

// The pupils within their 3-pixel eyes: -1 to his right (the viewer's left), 0 at Gur, 1 the other way. Since the
// polish pass an eye is two rows, the glint 1 over the pupil P in one column; the gaze moves that column, glint and
// pupil together, and leaves the whites N round it.
const EYES = [[0, 2], [5, 7]] as const;
export function withGaze(face: Grid, gaze: Gaze): Grid {
	return face.map((row) => {
		const out = [...row];
		for (const [from, to] of EYES) {
			const i = out.slice(from, to + 1).findIndex((c) => c === "P" || c === "1");
			if (i < 0) continue;
			const ch = out[from + i];
			for (let k = from; k <= to; k++) out[k] = "N";
			out[from + 1 + gaze] = ch;
		}
		return out.join("");
	});
}
// His eyes shut, one patch per face, the same size and place as the face (the polish pass's blink, actor.ts).
export const BLINKS: Readonly<Record<FaceId, Grid>> = {
	warm: ["........", "HHH..HHH", "J.H..H.J", "...HH..."],
	attentive: [".HH..HH.", "JJJ..JJJ", "HHH..HHH", "...HH..."],
	tired: ["HHH..HHH", "JJJ..JJJ", "HHH..HHH", "..HHHH.."],
};
export const faceCell = (face: FaceId, gaze: Gaze): number => FACE_IDS.indexOf(face) * 3 + gaze + 1;
// The blink cells come after the nine face cells, one per face, in FACE_IDS order.
export const blinkCell = (face: FaceId): number => FACE_IDS.length * 3 + FACE_IDS.indexOf(face);
const GAZES: readonly Gaze[] = [-1, 0, 1];
export const FACE_CELLS: readonly Grid[] = [...FACE_IDS.flatMap((f) => GAZES.map((g) => withGaze(FACES[f], g))), ...FACE_IDS.map((f) => BLINKS[f])];

// The polish pass: the end of his scarf streaming behind him as he walks, two cells that swap (actor.ts TRAIL_MS).
// Facing right, a cell's top-left sits at TRAIL_AT from the sprite's top-left, so its right edge overlaps the root of
// the tail drawn in the walk frames (columns 0 and 1); facing left the renderer mirrors it onto the other side.
export const TRAIL_W = 8;
export const TRAIL_H = 6;
export const TRAIL_AT = { x: -6, y: 12 } as const;
export const TRAIL_CELLS: readonly Grid[] = [
	["ZZHHHHHH", "HZZZZZZZ", ".HHZZZZZ", "...HHHHH", "........", "........"],
	["......HH", "....HHZZ", "HH.HZZZZ", "ZZHZZZHH", "HZZZHH..", ".HHH...."],
];
