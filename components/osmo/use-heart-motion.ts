import { type RefObject, useEffect, useState } from "react";
import { ease, type Motion, REST_SHAPES, rollShapes, settled, type Shapes, STILL } from "@/lib/room/heart-motion";

export type HeartMotion = {
	// Head for a new target; the loop starts if it's idle.
	aim(target: Motion): void;
	// A new word: the heart rolls into a new shape.
	roll(): void;
	// Speech is over: back to rest, in his resting shape.
	rest(): void;
	// The element whose CSS variables are written (the stage).
	attach(el: HTMLElement | null): void;
	dispose(): void;
};

// Eases Osmo's heart toward what his speech asks of it, one frame at a time, and writes the result
// into CSS variables on the stage (--voice, --open, --flow, --r1..3) for figure.module.css.
// The loop runs only while something is still moving.
function createHeartMotion(): HeartMotion {
	let el: HTMLElement | null = null;
	const style = () => el?.style;
	let target = STILL;
	let motion = STILL;
	let frame: number | null = null;
	let last = 0;

	const write = (m: Motion) => {
		const s = style();
		if (!s) return;
		s.setProperty("--voice", m.voice.toFixed(3));
		s.setProperty("--open", m.open.toFixed(3));
		s.setProperty("--flow", m.flow.toFixed(3));
	};
	const shape = (shapes: Shapes) => {
		const s = style();
		if (!s) return;
		shapes.forEach((r, i) => s.setProperty(`--r${i + 1}`, r));
	};
	const tick = (now: number) => {
		const next = ease(motion, target, now - last);
		last = now;
		if (settled(next, target)) {
			motion = target;
			write(target);
			frame = null;
			return;
		}
		motion = next;
		write(next);
		frame = requestAnimationFrame(tick);
	};

	const aim = (t: Motion) => {
		target = t;
		if (frame !== null) return;
		last = performance.now();
		frame = requestAnimationFrame(tick);
	};

	return {
		aim,
		roll: () => shape(rollShapes()),
		rest() {
			aim(STILL);
			shape(REST_SHAPES);
		},
		attach(next) {
			el = next;
		},
		dispose() {
			if (frame !== null) cancelAnimationFrame(frame);
			frame = null;
		},
	};
}

export function useHeartMotion(stageRef: RefObject<HTMLElement | null>): HeartMotion {
	const [heart] = useState(createHeartMotion);
	useEffect(() => {
		heart.attach(stageRef.current);
		return () => heart.dispose();
	}, [heart, stageRef]);
	return heart;
}
