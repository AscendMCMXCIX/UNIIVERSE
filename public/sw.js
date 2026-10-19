/*
  UNIIVERSE service worker. It does one thing: when a page cannot load because the device is
  offline, it shows a small offline page instead of the browser's error. Nothing else is cached:
  no page, no data and nothing personal is kept on the device, so there is never an old version
  of the app or someone's data to serve. A new version of this file replaces the old one at once.
*/
const CACHE = "uniiverse-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      // Pages load as fast as without a service worker: the browser starts the request at once.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
