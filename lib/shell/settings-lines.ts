// One quiet state line under each Settings page on the index (spec 5).
const on = (b: boolean) => (b ? "on" : "off");
export const devicesLine = (n: number) => (n === 0 ? "No device remembers you yet." : n === 1 ? "1 device remembers you." : `${n} devices remember you.`);
export const voiceLine = (natural: boolean, listening: boolean) => `Natural voice ${on(natural)}, listening ${on(listening)}.`;
export const mayDoLine = (paused: boolean, count: number) => `Paused: ${paused ? "yes" : "no"}. ${count} ${count === 1 ? "thing" : "things"} on.`;
export const placeLine = (place: string | null, pushOn: boolean) =>
	`${place ? `Saved: ${place}.` : "No place saved."} ${pushOn ? "Notifications on this device." : "Notifications off on this device."}`;
