// Lets the app open without a connection (showing the last thing it loaded) and start fast.
// The app's files are kept; /api calls always go to the server, so data is never stale.
const CACHE = 'sprig-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest?v=2', '/icon-192.png?v=2'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Old versions' files go.
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Built files have the version in their names, so a kept copy is always right.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    })));
    return;
  }
  // Pages: the newest from the server, or the kept copy when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put('/', res.clone()));
      return res;
    }).catch(() => caches.match('/')));
  }
});

// Alerts from the server (server/push.ts): a reminder come due, or time to leave.
self.addEventListener('push', (e) => {
  let alert = { title: 'Sprig', body: '', url: '/', tag: undefined };
  try {
    alert = { ...alert, ...e.data.json() };
  } catch {
    // Not one of ours: the plain title.
  }
  e.waitUntil(self.registration.showNotification(alert.title, {
    body: alert.body, tag: alert.tag, data: { url: alert.url }, icon: '/icon-192.png', badge: '/icon-192.png',
  }));
});

// Tapped: Sprig, on the alert's page (an open window if there is one).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url ?? '/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (wins) => {
    const win = wins.find((w) => new URL(w.url).origin === location.origin);
    if (!win) return self.clients.openWindow(url);
    await win.focus();
    return win.navigate(url).catch(() => {});
  }));
});
