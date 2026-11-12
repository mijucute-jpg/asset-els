var CACHE_NAME = 'asset-els-shell-v1';
var APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); }));
    })
  );
  self.clients.claim();
});

// 네트워크 우선: 온라인이면 항상 최신 내용을 받아오고, 오프라인일 때만 캐시된 화면을 보여줘요.
// Firebase/Google 등 외부 도메인 요청(인증, Firestore)은 절대 가로채지 않아요.
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then(function (res) {
      var resClone = res.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, resClone); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        return cached || caches.match('/index.html');
      });
    })
  );
});
