// Service Worker für eine robuste App-Shell: cached HTML/CSS/JS (und die Supabase-Client-
// Bibliothek von der CDN), damit bei kurzzeitig schwachem Netz am Strand nicht die ganze
// Seite leer bleibt. Supabase-RPC-Aufrufe selbst werden nie abgefangen oder gecacht -
// Spielstand und Punkte müssen immer live vom Server kommen.
const CACHE_NAME = "brouwersdam-shell-v1";
const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

const PRECACHE_URLS = [
  "index.html",
  "admin.html",
  "rangliste.html",
  "minigame.html",
  "mein-bereich.html",
  "windsurf-sim.html",
  "theorie.html",
  "finale.html",
  "quiz.html",
  "css/style.css",
  "js/config.js",
  "js/app.js",
  "js/start.js",
  "js/mein-bereich.js",
  "js/rangliste.js",
  "js/admin.js",
  "js/minigame.js",
  "js/minigame-page.js",
  "js/windsurf-sim.js",
  "js/windsurf-sim-page.js",
  "js/theorie.js",
  "js/theorie-page.js",
  "js/theorie-questions.js",
  "js/quiz.js",
  "js/quiz-page.js",
  "js/finale.js",
  "js/finale-page.js",
  "js/sfx.js",
  "manifest.json",
  "icon.svg",
  SUPABASE_JS_URL,
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin && req.url !== SUPABASE_JS_URL) return; // Supabase-API & Drittes unangetastet lassen

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
