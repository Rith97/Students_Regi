const CACHE_NAME = "students-registration-web-v2.3.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/moeys-logo.png",
  "./assets/school-emblem.png",
  "./assets/kaoh-andaet-addresses.js",
  "./assets/student-card.js",
  "./assets/student-export.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("students-registration-web-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const isAppEntry = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    event.respondWith(
      fetch(new Request(request, { cache:"no-cache" }))
        .then(response => {
          if (!response.ok) throw new Error("Page is unavailable");
          const copy = response.clone();
          // A teacher-portal navigation must never replace the app's offline entry.
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request))
          || (isAppEntry ? await caches.match("./index.html") : Response.error()))
    );
    return;
  }

  event.respondWith(
    fetch(new Request(request, { cache:"no-cache" })).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request))
  );
});
