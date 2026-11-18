// Kivo · funciona sin conexión y muestra avisos
const C = 'kivo-v1';
const ASSETS = ['./', './index.html', './config.js', './raiki-invitar.js', './vendor/supabase.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/kivo.svg'];
// se guardan aparte, sin frenar la instalación
const EXTRA = ['./cotizador.html', './icons/flexio.svg', './icons/raiki.svg', './icons/cotizador.svg', './icons/clientes.svg', './icons/carta.svg', './icons/archivos.svg',
  './carta/inter-Regular.woff', './carta/inter-Medium.woff', './carta/inter-SemiBold.woff', './carta/inter-Bold.woff', './carta/inter-ExtraBold.woff'];
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS).catch(() => c.addAll(ASSETS.filter(a => a !== './vendor/supabase.js'))).then(() => { c.add(LIB).catch(() => {}); c.addAll(EXTRA).catch(() => {}); })).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('kivo-') && k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (r.url === LIB) { e.respondWith(caches.match(r).then(m => m || fetch(r))); return; }
  if (u.origin !== location.origin) return;
  // primero internet (para recibir mejoras); si no hay o la señal es mala (más de 3.5 s), la copia guardada
  e.respondWith(new Promise(res => {
    let listo = false;
    const desdeCache = () => caches.match(r, { ignoreSearch: r.mode === 'navigate' }).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : null));
    const t = setTimeout(() => desdeCache().then(m => { if (m && !listo) { listo = true; res(m); } }), 3500);
    fetch(r).then(resp => {
      clearTimeout(t);
      if (resp.ok) { const cp = resp.clone(); caches.open(C).then(c => c.put(r, cp)); }
      if (!listo) { listo = true; res(resp); }
    }).catch(() => { clearTimeout(t); desdeCache().then(m => { if (!listo) { listo = true; res(m || Response.error()); } }); });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
