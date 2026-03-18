// Minimal service worker — required for PWA installability on Android/Chrome.
// No caching strategy; just pass all requests through to the network.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
