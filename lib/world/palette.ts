// The village palette (spec 2026-10-09-osmo-village-design.md section 2). Every tile, frame and face is a grid of
// these letters, one letter per pixel, and "." is transparent. Each ramp below runs from darkest to lightest.
//
// The light rule. Light comes from the top left, on every tile and every frame:
// - the top row and the left column of a lit surface take the ramp's light or highlight step;
// - the bottom row and the right column take its shadow step, and the ramp's darkest step outlines the bottom and
//   right edges of each separate object (a stone, a brick, a plank, a shingle row, his body);
// - the base step fills the rest; at most one small highlight cluster per surface, left of and above its centre;
// - nothing is lit from the right or from below, and cast shadows fall down and to the right.
export const PALETTE = {
	// stone, for the island and the castle: outline, shadow, base, light, highlight
	a: "#23262f",
	b: "#3d4250",
	c: "#5d6475",
	d: "#868ea0",
	e: "#b9c0cd",
	// roof, terracotta: outline, shadow, base, highlight
	f: "#4a2320",
	g: "#7c3a2c",
	h: "#a9533a",
	i: "#d27a52",
	// wood: outline, shadow, base, highlight
	j: "#2e1d14",
	k: "#55361f",
	l: "#7d5530",
	m: "#a8794a",
	// snow: shadow, base, highlight (p is also the stars)
	n: "#93a7bd",
	o: "#d3dee9",
	p: "#f7fbff",
	// glass: dark, base, glint
	q: "#16243a",
	r: "#2f5683",
	s: "#86b8e0",
	// lamp light: warm light, flame, core
	t: "#ffcf6e",
	u: "#f08a3c",
	v: "#fff4cc",
	// banner cloth, deep teal: shadow, base, highlight
	w: "#1f4d4a",
	x: "#2f7a72",
	y: "#6fbfae",
	// roots and earth: outline, base, highlight
	z: "#1c120c",
	A: "#3e2a1c",
	B: "#6a4a30",
	// grass: shadow, base, highlight
	C: "#234a2a",
	D: "#3f7a3c",
	E: "#79b85a",
	// cloud: shadow, base (its highlight is p)
	F: "#9aa6bf",
	G: "#d6dcea",
	// Osmo: outline and hair, skin, skin shadow, coat base, coat light, coat shadow, shirt and eye whites (Bone),
	// hair highlight, pupils, boots
	H: "#1a1726",
	I: "#f0c7a0",
	J: "#c9926c",
	K: "#2c3f66",
	L: "#4462a0",
	M: "#1b2744",
	N: "#f3efe8",
	O: "#3b3350",
	P: "#0d0b14",
	Q: "#8a5a3c",
	// added in the art pass, for the tiles only: stone mid (between c and d), warm stone base and light, deep snow
	// shadow, roof glint, wood grain light, cloud mid, snow mid (between n and o)
	R: "#737b8d",
	S: "#6a6570",
	T: "#938c90",
	U: "#62779c",
	V: "#eca079",
	W: "#c8965e",
	X: "#b6bfd4",
	Y: "#b3c3d6",
	// his scarf: at runtime it takes the mood's first aura colour (raster overrides); this is its dev colour
	Z: "#3aa597",
} as const;

export type Letter = keyof typeof PALETTE;
export const TRANSPARENT = ".";
export const SCARF: Letter = "Z";
