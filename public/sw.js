self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};

  event.waitUntil(
    self.registration.showNotification(data.title || 'Journal de Bébé', {
      body: data.body || 'Il y a du nouveau !',
      icon: data.icon || '/favicon-96x96.png',
      badge: '/favicon-96x96.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
