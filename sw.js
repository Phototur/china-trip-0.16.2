/* China Trip PWA SW — cache-first shell, network-first for navigations */

// ── Версия кеша ────────────────────────────────────────────────────────────
// При любом изменении файлов ОБЯЗАТЕЛЬНО обнови эту строку,
// иначе пользователи будут получать старую версию из кеша.
// Формат: "china-trip-v" + YYYYMMDD[+суффикс при нескольких релизах за день]
const CACHE_NAME = "china-trip-v20260401";

// PATCH: убран "./sw.js" — SW сравнивается браузером по байтам напрямую
// с сетью, кешировать его не нужно и это может вызвать путаницу при обновлении.
const CORE = [
  "./",
  "./index.html",
  "./app.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // PATCH: self.clients.claim() переключает все открытые вкладки на новый SW
  // немедленно. Это осознанный выбор — пользователь сразу получает новую версию
  // без перезагрузки. Побочный эффект: если открыты две вкладки с разными
  // версиями, обе переключатся на новую одновременно.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
      );
      await self.clients.claim();
    })()
  );
});

// Network-first для HTML-навигаций, cache-first для ресурсов
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ── HTML-навигация (переход на страницу) ──────────────────────────────────
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // PATCH: кешируем только успешный ответ — раньше 404/500 тоже
          // попадали в кеш, что приводило к "вечной" ошибке оффлайн.
          if (fresh.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("./index.html", fresh.clone());
          }
          return fresh;
        } catch (e) {
          // Оффлайн: отдаём закешированную оболочку
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // ── Прочие запросы того же origin (js, css, иконки, манифест) ─────────────
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          // Примечание: opaque-ответы (cross-origin без CORS) имеют status 0,
          // поэтому fresh.ok = false и они не кешируются. Сейчас все ресурсы
          // локальные, поэтому это не проблема. При добавлении CDN — учесть.
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          return cached || Response.error();
        }
      })()
    );
  }
});
