/* SpinSense push-only Service Worker. Zero fetch/API/tile caching. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function resolveSafePath(rawUrl) {
  if (typeof rawUrl !== "string") return "/branches";
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/branches";
  }
  return trimmed;
}

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch {
      const text = event.data.text();
      payload = { body: typeof text === "string" ? text : "" };
    }
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "SpinSense Alert";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : "Open SpinSense to inspect recent branch activity.";
  const url = resolveSafePath(payload.url);
  const tag =
    typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag.trim()
      : "spinsense-alert";

  const options = {
    body,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag,
    renotify: true,
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const safePath = resolveSafePath(event.notification?.data?.url);
  const targetUrl = new URL(safePath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin !== self.location.origin) continue;
          if ("navigate" in client && clientUrl.pathname !== safePath) {
            return client.navigate(targetUrl).then((navClient) => {
              if (navClient && "focus" in navClient) return navClient.focus();
              return client.focus();
            });
          }
          if ("focus" in client) {
            return client.focus();
          }
        } catch {
          // Ignore malformed client URLs and fall back to opening a window.
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
