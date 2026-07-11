self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};

  event.waitUntil(
    self.registration.showNotification(data.title || "Journal de Bébé", {
      body: data.body || "Il y a du nouveau !",
      icon: '/icon-192x192.png', // The PWA icon of your baby journal
      badge: '/icon-192x192.png',
      data: { url: data.url || '/' }
    })
  );
});

// Handle when the family member clicks the notification
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
