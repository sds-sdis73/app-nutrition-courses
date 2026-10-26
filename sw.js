/* Service worker Miam & moi : ouverture hors ligne, cache des fichiers de l'app, notifications push. */
const CACHE = 'nutri-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './aliments.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data?.type === 'refresh') {
    // Nouvelle version publiée : on remplace le cache de l'app puis on prévient la page.
    e.waitUntil(caches.delete(CACHE).then(() => caches.open(CACHE)).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => e.source?.postMessage({ type: 'refreshed' })));
  }
});

const isShell = (url) => SHELL.some((u) => url.href === new URL(u, self.location.href).href) || (url.origin === self.location.origin && url.pathname.endsWith('/'));
const sameOriginPage = (req) => req.mode === 'navigate' || (new URL(req.url).origin === self.location.origin && /\.(html|json|webmanifest|png)$/.test(new URL(req.url).pathname));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Données (Supabase, Open Food Facts, Open Prices) : réseau uniquement, jamais mises en cache ici.
  if (!isShell(url) && !sameOriginPage(req) && !/cdn\.jsdelivr\.net/.test(url.host)) return;
  if (url.pathname.endsWith('version.json')) return;
  const key = req.mode === 'navigate' ? './index.html' : req.url.split('?')[0];
  const big = url.pathname.endsWith('aliments.json') || /cdn\.jsdelivr\.net/.test(url.host);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (big && cached) {
      // Gros fichiers stables : cache d'abord, rafraîchissement en arrière-plan.
      fetch(req).then((r) => { if (r.ok) cache.put(key, r.clone()); }).catch(() => {});
      return cached;
    }
    // Page et petits fichiers : réseau d'abord (3 s), sinon cache.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(req, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) cache.put(key, r.clone());
      return r;
    } catch {
      if (cached) return cached;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Miam & moi', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Miam & moi', {
    body: data.body || '', icon: './icon-192.png', badge: './icon-192.png', tag: data.tag || 'nutri', data: { url: data.url || './' }, renotify: false,
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.startsWith(self.location.origin));
    if (w) { w.navigate(target); return w.focus(); }
    return self.clients.openWindow(target);
  }));
});
