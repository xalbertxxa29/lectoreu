/* sw.js (v61) — Offline-first para WebView
   Estrategias:
   - Navegación/HTML: cache-first con fallback a red (abre sin internet).
   - JS/CSS: stale-while-revalidate (rápido + actualización en bg).
   - Imágenes/Fonts: cache-first.
   - NO intercepta métodos ≠ GET. Evita Firebase/Google externos.
   - Precarga App Shell. Limpia versiones viejas.
   - skipWaiting + clients.claim.
*/

const SW_VERSION = 'v61';
const PRECACHE   = `precache-${SW_VERSION}`;
const RUNTIME_ASSETS = `assets-${SW_VERSION}`;
const RUNTIME_MEDIA  = `media-${SW_VERSION}`;

/* ==== Precarga local (ajusta si cambias nombres) ==== */
const PRECACHE_URLS = [
  // App shell
  './',
  './index.html',
  './style.css',
  './script.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',

  // Librerías locales (críticas para funcionar sin red)
  './libs/jsQR.js',
  './libs/firebase-app-compat.js',
  './libs/firebase-firestore-compat.js',
  './libs/firebase-storage-compat.js'
];

// Dominios que NO debemos cachear (Firebase/Google/CDNs externos)
const BLOCKED_HOSTNAMES = new Set([
  'www.gstatic.com',
  'www.google.com',
  'apis.google.com',
  'firebase.googleapis.com',
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'lh3.googleusercontent.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    // Activar inmediatamente la nueva versión
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => ![PRECACHE, RUNTIME_ASSETS, RUNTIME_MEDIA].includes(k))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isMethodCacheable(req) {
  return req.method === 'GET';
}

function isSameOrigin(reqUrl) {
  return reqUrl.origin === self.location.origin;
}

function isBlockedExternal(reqUrl) {
  return !isSameOrigin(reqUrl) && BLOCKED_HOSTNAMES.has(reqUrl.hostname);
}

function isAsset(req) {
  const url = new URL(req.url);
  return (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.mjs')
  );
}

function isMedia(req) {
  const url = new URL(req.url);
  return (
    url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|bmp)$/i) ||
    url.pathname.match(/\.(woff2?|ttf|otf|eot)$/i)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // No interceptar métodos ≠ GET
  if (!isMethodCacheable(req)) return;

  const url = new URL(req.url);

  // No interceptar peticiones a dominios externos bloqueados
  if (isBlockedExternal(url)) return;

  // Navegaciones/HTML → cache-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      const cache = await caches.open(PRECACHE);
      const cached = await cache.match('./index.html') || await cache.match(req, { ignoreSearch: true });
      if (cached) {
        // Actualiza en bg (no esperamos)
        fetch(req).then(res => {
          if (res && res.ok) cache.put('./index.html', res.clone());
        }).catch(() => {});
        return cached;
      }
      // Si no hay en caché, intenta red y guarda copia
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        // fallback duro: index precacheado
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' }});
      }
    })());
    return;
  }

  // JS/CSS → stale-while-revalidate
  if (isAsset(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_ASSETS);
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then((res) => {
        if (res && res.ok && isSameOrigin(new URL(req.url))) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || networkPromise || new Response('', { status: 504 });
    })());
    return;
  }

  // Imágenes/Fonts → cache-first
  if (isMedia(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_MEDIA);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok && isSameOrigin(new URL(req.url))) {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        // Podrías devolver una imagen/ico placeholder si quieres
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Resto de GET del mismo origen → try cache, fallback red
  if (isSameOrigin(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_ASSETS);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
  }
});
