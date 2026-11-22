/* =========================================================
 * התקנה כאפליקציה (PWA) – מ-1.9
 * - רושם את sw.js (עבודה בלי קליטה עם הנתונים האחרונים שנשמרו)
 * - כפתור "📲 התקנה כאפליקציה" בפוטר:
 *     אנדרואיד/כרום/אדג' – חלון ההתקנה של הדפדפן
 *     אייפון/אייפד, או כשאין חלון התקנה – הוראות קצרות
 *   הכפתור מוסתר כשהאתר כבר פתוח כאפליקציה.
 * - הודעה כשהקליטה נעלמת / חוזרת
 * כיבוי: features.pwa = false ב-js/config.js
 * ========================================================= */
(function () {
  "use strict";
  const CFG = window.APP_CONFIG || {};
  if (!(CFG.features && CFG.features.pwa)) return;

  const Track = window.Track || function () {};
  const App = () => window.UASApp || {};
  const lang = () => (App().lang ? App().lang() : (window.APP_LANG || "he"));
  const btn = document.getElementById("btnInstall");
  const sep = document.getElementById("sepInstall");

  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isMobile = isIOS || isAndroid || /Mobi/.test(ua);
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

  const TXT = {
    he: {
      title: "התקנה כאפליקציה",
      intro: "המפה נשמרת במסך הבית כמו אפליקציה: אייקון משלה, מסך מלא, ונפתחת גם בלי קליטה עם הנתונים האחרונים שנשמרו. בלי חנות ובלי הרשמה, והנתונים ממשיכים להתעדכן כל יום.",
      ios: ["פותחים את המפה ב-Safari (או בכרום באייפון)", "לוחצים על כפתור השיתוף <b>⬆︎</b>", "גוללים ובוחרים <b>\"הוסף למסך הבית\"</b>", "לוחצים <b>\"הוסף\"</b> – האייקון יופיע במסך הבית"],
      android: ["פותחים את תפריט הדפדפן <b>⋮</b>", "בוחרים <b>\"התקנת אפליקציה\"</b> או <b>\"הוספה למסך הבית\"</b>", "מאשרים – האייקון יופיע במסך הבית"],
      desktop: ["בכרום או באדג': לוחצים על סמל ההתקנה בשורת הכתובת", "או: תפריט הדפדפן ← \"התקנת מפת רחפנים ישראל\""],
      note: "בלי קליטה מוצגים האזורים, הנוטאמים והמנחתים כפי שנשמרו בפעם האחרונה. מזג אוויר, גובה קרקע ותנועה אווירית דורשים חיבור. לפני טיסה בודקים את הפמ\"ת והנוטאם הרשמיים.",
      installed: "המפה הותקנה – אפשר לפתוח אותה ממסך הבית",
      offline: "אין קליטה – מוצגים הנתונים האחרונים שנשמרו במכשיר",
      online: "החיבור חזר"
    },
    en: {
      title: "Install as an app",
      intro: "Save the map to your home screen like an app: its own icon, full screen, and it opens without signal using the last saved data. No app store, no sign-up, and the data keeps updating daily.",
      ios: ["Open the map in Safari (or Chrome on iPhone)", "Tap the Share button <b>⬆︎</b>", "Scroll down and choose <b>\"Add to Home Screen\"</b>", "Tap <b>\"Add\"</b> – the icon appears on your home screen"],
      android: ["Open the browser menu <b>⋮</b>", "Choose <b>\"Install app\"</b> or <b>\"Add to Home screen\"</b>", "Confirm – the icon appears on your home screen"],
      desktop: ["In Chrome or Edge: click the install icon in the address bar", "Or: browser menu → \"Install Israel Drone Map\""],
      note: "Without signal, zones, NOTAMs and airstrips are shown as last saved. Weather, ground elevation and air traffic need a connection. Always check the official AIP and NOTAMs before flying.",
      installed: "Installed – open the map from your home screen",
      offline: "No connection – showing the last data saved on this device",
      online: "Back online"
    }
  };
  const t = k => (TXT[lang()] || TXT.he)[k];

  /* ---------- service worker ---------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e));
    });
  }

  /* ---------- install button ---------- */
  let deferred = null;
  function showBtn(on) {
    if (!btn) return;
    btn.hidden = !on; if (sep) sep.hidden = !on;
  }
  if (standalone()) {
    document.documentElement.classList.add("standalone");
    try { if (!sessionStorage.getItem("uasmap.pwaLaunch")) { sessionStorage.setItem("uasmap.pwaLaunch", "1"); Track("pwa-launch", { os: isIOS ? "ios" : isAndroid ? "android" : "other" }); } } catch (e) { /* ignore */ }
    showBtn(false);
  } else {
    showBtn(isMobile);   // במחשב – רק אם הדפדפן מציע התקנה (למטה)
  }

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferred = e;
    if (!standalone()) showBtn(true);
  });
  window.addEventListener("appinstalled", () => {
    deferred = null; showBtn(false);
    Track("pwa-installed", {});
    if (App().toast) App().toast(t("installed"));
  });

  function openHelp() {
    const steps = isIOS ? t("ios") : isAndroid ? t("android") : t("desktop");
    const html = `<h2>${t("title")}</h2><p>${t("intro")}</p>
      <ol class="pwa-steps">${steps.map(s => `<li>${s}</li>`).join("")}</ol>
      <p class="muted small">${t("note")}</p>`;
    if (App().openSheet) App().openSheet(html, "install");
  }

  if (btn) btn.onclick = async () => {
    if (deferred) {
      Track("pwa-install-click", { how: "prompt" });
      deferred.prompt();
      try { const r = await deferred.userChoice; Track("pwa-install-choice", { outcome: r && r.outcome }); } catch (e) { /* ignore */ }
      deferred = null;
      return;
    }
    Track("pwa-install-click", { how: isIOS ? "ios-help" : "help" });
    openHelp();
  };

  /* ---------- offline / online ---------- */
  const say = k => { if (App().toast) App().toast(t(k)); };
  window.addEventListener("offline", () => { document.documentElement.classList.add("offline"); say("offline"); });
  window.addEventListener("online", () => { document.documentElement.classList.remove("offline"); say("online"); });
  if (navigator.onLine === false) {
    document.documentElement.classList.add("offline");
    window.addEventListener("load", () => setTimeout(() => say("offline"), 800));
  }
})();
