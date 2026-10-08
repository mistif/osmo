// Sources for the dev-only /dev/artifact page: one good thing, one that does not compile, one the checks
// refuse, and hostile things that try to get out of the frame (run with "Skip checks" on).

export const GOOD = `// title: Tip splitter
import { useState } from "react";

export default function Tip() {
	const [bill, setBill] = useState(60);
	const [people, setPeople] = useState(3);
	const each = people > 0 ? (bill * 1.15) / people : 0;
	const field = { display: "block", width: "100%", boxSizing: "border-box", padding: 8, margin: "4px 0 12px", background: "transparent", color: "var(--osmo-ink)", border: "1px solid var(--osmo-a)", borderRadius: 8 };
	return (
		<main style={{ padding: 16, background: "var(--osmo-bg)", color: "var(--osmo-ink)" }}>
			<h1 style={{ fontSize: 18, margin: "0 0 12px" }}>Tip splitter</h1>
			<label>Bill
				<input type="number" value={bill} onChange={(e) => setBill(Number(e.target.value))} style={field} />
			</label>
			<label>People
				<input type="number" value={people} onChange={(e) => setPeople(Number(e.target.value))} style={field} />
			</label>
			<p>Each person pays {each.toFixed(2)}, with a fifteen percent tip.</p>
			<button onClick={() => setPeople(people + 1)} style={{ padding: "8px 12px", background: "var(--osmo-a)", color: "var(--osmo-bg)", border: 0, borderRadius: 8 }}>Add one person</button>
		</main>
	);
}
`;

export const COMPILE_ERROR = `export default function A(){ return <div>; }`;

export const TRIES_FETCH = `export default function A(){ fetch("https://example.com/?q=1"); return <p>Hello</p>; }`;

// Each one tries one way out. Run them with "Skip checks" on: with checks on, the scan refuses most of them first.
export const HOSTILE: Record<string, string> = {
	fetch: `export default function A(){ fetch("https://example.com/?q=1"); return <p>fetch</p>; }`,
	top: `export default function A(){ return <p>{String(window.top.document.title)}</p>; }`,
	storage: `import { useEffect } from "react";
export default function A(){ useEffect(() => { localStorage.setItem("a", "b"); }, []); return <p>storage</p>; }`,
	cookie: `export default function A(){ document.cookie = "a=b"; return <p>{document.cookie}</p>; }`,
	websocket: `export default function A(){ new WebSocket("wss://example.com"); return <p>websocket</p>; }`,
	form: `import { useEffect, useRef } from "react";
export default function A(){
	const ref = useRef(null);
	useEffect(() => { ref.current.submit(); }, []);
	return <form ref={ref} action="https://example.com"><button>go</button></form>;
}`,
	link: `import { useEffect, useRef } from "react";
export default function A(){
	const ref = useRef(null);
	useEffect(() => { ref.current.click(); }, []);
	return <a ref={ref} href="https://example.com">go</a>;
}`,
	webrtc: `export default function A(){ new RTCPeerConnection(); return <p>webrtc</p>; }`,
	eval: `export default function A(){ eval("1 + 1"); return <p>eval</p>; }`,
	image: `export default function A(){ return <img src="https://example.com/x.png" alt="" />; }`,
	location: `import { useEffect } from "react";
export default function A(){ useEffect(() => { location.href = "https://example.com"; }, []); return <p>location</p>; }`,
};
