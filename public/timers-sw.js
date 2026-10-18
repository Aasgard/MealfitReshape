// Service worker minimal : il ne sert qu'à afficher la notification de fin des minuteurs de cuisine (Android n'accepte
// pas `new Notification()` sans lui). Pas de gestionnaire `fetch` : rien n'est mis en cache, l'appli se charge comme
// d'habitude.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

// Toucher la notification ramène dans l'appli (l'onglet ouvert, sinon la page Minuteurs).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0]
      return open ? open.focus() : self.clients.openWindow('/dashboard/minuteurs')
    }),
  )
})
