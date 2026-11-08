// The free-will switches (spec docs/superpowers/specs/2026-10-11-osmo-free-will-design.md section 7). NEXT_PUBLIC_* is
// inlined at build time, so each is read by its full literal name. Each is on only when exactly "on": BIGWORLD only
// inside WORLD (lib/shell/flag.ts, main's file, not edited for this), BUILDS only inside BIGWORLD. OSMO_WILL is the
// server's switch, read in lib/chat/will.ts.
import { WORLD } from "../shell/flag";

export const BIGWORLD = WORLD && process.env.NEXT_PUBLIC_OSMO_BIGWORLD === "on";
export const BUILDS = BIGWORLD && process.env.NEXT_PUBLIC_OSMO_BUILDS === "on";
