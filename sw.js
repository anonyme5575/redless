// Le jeu était à la racine du site ; il est maintenant dans /jouer/ (avec son propre service worker).
// Ce fichier remplace l'ancien service worker de la racine : il efface l'ancienne copie hors ligne,
// se désinstalle, et renvoie les joueurs qui avaient installé Redless vers le jeu.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.navigate(new URL("jouer/", self.registration.scope).href));
  })());
});
