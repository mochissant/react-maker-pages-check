// react-maker の閲覧用のURLのパスワード（Issue #168）。覚えた鍵で <パス>.rmenc を復号して返す
async function decryptBytes(key, bytes) {
  const data = new Uint8Array(bytes);
  return globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
}
const base = new URL('./', self.location).pathname;
const types = {"html":"text/html; charset=utf-8","js":"text/javascript; charset=utf-8","mjs":"text/javascript; charset=utf-8","css":"text/css; charset=utf-8","json":"application/json","svg":"image/svg+xml","png":"image/png","jpg":"image/jpeg","jpeg":"image/jpeg","gif":"image/gif","webp":"image/webp","avif":"image/avif","ico":"image/x-icon","woff2":"font/woff2","woff":"font/woff","ttf":"font/ttf","txt":"text/plain; charset=utf-8","xml":"application/xml","webmanifest":"application/manifest+json","mp4":"video/mp4","webm":"video/webm"};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
function loadKey() {
  return new Promise((resolve) => {
    const request = indexedDB.open('rm-lock', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const get = request.result.transaction('keys').objectStore('keys').get(base);
      get.onsuccess = () => resolve(get.result && get.result.expires > Date.now() ? get.result.key : null);
      get.onerror = () => resolve(null);
    };
  });
}
async function encrypted(path, navigate) {
  const candidates = [path.endsWith('/') ? path + 'index.html' : path];
  if (navigate && !path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path)) candidates.push(path + '/index.html', path + '.html');
  if (navigate) candidates.push(base + '404.html');
  for (const candidate of candidates) {
    const response = await fetch(candidate + '.rmenc', { cache: 'no-cache' });
    if (response.ok) return { path: candidate, response, missing: candidate === base + '404.html' && candidates.length > 1 };
  }
  return null;
}
async function serve(request, url) {
  const key = await loadKey();
  if (!key) return fetch(request);
  const found = await encrypted(url.pathname, request.mode === 'navigate');
  if (!found) return fetch(request);
  try {
    const body = await decryptBytes(key, await found.response.arrayBuffer());
    const extension = (found.path.split('.').pop() || '').toLowerCase();
    return new Response(body, { status: found.missing ? 404 : 200, headers: { 'Content-Type': types[extension] || 'application/octet-stream' } });
  } catch {
    return fetch(request);
  }
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(base)) return;
  if (url.pathname.startsWith(base + '__rm-lock/') || url.pathname === base + 'rm-lock-sw.js' || url.pathname.endsWith('.rmenc')) return;
  event.respondWith(serve(event.request, url));
});
