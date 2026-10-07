// Osmo's service worker. It caches nothing and has no fetch listener, so it can never serve a stale
// signed-in page. It shows a push, and a tap on it brings Osmo forward.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
	let d = {};
	try {
		d = e.data ? e.data.json() : {};
	} catch {
		d = {};
	}
	if (d === null || typeof d !== "object") d = {};
	e.waitUntil(
		self.registration.showNotification(typeof d.title === "string" && d.title ? d.title : "Osmo", {
			body: typeof d.body === "string" ? d.body : "",
			tag: typeof d.tag === "string" && d.tag ? d.tag : "osmo",
			data: { url: "/" },
		}),
	);
});
self.addEventListener("notificationclick", (e) => {
	e.notification.close();
	e.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((all) => (all.length > 0 && "focus" in all[0] ? all[0].focus() : self.clients.openWindow("/"))),
	);
});
