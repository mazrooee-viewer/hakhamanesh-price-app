/* Service Worker — PWA لیست قیمت — build 20260920210723 */
var CACHE = "price-pwa-20260920210723";
var SHELL = ["./", "./index.html", "./sales.html", "./manifest.json", "./manifest-sales.json",
  "./assets/app-icon-180.png", "./assets/app-icon-192.png", "./assets/app-icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isFont(url) { return /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname); }

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (/script\.google\.com$|googleusercontent\.com$/.test(url.hostname)) return;
  if (url.origin === location.origin) {
    var isHtml = req.mode === "navigate" || url.pathname.indexOf(".html") >= 0 || url.pathname.endsWith("/");
    if (isHtml) {
      e.respondWith(fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true });
      }));
      return;
    }
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  if (isFont(url)) {
    e.respondWith(caches.open(CACHE + "-fonts").then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; });
      });
    }));
  }
});
