/**
 * Service worker de Dlay.
 *
 * Deliberadamente conservador. La regla que no se rompe: NUNCA se guarda en
 * caché una respuesta de la API ni nada que venga con sesión. Una agenda vieja
 * mostrada como si fuera la de hoy es peor que una pantalla sin conexión.
 *
 * Lo único que se cachea son los archivos estáticos de la propia aplicación.
 */

const VERSION = "v1";
const SHELL = `dlay-shell-${VERSION}`;
const OFFLINE_URL = "/sin-conexion";

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: siempre a la red. Si no hay conexión, pantalla de cortesía.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL);
        return (
          (await cache.match(OFFLINE_URL)) ??
          new Response("Sin conexión", { status: 503 })
        );
      }),
    );
    return;
  }

  // Estáticos del build: inmutables, se sirven de caché sin preguntar.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
  }

  // Todo lo demás (incluida cualquier llamada a Supabase) va directo a la red.
});
