self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};

  event.waitUntil(
    self.registration.showNotification(data.title || "Le petit monde", {
      body: data.body || "Il y a du nouveau !",
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
