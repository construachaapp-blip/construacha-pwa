const CACHE_NAME = 'construacha-v15';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo_acha.png',
  '/icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentamos cachear cada recurso por separado para que si falla uno (por ejemplo en dev local), el SW se instale de todos modos.
      return Promise.allSettled(
        ASSETS.map((asset) => {
          return cache.add(asset).catch((err) => {
            console.warn(`Failed to cache asset ${asset}:`, err);
          });
        })
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('Activated', CACHE_NAME);
      return clients.claim();
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Solo procesar peticiones GET locales
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Clonamos y guardamos en caché si es una petición exitosa de recursos estáticos básicos
        if (response.status === 200 && response.type === 'basic') {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si es una petición de página web (navegación HTML) y falló la red, retornamos index.html de la caché como fallback offline
          if (e.request.mode === 'navigate' || (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'))) {
            return caches.match('/index.html') || caches.match('/');
          }
        });
      })
  );
});
