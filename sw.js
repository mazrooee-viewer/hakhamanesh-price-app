/* Service Worker — PWA لیست قیمت — build 20261114075449 */
var CACHE = "price-pwa-20261114075449";
var SHARE_CACHE = "price-share";
var SHARE_KEY = "./__shared-file";
var SHELL = ["./", "./index.html", "./sales.html", "./manifest.json", "./manifest-sales.json",
  "./assets/app-icon-180.png", "./assets/app-icon-192.png", "./assets/app-icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== SHARE_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// فایل منوی Share اندروید (share_target در manifest.json): در کش price-share می‌ماند تا اپ مدیر برش دارد.
function receiveShare(req) {
  var to = function (flag) { return Response.redirect(new URL("./index.html?share=" + flag, self.registration.scope).href, 303); };
  return req.formData().then(function (form) {
    var file = form.get("file");
    if (!file || typeof file === "string") return to("0");
    var headers = { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "shared") };
    return caches.open(SHARE_CACHE).then(function (c) {
      return c.put(new URL(SHARE_KEY, self.registration.scope).href, new Response(file, { headers: headers }));
    }).then(function () { return to("1"); });
  }).catch(function () { return to("0"); });
}

function isFont(url) { return /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname); }

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method === "POST" && new URL(req.url).pathname.endsWith("/share-target")) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (/script\.google\.com$|googleusercontent\.com$/.test(url.hostname)) return;
  if (url.origin === location.origin) {
    var isHtml = req.mode === "navigate" || url.pathname.indexOf(".html") >= 0 || url.pathname.endsWith("/");
    if (isHtml) {
      // HTML: اول از حافظهٔ گوشی (باز شدن فوری حتی با اینترنت کند)، نسخهٔ تازه در پس‌زمینه.
      // نسخهٔ جدید هر build با نام کش جدید + controllerchange → بازخوانی خودکار می‌رسد.
      // اگر در کش نبود: شبکه، و در صورت خطای شبکه هر نسخهٔ کش‌شده.
      var key = url.origin + url.pathname;
      e.respondWith(caches.open(CACHE).then(function (c) {
        return c.match(key, { ignoreSearch: true }).then(function (hit) {
          var net = fetch(key, { cache: "no-cache", credentials: "same-origin" }).then(function (res) {
            if (res && res.ok) return c.put(key, res.clone()).then(function () { return res; });
            return res;
          });
          if (hit) {
            e.waitUntil(net.catch(function () {}));
            return hit;
          }
          return net.catch(function () {
            return caches.match(req, { ignoreSearch: true });
          });
        });
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
