"use client";
import { useEffect, useRef, useState } from "react";
import { acceptMessage, clampHeight, type FrameMessage } from "@/lib/artifacts/bridge";
import { type Aura, buildFramePage, IFRAME_ALLOW, newNonce, SANDBOX } from "@/lib/artifacts/frame";
import { RUNTIME_PATH } from "@/lib/artifacts/runtime-path";

// Over https the frame fetches the runtime by address. Anywhere else (localhost, a phone on the local network)
// the browser refuses that fetch from a frame with an opaque origin, so the room reads the file and inlines it.
let runtimeText: Promise<string> | null = null;
const loadRuntimeText = () =>
	(runtimeText ??= fetch(RUNTIME_PATH)
		.then((r) => (r.ok ? r.text() : Promise.reject(new Error("The runtime did not load."))))
		.catch((e) => {
			runtimeText = null;
			throw e;
		}));

export type FrameEvent = FrameMessage | { type: "compile-error"; text: string } | { type: "left-frame" };
type Props = { source: string; aura: Aura; onEvent(e: FrameEvent): void; skipChecks?: boolean; className?: string };

export function ArtifactFrame({ source, aura, onEvent, skipChecks, className }: Props) {
	const ref = useRef<HTMLIFrameElement>(null);
	const loads = useRef(0);
	const onEventRef = useRef(onEvent);
	const [open, setOpen] = useState<{ page: string; nonce: string } | null>(null);
	const [height, setHeight] = useState(240);
	useEffect(() => { onEventRef.current = onEvent; });
	useEffect(() => {
		let live = true;
		(async () => {
			const { compileSource } = await import("@/lib/artifacts/compile"); // Sucrase loads on first use
			const result = await compileSource(source, { check: !(skipChecks && process.env.NODE_ENV !== "production") });
			if (!live) return;
			if (!result.ok) {
				setOpen(null);
				return onEventRef.current({ type: "compile-error", text: result.error });
			}
			try {
				const nonce = newNonce();
				const runtime = location.protocol === "https:" ? { runtimeUrl: location.origin + RUNTIME_PATH } : { runtimeText: await loadRuntimeText() };
				const page = buildFramePage({ nonce, ...runtime, code: result.code, aura });
				if (!live) return;
				loads.current = 0;
				setOpen({ nonce, page });
			} catch (e) {
				// the page builder refuses code that could close its script tag, even with the checks off
				setOpen(null);
				onEventRef.current({ type: "compile-error", text: String((e as Error).message ?? e).slice(0, 200) });
			}
		})();
		return () => { live = false; };
		// aura is read once per open (spec 4: fixed for that open)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [source, skipChecks]);
	useEffect(() => {
		if (!open) return;
		const listen = (ev: MessageEvent) => {
			const m = acceptMessage(ev, ref.current?.contentWindow, open.nonce);
			if (!m) return;
			if (m.type === "height") setHeight(clampHeight(m.px, window.innerHeight));
			onEventRef.current(m);
		};
		window.addEventListener("message", listen);
		return () => window.removeEventListener("message", listen);
	}, [open]);
	if (!open) return null;
	return (
		<iframe ref={ref} className={className} title="Something Osmo made" sandbox={SANDBOX} allow={IFRAME_ALLOW} referrerPolicy="no-referrer" srcDoc={open.page} style={{ width: "100%", height, border: 0 }}
			onLoad={() => { if (++loads.current > 1) { setOpen(null); onEventRef.current({ type: "left-frame" }); } }} />
	);
}
