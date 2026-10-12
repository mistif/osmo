// The parts library (spec docs/superpowers/specs/2026-10-11-osmo-free-will-design.md section 4.1): the 47 pieces every
// free build is put together from, each a small letter grid with a legend, as a blueprint's. The grids are ours, drawn
// here as letter grids; nothing is copied or traced from any game. How a part takes a width (its fit) and where it may
// go (its role) are in types.ts and "The grammar, in one place" in docs/superpowers/plans/2026-10-11-osmo-free-will.md.
// Drawn to the rules (rules.ts): every block is held from below or beside (a stair is a solid flight, a canopy rests on
// its trunk and spreads sideways), and no lantern or banner is in a map (decor goes in the decor grid; a lamp in a map is
// a window). Row parts: every row is a left cap, a fill pattern and a right cap, all the same length; storeys are a beam
// row over three wall rows, their windows window-top over window, spaced so they sit evenly at every odd width.
import type { Layer } from "../blueprints/types";
import type { TileId } from "../tiles";
import type { Part } from "./types";

const L = (tile: TileId, layer: Layer) => ({ tile, layer });

export const PARTS: readonly Part[] = [
	// Structure: floors, wall storeys, the balcony, the door and shutters.
	{ id: "floor-step", name: "stone step", group: "structure", role: "floor", material: null, fit: "row", overhang: 1, map: ["SSS"], legend: { S: L("step", "floor") } },
	{ id: "floor-boards", name: "wooden floor", group: "structure", role: "floor", material: "wood", fit: "row", overhang: 1, map: ["BBB"], legend: { B: L("deck", "floor") } },
	{ id: "storey-brick", name: "brick wall", group: "structure", role: "storey", material: "brick", fit: "row",
		map: ["hhhhhh", "IBBvBI", "IBBwBI", "IBBBBI"],
		legend: { h: L("beam-h", "walls"), I: L("pillar", "walls"), B: L("brick", "walls"), v: L("window-top", "windows"), w: L("window", "windows") } },
	{ id: "storey-stone", name: "stone wall", group: "structure", role: "storey", material: "stone", fit: "row",
		map: ["hhhhhh", "ISSvSI", "ISSwSI", "ISSSSI"],
		legend: { h: L("beam-h", "walls"), I: L("pillar", "walls"), S: L("stone-wall", "walls"), v: L("window-top", "windows"), w: L("window", "windows") } },
	{ id: "storey-wood", name: "wooden wall", group: "structure", role: "storey", material: "wood", fit: "row",
		map: ["hhhhhh", "PKKvKP", "PKKwKP", "PKKKKP"],
		legend: { h: L("beam-h", "walls"), P: L("post", "walls"), K: L("plank-wall", "walls"), v: L("window-top", "windows"), w: L("window", "windows") } },
	{ id: "storey-open-wood", name: "open timber frame", group: "structure", role: "storey", material: "wood", fit: "row",
		map: ["hhhhhh", "PkkkPP", "PkkkPP", "PkkkPP"],
		legend: { h: L("beam-h", "walls"), P: L("post", "walls"), k: L("back-wood", "backwall") } },
	{ id: "storey-open-stone", name: "open stone arcade", group: "structure", role: "storey", material: "stone", fit: "row",
		map: ["hhhhhh", "IbbbII", "IbbbII", "IbbbII"],
		legend: { h: L("beam-h", "walls"), I: L("pillar", "walls"), b: L("back-stone", "backwall") } },
	{ id: "storey-glass", name: "glass wall", group: "structure", role: "storey", material: null, fit: "row",
		map: ["hhhhhh", "PgggPP", "PgggPP", "PgggPP"],
		legend: { h: L("beam-h", "walls"), P: L("post", "walls"), g: L("glass-wall", "walls") } },
	{ id: "beam-balcony", name: "railed balcony", group: "additions", role: "beam", material: null, fit: "row", overhang: 1,
		map: ["rrr", "BBB"], legend: { r: L("rail", "walls"), B: L("deck", "walls") } },
	{ id: "door-oak", name: "oak door", group: "structure", role: "door", material: null, fit: "fixed", map: ["a", "d"], legend: { a: L("door-top", "door"), d: L("door", "door") } },
	{ id: "decor-shutter", name: "shutters", group: "structure", role: "decor", material: null, fit: "fixed", map: ["s", "s"], legend: { s: L("shutter", "banners") } },
	// Tops: roofs, crowns, the chimney and what stands on a roof or a storey.
	{ id: "roof-tile-gable", name: "tiled roof", group: "tops", role: "roof", material: null, fit: "gable", map: ["<=>^"],
		legend: { "<": L("roof-left", "roof"), "=": L("roof-flat", "roof"), ">": L("roof-right", "roof"), "^": L("roof-peak", "roof") } },
	{ id: "roof-thatch-gable", name: "thatched roof", group: "tops", role: "roof", material: null, fit: "gable", map: ["<=>^"],
		legend: { "<": L("thatch-l", "roof"), "=": L("thatch-flat", "roof"), ">": L("thatch-r", "roof"), "^": L("thatch-peak", "roof") } },
	// Its slopes are 2:1, each over two cells (util.ts roofRows: six letters), so it rises as one smooth spire to one tip.
	{ id: "roof-slate-spire", name: "pointed spire", group: "tops", role: "roof", material: null, fit: "spire", map: ["<=>^{}"],
		legend: { "<": L("spire-l", "roof"), "=": L("roof-flat", "roof"), ">": L("spire-r", "roof"), "^": L("spire-peak", "roof"), "{": L("spire-l-hi", "roof"), "}": L("spire-r-hi", "roof") } },
	// Its fill is the clear glass-wall, not today's "glass" (the warm lit pane, which glows at night).
	{ id: "roof-glass-gable", name: "glass roof", group: "tops", role: "roof", material: null, fit: "gable", map: ["<=>^"],
		legend: { "<": L("glass-roof-l", "roof"), "=": L("glass-wall", "roof"), ">": L("glass-roof-r", "roof"), "^": L("roof-peak", "roof") } },
	{ id: "roof-dome", name: "glass dome", group: "tops", role: "roof", material: null, fit: "gable", map: ["<=>^"],
		legend: { "<": L("dome-l", "roof"), "=": L("dome", "roof"), ">": L("dome-r", "roof"), "^": L("dome", "roof") } },
	{ id: "crown-battlement", name: "battlements", group: "tops", role: "roof", material: null, fit: "row", map: ["TTT"], legend: { T: L("battlement", "roof") } },
	{ id: "roof-awning", name: "striped awning", group: "tops", role: "roof", material: null, fit: "row", map: ["AAA"], legend: { A: L("awning", "roof") } },
	{ id: "chimney-brick", name: "chimney", group: "tops", role: "chimney", material: null, fit: "fixed", map: ["T", "C"],
		legend: { T: L("battlement", "roof"), C: L("brick", "roof") } },
	{ id: "top-lamp", name: "lamp room", group: "tops", role: "top", material: null, fit: "fixed", map: ["GlG", "III"],
		legend: { G: L("glass-wall", "walls"), l: L("lantern", "windows"), I: L("pillar", "walls") } },
	{ id: "top-bell-loft", name: "bell loft", group: "tops", role: "top", material: null, fit: "fixed", map: ["PbP", "P.P"],
		legend: { P: L("post", "walls"), b: L("bell", "windows") } },
	{ id: "top-sails", name: "windmill sails", group: "tops", role: "top", material: null, fit: "fixed",
		map: ["..s..", "..s..", "sshss", "..s..", "..s.."], legend: { s: L("sail", "walls"), h: L("post", "walls") } },
	{ id: "top-well-roof", name: "well roof", group: "tops", role: "top", material: null, fit: "fixed", map: [".^.", "<=>", "p.p"],
		legend: { "^": L("thatch-peak", "roof"), "<": L("thatch-l", "roof"), "=": L("thatch-flat", "roof"), ">": L("thatch-r", "roof"), p: L("post", "walls") } },
	{ id: "top-statue", name: "carved figure", group: "around", role: "top", material: null, fit: "fixed", map: ["s", "I"],
		legend: { s: L("statue", "walls"), I: L("pillar", "walls") } },
	// Additions: arches, gates, stairs, lanterns, banners and bells.
	{ id: "arch-span", name: "stone arch", group: "additions", role: "roof", material: null, fit: "row", map: ["AAA"], legend: { A: L("arch", "roof") } },
	{ id: "gate-posts", name: "gate posts", group: "additions", role: "storey", material: null, fit: "row", map: ["I.I", "I.I", "I.I"], legend: { I: L("pillar", "walls") } },
	{ id: "stair-flight", name: "stone stair", group: "additions", role: "top", material: null, fit: "fixed",
		map: ["....S", "...SS", "..SSS", ".SSSS", "SSSSS"], legend: { S: L("step", "floor") } },
	{ id: "decor-lantern", name: "lantern", group: "additions", role: "decor", material: null, fit: "fixed", map: ["l"], legend: { l: L("lantern", "lanterns") } },
	{ id: "decor-banner", name: "banner", group: "additions", role: "decor", material: null, fit: "fixed", map: ["b", "e"],
		legend: { b: L("banner", "banners"), e: L("banner-end", "banners") } },
	{ id: "decor-bell", name: "small bell", group: "additions", role: "decor", material: null, fit: "fixed", map: ["b"], legend: { b: L("bell", "lanterns") } },
	// Around: what stands beside a build, and the open builds' own rows.
	{ id: "side-bed", name: "flower bed", group: "around", role: "side", material: null, fit: "fixed", map: ["fff", "sss"],
		legend: { f: L("flowers", "walls"), s: L("soil", "floor") } },
	{ id: "side-fence", name: "fence", group: "around", role: "side", material: null, fit: "fixed", map: ["fff"], legend: { f: L("fence", "walls") } },
	{ id: "side-tree-fruit", name: "fruit tree", group: "around", role: "side", material: null, fit: "fixed", map: ["FLF", "LFL", ".t.", ".b."],
		legend: { F: L("fruit-leaves", "roof"), L: L("leaves", "roof"), t: L("trunk", "walls"), b: L("trunk-base", "walls") } },
	{ id: "side-tree-pine", name: "pine tree", group: "around", role: "side", material: null, fit: "fixed", map: [".A.", ".^.", "(#)", "(#)", ".|."],
		legend: { A: L("pine-tip", "roof"), "^": L("pine-small", "roof"), "(": L("pine-l", "roof"), "#": L("pine-c", "roof"), ")": L("pine-r", "roof"), "|": L("trunk-base", "walls") } },
	{ id: "side-bench", name: "bench", group: "around", role: "side", material: null, fit: "fixed", map: ["b"], legend: { b: L("bench", "walls") } },
	{ id: "side-lamp-post", name: "lamp post", group: "around", role: "side", material: null, fit: "fixed", map: ["l", "p"],
		legend: { l: L("lantern", "windows"), p: L("lantern-post", "walls") } },
	{ id: "side-dock", name: "little dock", group: "around", role: "side", material: null, fit: "fixed", map: ["BBB", "P.P"],
		legend: { B: L("deck", "walls"), P: L("post", "walls") } },
	{ id: "bed-row", name: "garden beds", group: "around", role: "storey", material: null, fit: "row", map: ["HfffHH", "ssssss"],
		legend: { H: L("hedge", "walls"), f: L("flowers", "walls"), s: L("soil", "floor") } },
	{ id: "walk-lamps", name: "lamp-lit path", group: "around", role: "storey", material: null, fit: "row", map: ["l...ll", "p...pp", "ssssss"],
		legend: { l: L("lantern", "windows"), p: L("lantern-post", "walls"), s: L("path", "floor") } },
	{ id: "pond-basin", name: "stone pond", group: "around", role: "storey", material: null, fit: "row", map: ["StttS", "SwwwS"],
		legend: { S: L("stone-wall", "walls"), t: L("water-top", "walls"), w: L("water", "walls") } },
	{ id: "well-ring", name: "well", group: "around", role: "top", material: null, fit: "fixed", map: ["StS", "SSS"],
		legend: { S: L("stone-wall", "walls"), t: L("water-top", "walls") } },
	{ id: "plinth-row", name: "plinth", group: "around", role: "floor", material: null, fit: "row", overhang: 0, map: ["SSS"], legend: { S: L("stone-wall", "floor") } },
	{ id: "orchard-row", name: "row of fruit trees", group: "around", role: "storey", material: null, fit: "row",
		map: ["..FLF.", "..LFL.", "...t..", "...b.."], legend: { F: L("fruit-leaves", "roof"), L: L("leaves", "roof"), t: L("trunk", "walls"), b: L("trunk-base", "walls") } },
	// Travel: the rope bridge.
	{ id: "bridge-span", name: "rope bridge deck", group: "travel", role: "span", material: "wood", fit: "row", map: ["rrr", "BBB"],
		legend: { r: L("rope", "walls"), B: L("bridge-board", "floor") } },
	{ id: "bridge-anchor", name: "bridge post", group: "travel", role: "anchor", material: "wood", fit: "fixed", map: ["P", "P", "P"], legend: { P: L("post", "walls") } },
	// Late additions: the tall narrow shaft and the signpost. The shaft's corner pillars run up through its beam row, so a
	// stack of them reads as one tower; its slits are spaced wider than a stone wall's windows.
	{ id: "storey-shaft", name: "tower shaft", group: "tops", role: "storey", material: null, fit: "row",
		map: ["IhhhhhhI", "ISSvSSSI", "ISSwSSSI", "ISSSSSSI"],
		legend: { h: L("beam-h", "walls"), I: L("pillar", "walls"), S: L("stone-wall", "walls"), v: L("window-top", "windows"), w: L("window", "windows") } },
	{ id: "side-sign", name: "signpost", group: "additions", role: "side", material: null, fit: "fixed", map: ["s"], legend: { s: L("sign", "walls") } },
	// Appended in the fix round: the open loft a roof over a balcony stands on, a post at each end of the body with the
	// sky between (laid once, like the balcony under it).
	{ id: "loft-posts", name: "open loft", group: "structure", role: "beam", material: null, fit: "row", map: ["P.P", "P.P"], legend: { P: L("post", "walls") } },
];
