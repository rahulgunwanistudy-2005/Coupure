/// <reference lib="webworker" />
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';
const sw = self as unknown as ServiceWorkerGlobalScope;
const NAME = `coupure-${version}`;
// Only static assets: API responses, invoices, tokens and vaults must never enter CacheStorage.
const ASSETS = [...new Set(['/200.html', ...immutable.map((a) => '/' + a.path.replace(/^\//, '')), ...assets.map((a) => '/' + a.path.replace(/^\//, ''))])];
sw.addEventListener('install', (event) => {
 event.waitUntil(caches.open(NAME).then((cache) => cache.addAll(ASSETS)));
});
sw.addEventListener('activate', (event) => {
 event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith('coupure-') && n !== NAME).map((n) => caches.delete(n)))).then(() => sw.clients.claim()));
});
sw.addEventListener('fetch', (event) => {
 const url = new URL(event.request.url);
 if (url.origin !== sw.location.origin || event.request.method !== 'GET' || /^\/(api|mint)(\/|$)/.test(url.pathname)) return;
 if (event.request.mode === 'navigate') {
  event.respondWith(fetch(event.request).catch(async () => (await caches.open(NAME)).match('/200.html').then((r) => r || Response.error())));
 } else if (ASSETS.includes(url.pathname)) {
  event.respondWith(caches.open(NAME).then(async (cache) => (await cache.match(event.request)) || fetch(event.request)));
 }
});
