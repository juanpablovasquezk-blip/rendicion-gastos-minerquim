// Service Worker — Rendición de Gastos Grupo Minerquim
const CACHE_NAME = "minerquim-gastos-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/offline.html",
  "/brand/app-icon.png",
  "/brand/logo-minerquim.jpg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable-512x512.png",
  "/icons/apple-touch-icon.png"
];

// Instalación: Cachear assets estáticos iniciales
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activación: Limpiar caches antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones que no sean GET o que sean de extensiones
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // Ignorar llamadas de APIs para evitar datos obsoletos en base de datos
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co")) {
    return;
  }

  // Assets estáticos (imágenes, fuentes, css, js) -> Cache First con revalidación
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        }).catch(() => caches.match("/brand/app-icon.png"));
      })
    );
    return;
  }

  // Peticiones de Navegación HTML -> Network First con fallback a Cache y luego /offline.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match("/offline.html");
        })
    );
    return;
  }

  // Resto de peticiones
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || new Response("Offline", { status: 503, statusText: "Offline" });
    })
  );
});

// ============================================================================
// Web Push Notifications
// ============================================================================
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "Minerquim Gastos";
    const options = {
      body: data.body || "Nueva notificación disponible",
      icon: data.icon || "/icons/icon-192x192.png",
      badge: data.badge || "/brand/app-icon.png",
      data: {
        url: data.url || "/dashboard",
        ...data.data,
      },
      vibrate: [100, 50, 100],
      tag: data.tag || "minerquim-notification",
      renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Error procesando payload push:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

