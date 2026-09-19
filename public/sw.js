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
