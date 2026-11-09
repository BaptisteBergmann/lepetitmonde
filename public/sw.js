// Offline fallback. Only navigations (except /auth/* and /api/*) and /offline/* are handled; everything else (API,
// RSC, Server Actions, SSE, uploads, chunks) falls through to the network untouched.
// Authenticated responses are never cached: the cache holds only the static files below.
// __SW_BUILD__ is replaced with the commit SHA at image build time (see Dockerfile), so
// every deploy gets a new cache and the worker updates itself.
const OFFLINE_CACHE = 'offline-__SW_BUILD__';
const OFFLINE_PAGE = '/offline/index.html';
const OFFLINE_FILES = [OFFLINE_PAGE, '/offline/app.js', '/offline/app.css'];
// Wait this long for the first byte before assuming the server is down.
const NAVIGATION_TIMEOUT_MS = 6000;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(async function (cache) {
      for (const url of OFFLINE_FILES) {
        const response = await fetch(url, { cache: 'reload' });
        // A login redirect (or error page) must not be stored as the offline page.
        if (!response.ok || response.redirected) throw new Error('Offline precache failed: ' + url);
        await cache.put(url, response);
      }
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      const names = await caches.keys();
      await Promise.all(
        names.filter(function (n) { return n.startsWith('offline-') && n !== OFFLINE_CACHE; })
          .map(function (n) { return caches.delete(n); })
      );
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

function isGatewayError(status) {
  return (status >= 502 && status <= 504) || (status >= 520 && status <= 530);
}

async function offlinePage() {
  const cache = await caches.open(OFFLINE_CACHE);
  return (await cache.match(OFFLINE_PAGE)) || Response.error();
}

async function handleNavigation(event) {
  try {
    const request = (async function () {
      const preloaded = await event.preloadResponse;
      return preloaded || fetch(event.request);
    })();
    const timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, NAVIGATION_TIMEOUT_MS);
    });
    const response = await Promise.race([request, timeout]);
    if (isGatewayError(response.status)) return offlinePage();
    return response;
  } catch {
    return offlinePage();
  }
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/offline/')) {
    event.respondWith(
      caches.open(OFFLINE_CACHE)
        .then(function (cache) { return cache.match(url.pathname); })
        .then(function (hit) { return hit || fetch(request); })
    );
    return;
  }

  // One-time or side-effecting GETs (the email-link token exchange, API routes) must reach the
  // server exactly once: never time them out or retry them behind the offline page. Match on
  // a path segment boundary so /authors or /apis are not caught.
  if (/^\/(auth|api)(\/|$)/.test(url.pathname)) return;

  if (request.mode === 'navigate') event.respondWith(handleNavigation(event));
});

self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  // The service worker has no i18n runtime: pick the fallback body from the browser language.
  const isFrench = (self.navigator.language || 'fr').toLowerCase().startsWith('fr');

  event.waitUntil(
    self.registration.showNotification(data.title || "Le petit monde", {
      body: data.body || (isFrench ? "Il y a du nouveau !" : "Something new!"),
      icon: '/web-app-manifest-192x192.png',
      badge: '/web-app-manifest-192x192.png',
      tag: data.tag,
      data: { url: data.url || '/' }
    })
  );
});

// Handle when the family member clicks the notification
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
