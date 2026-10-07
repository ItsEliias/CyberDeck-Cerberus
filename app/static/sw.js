// CyberDeck service worker. Served from /sw.js so it controls the whole app.
//
// It caches the app shell only (page, styles, scripts, fonts, icons) so the
// app opens instantly and shows its frame when the server is unreachable.
// It never caches /api/*: notes, flashcards, targets and the credential vault
// always come live from the server and are never stored by the browser.
//
// Bump VERSION when the strategy changes. Asset updates need no bump: pages,
// scripts and styles are network-first.
const VERSION = "cyberdeck-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // Cache individually so one missing file can't block install.
      Promise.all(["/", "/static/icons/icon-192.png"].map((url) =>
        fetch(url, { cache: "reload" }).then((r) => (r.ok ? cache.put(url, r) : null)).catch(() => null),
      )),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(fallbackUrl || request, copy));
      }
      return response;
    })
    .catch(() => caches.match(fallbackUrl || request));
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    // Single-page app: every navigation is the shell at "/".
    event.respondWith(networkFirst(event.request, url.pathname === "/" ? "/" : undefined)
      .then((hit) => hit || caches.match("/")));
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    if (/\.(js|css|webmanifest)$/.test(url.pathname)) {
      event.respondWith(networkFirst(event.request));
      return;
    }
    // Fonts, images, vendored libs: cache first, refresh in the background.
    event.respondWith(
      caches.match(event.request).then((hit) => {
        const network = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(event.request, copy));
            }
            return response;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});
