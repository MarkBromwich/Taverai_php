const CACHE_NAME = "taverai-shell-v3";
const SHELL_ASSETS = [
  "./",
  "./index.php",
  "./assets/app.css",
  "./assets/app.js",
  "./manifest.webmanifest",
  "./favicon.png",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./taverai-logo-four.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL_ASSETS.map((asset) => {
        return fetch(asset, { cache: "reload" })
          .then((response) => {
            if (response && response.ok) {
              return cache.put(asset, response);
            }
            return null;
          })
          .catch(() => null);
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function offlinePageResponse() {
  return new Response(
    "<!doctype html><title>Taverai offline</title><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><body style=\"margin:0;font-family:system-ui,sans-serif;background:#070d16;color:#f1f4fa;display:grid;min-height:100vh;place-items:center;text-align:center;padding:24px\"><main><h1>Taverai is offline</h1><p>Reconnect and try again, or return to a page that has already been saved on this device.</p></main></body>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function offlineAssetResponse() {
  return new Response("", { status: 503, statusText: "Offline" });
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.searchParams.has("path") && url.searchParams.get("path").startsWith("api/")) {
    return;
  }

  if (url.pathname.includes("/uploads/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.php")
        .then((cached) => cached || caches.match("./"))
        .then((cached) => cached || offlinePageResponse()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => {
        if (request.destination === "document") {
          return caches.match("./index.php")
            .then((fallback) => fallback || caches.match("./"))
            .then((fallback) => fallback || offlinePageResponse());
        }
        return offlineAssetResponse();
      });
    })
  );
});
