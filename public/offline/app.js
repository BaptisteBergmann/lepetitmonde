// Placeholder: shows the "server unreachable" message in the browser's language.
(function () {
  var fr = (navigator.language || 'en').toLowerCase().indexOf('fr') === 0;
  if (fr) {
    document.documentElement.lang = 'fr';
    document.getElementById('title').textContent = "Impossible de joindre l'application";
    document.getElementById('body').textContent = "Le serveur est injoignable pour le moment. Réessayez dans un instant.";
    document.getElementById('retry').textContent = 'Réessayer';
  }
  document.getElementById('retry').addEventListener('click', function () {
    location.reload();
  });
})();
