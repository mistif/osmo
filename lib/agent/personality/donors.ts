import type { Donor } from "./types";
import { bold } from "./donors/bold";
import { cool } from "./donors/cool";
import { curious } from "./donors/curious";
import { fierce } from "./donors/fierce";
import { formal } from "./donors/formal";
import { gentle } from "./donors/gentle";
import { grumpy } from "./donors/grumpy";
import { playful } from "./donors/playful";
import { strange } from "./donors/strange";
import { tender } from "./donors/tender";

// Roster order matters: an earlier donor wins a slang conflict.
export const DONORS: Donor[] = [
	...gentle, ...grumpy, ...bold, ...curious, ...playful, ...cool, ...formal, ...tender, ...fierce, ...strange,
];
