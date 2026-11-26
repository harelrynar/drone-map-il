/* =========================================================
 * Service worker – מפת רחפנים כאפליקציה (PWA), מ-1.9
 *
 * העיקרון: הרשת קודמת תמיד. הנתונים מתעדכנים כל יום (פמ"ת/נוטאם), ולכן
 * כל בקשה הולכת קודם לשרת; העותק השמור משמש רק כשאין קליטה או כשהרשת
 * איטית מדי – ואז הוא מוחלף ברקע כשהתשובה מהשרת מגיעה.
 *
 * - קבצי האתר והנתונים (אותו דומיין): network-first, גיבוי מהמטמון.
 *   מפתח המטמון בלי ה-query (?v=…), כדי שעותק אחד ישמש את כל הבקשות.
 * - גופנים של Google: stale-while-revalidate.
 * - כל השאר (אריחי OSM, Open-Meteo, ADS-B, Umami): לא נוגעים.
 *
 * בשינוי בקובץ הזה – להעלות את VERSION, כדי שהדפדפן יתקין את החדש.
 * ========================================================= */
const VERSION = "1.13.2";
const CACHE = "uasmap-" + VERSION;
const FONTS = "uasmap-fonts";

/* נשמרים בהתקנה, כדי שהאפליקציה תיפתח בלי קליטה כבר אחרי הביקור הראשון */
const PRECACHE = [
  "./", "en/", "manifest.webmanifest", "manifest-en.webmanifest",
  "css/leaflet.css", "css/app.css",
  "js/leaflet.js", "js/config.js", "js/analytics.js", "js/i18n.js", "js/geo.js",
  "js/weather.js", "js/terrain.js", "js/osm.js", "js/traffic.js", "js/whocall.js",
  "js/app.js", "js/pwa.js",
  "img/icon-192.png", "img/apple-touch-icon.png",
  "data/basemap.json", "data/meta.json", "data/zones.json", "data/notams.json",
  "data/overlays.json", "data/versions.json", "data/crosscheck.json"
];

/* זמן המתנה לרשת לפני שמציגים עותק שמור (אם יש) */
const NET_TIMEOUT_MS = 6000;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // קובץ אחד שנכשל לא מפיל את ההתקנה
    await Promise.all(PRECACHE.map(p => c.add(new Request(p, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("uasmap-") && k !== CACHE && k !== FONTS).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const keyOf = url => { const u = new URL(url); return u.origin + u.pathname; };

async function networkFirst(event) {
  const req = event.request;
  const key = keyOf(req.url);
  const cache = await caches.open(CACHE);

  // no-cache: בודקים מול השרת בכל פעם (304 זול), כדי שקובצי JS/CSS ישנים ממטמון הדפדפן
  // (GitHub Pages: max-age=600) לא יתערבבו עם HTML חדש אחרי פרסום
  let netReq = req;
  if (req.mode !== "navigate" && req.cache !== "no-store") { try { netReq = new Request(req, { cache: "no-cache" }); } catch (e) { netReq = req; } }
  const net = fetch(netReq).then(res => {
    if (res && res.ok && res.type === "basic") {
      const copy = res.clone();
      event.waitUntil(cache.put(key, copy).catch(() => {}));
    }
    return res;
  });

  const cached = await cache.match(key);
  if (!cached) return net;                 // אין עותק – מחכים לרשת (ושגיאה עוברת לדף)

  let timer;
  const slow = new Promise(r => { timer = setTimeout(() => r(cached), NET_TIMEOUT_MS); });
  try {
    const res = await Promise.race([net.catch(() => cached), slow]);
    return res;
  } finally {
    clearTimeout(timer);
    event.waitUntil(net.catch(() => {}));  // התשובה האיטית עדיין תתעדכן במטמון
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(FONTS);
  const cached = await cache.match(event.request);
  const net = fetch(event.request).then(res => {
    if (res && (res.ok || res.type === "opaque")) event.waitUntil(cache.put(event.request, res.clone()).catch(() => {}));
    return res;
  });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
  return net;
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    event.respondWith(networkFirst(event));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(event));
  }
  // כל השאר עובר ישירות לרשת
});
