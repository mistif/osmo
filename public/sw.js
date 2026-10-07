// Osmo's service worker. It caches nothing and has no fetch listener, so it can never serve a stale
// signed-in page. Push handling arrives with phase 1.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
