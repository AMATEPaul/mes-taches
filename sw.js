// Service worker : garde l'appli en cache pour qu'elle marche sans connexion.
const CACHE = 'mes-taches-v5';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'vendor/Sortable.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (e) => {
  // cache: 'reload' : on prend les fichiers sur le serveur, pas une vieille copie du navigateur.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Réseau d'abord (pour recevoir les mises à jour), mais si le réseau met plus de 3 s
// ou ne répond pas, on sert la copie en cache. La copie est rafraîchie en arrière-plan.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  let cachePut = Promise.resolve();
  // cache: 'no-cache' : le navigateur vérifie auprès du serveur qu'il a la dernière version.
  const network = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      cachePut = caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(network.then(() => cachePut).catch(() => {}));

  const fromCache = () => caches.match(req, { ignoreSearch: true });
  e.respondWith(new Promise((resolve) => {
    let settled = false;
    const finish = (res) => { if (!settled && res) { settled = true; resolve(res); } };
    const timer = setTimeout(() => fromCache().then(finish), NETWORK_TIMEOUT_MS);
    network
      .then((res) => { clearTimeout(timer); finish(res); })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((res) => {
          if (res) finish(res);
          else if (!settled) { settled = true; resolve(Response.error()); }
        });
      });
  }));
});
