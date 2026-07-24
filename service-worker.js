/* Школа Госуслуг — быстрый PWA-кэш.
   Кэширует только файлы сайта. Запросы Supabase идут напрямую, чтобы данные всегда были свежими. */
const CACHE_NAME = 'sgos-stable-cache-20260724-01';
const CORE_ASSETS = [
  './',
  './index.html',
  './course.html',
  './lesson.html',
  './cabinet.html',
  './materials.html',
  './complete.html',
  './program.html',
  './admin.html',
  './style.css',
  './app.js',
  './supabase-config.js',
  './pwa-register.js',
  './favicon.svg',
  './site.webmanifest',
  './apple-touch-icon.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-16.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => key === CACHE_NAME ? null : caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function timeoutFetch(request, ms = 4500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then((response) => {
      clearTimeout(timer);
      resolve(response);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await timeoutFetch(request, 5500);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => null);
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return cache.match('./index.html');
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone()).catch(() => null);
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone()).catch(() => null);
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Supabase API и любые внешние данные не кэшируем, чтобы кабинет не показывал старые данные.
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'cdn.jsdelivr.net') {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }

  const path = url.pathname;
  if (request.mode === 'navigate' || path.endsWith('.html') || path.endsWith('/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.json')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(path)) {
    event.respondWith(cacheFirst(request));
  }
});
