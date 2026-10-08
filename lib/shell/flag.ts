// Shell v2 is off unless the build says so. NEXT_PUBLIC_* is inlined at build time, so the variable
// must be read by its full literal name here.
export const SHELL2 = process.env.NEXT_PUBLIC_OSMO_SHELL2 === "on";
