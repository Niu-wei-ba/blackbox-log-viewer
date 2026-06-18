export function cleanupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const cleanup = async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in globalThis) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.includes("workbox") || cacheName.includes("precache"))
          .map((cacheName) => caches.delete(cacheName))
      );
    }
  };

  cleanup().catch((error) => {
    console.warn("Failed to clean up service worker cache:", error);
  });
}
