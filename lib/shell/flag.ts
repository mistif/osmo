// Shell v2 is off unless the build says so. NEXT_PUBLIC_* is inlined at build time, so the variable
// must be read by its full literal name here.
export const SHELL2 = process.env.NEXT_PUBLIC_OSMO_SHELL2 === "on";

// Osmo's village (spec 2026-10-09-osmo-village-design.md section 6): off unless the build says so, and only
// inside the v2 shell. Read by its full literal name for the same reason as SHELL2.
export const WORLD = SHELL2 && process.env.NEXT_PUBLIC_OSMO_WORLD === "on";
