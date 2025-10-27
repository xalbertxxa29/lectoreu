/* sw.js — v7 (LectorQR)
   - Navigation Preload
   - Network-first para HTML con fallback a ./index.html
   - Stale-While-Revalidate para estáticos same-origin (CSS/JS/IMG/Manifest)
   - Precache tolerante a fallos
   - Limpieza de caches antiguos por prefijo
   - SKIP_WAITING + clients.claim
*/

const CACHE_PREFIX = 'lectorqr-';
const CACHE_NAME   = `${CACHE_PREFIX}v7`;

// Ajusta rutas si cambias nombres/ubicación de archivos
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ---------- INSTALL: precache + navigation preload
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of PRECACHE) {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        // Si un recurso falla (404/cross-origin), lo omitimos
      }
    }
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.skipWaiting();
  })());
});

// ---------- ACTIVATE: limpia caches viejos y toma control
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Utilidad: detectar extensión de archivo
const STATIC_EXTS = ['css','js','png','jpg','jpeg','gif','webp','ico','svg','json','webmanifest'];
const isStaticRequest = (urlObj) => {
  const path = urlObj.pathname;
  const last = path.split('/').pop() || '';
  const ext  = last.includes('.') ? last.split('.').pop().toLowerCase() : '';
  return STATIC_EXTS.includes(ext);
};

// ---------- FETCH: estrategias por tipo
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Navegación (document) → Network-first + fallback a index
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const fresh = await fetch(req);
        // Cachea index.html para fallback futuro
        const cache = await caches.open(CACHE_NAME);
        try {
          // Sólo cachea si es same-origin y OK
          if (fresh.ok && fresh.type === 'basic') {
            cache.put('./index.html', fresh.clone());
          }
        } catch {}
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // 2) Estáticos same-origin → Stale-While-Revalidate
  if (url.origin === self.location.origin && isStaticRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedPromise = cache.match(req);
      const networkPromise = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => null);

      const cached = await cachedPromise;
      if (cached) {
        // Devuelve rápido lo cacheado y actualiza en segundo plano
        event.waitUntil(networkPromise);
        return cached;
      }
      // Si no hay caché, intenta red y cachea
      const res = await networkPromise;
      return res || Response.error();
    })());
    return;
  }

  // 3) Otros (cross-origin/APIs) → pasa directo
  // (Si quisieras cachearlos, define aquí otra estrategia)
});

// ---------- Mensajes: permitir forzar activación
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
