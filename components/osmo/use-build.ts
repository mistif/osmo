"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ensureSession, supabase } from "@/lib/supabase";
import { runBuild } from "@/lib/artifacts/build-run";
import { createBuildController, type BuildController, type BuildState, type ControllerDeps } from "@/lib/room/build-controller";

// The real build: Sucrase loads on the first build only, so it stays out of the room's main chunk.
const realRun: ControllerDeps["run"] = async (ticket, onView, signal) => {
	const compile = await import("@/lib/artifacts/compile");
	await runBuild(
		ticket,
		{
			fetch: (...args) => fetch(...args),
			token: async () => (await ensureSession())?.access_token ?? null,
			clean: compile.cleanOutput,
			compile: (source) => compile.compileSource(source),
		},
		onView,
		signal,
	);
};

// Delete is Gur's own client under row-level security (select and delete are his; the browser cannot insert).
const realRemove: ControllerDeps["remove"] = async (id) => {
	const { error } = await supabase.from("artifacts").delete().eq("id", id);
	return !error;
};

export type BuildHandle = BuildState & Pick<BuildController, "start" | "cancel" | "discard" | "close" | "show">;

// The room's hook for the thing beside Osmo. `deps` is read once, when the room mounts: the dev page passes a fake
// stream and a fake delete; the room passes nothing.
export function useBuild(deps?: Partial<Pick<ControllerDeps, "run" | "remove">>): BuildHandle {
	const [controller] = useState(() =>
		createBuildController({ run: deps?.run ?? realRun, remove: deps?.remove ?? realRemove, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }),
	);
	const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
	useEffect(() => () => controller.cancel(), [controller]);
	return { ...state, start: controller.start, cancel: controller.cancel, discard: controller.discard, close: controller.close, show: controller.show };
}
