/* Lockin — service worker (fonctionne hors ligne) */
const CACHE = 'lockin-v1.9.2';
const SHELL = ['extra.js', 'onboard.js', 'auth.js', 'firebase-config.js', './', 'index.html', 'styles.css', 'data.js', 'app.js', 'more.js', 'coach.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'lockin-ai').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Modèle IA + librairie du coach : cache permanent après le 1er téléchargement
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('storage.googleapis.com')) {
    e.respondWith(caches.open('lockin-ai').then(c => c.match(req).then(r => r || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Fichiers de l'app : réseau d'abord (pour les mises à jour), cache si hors ligne
  e.respondWith(fetch(req).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone())); return res; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});

/* Notifications push (rappels) */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (x) { d = { title: 'Lockin', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Lockin', { body: d.body || '', tag: d.tag || 'lockin', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    if (cs.length) { const c = cs[0]; return (c.navigate ? c.navigate(url).catch(() => null) : Promise.resolve()).then(() => c.focus()); }
    return clients.openWindow(url);
  }));
});
