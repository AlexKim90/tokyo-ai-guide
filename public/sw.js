// Service Worker — Web Share Target을 위한 최소 구현
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
