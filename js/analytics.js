/* =========================================================
 * מדידת שימוש (Umami Cloud) – ללא עוגיות, ללא מידע אישי.
 * Usage analytics (Umami Cloud) – cookieless, no personal data.
 *
 * מופעל רק כש-APP_CONFIG.analytics.websiteId מוגדר.
 * Use: Track("event-name", { key: "value" })  – safe no-op if disabled.
 * ========================================================= */
(function () {
  const cfg = (window.APP_CONFIG && window.APP_CONFIG.analytics) || {};
  const queue = [];
  let ready = false;

  window.Track = function (name, data) {
    if (!cfg.websiteId) return;
    if (ready && window.umami) { try { window.umami.track(name, data); } catch (e) {} }
    else if (queue.length < 50) queue.push([name, data]);
  };

  if (!cfg.websiteId) return;
  // count only the real site (not local tests / previews)
  if (cfg.domains && cfg.domains.length && !cfg.domains.includes(location.hostname)) return;

  const s = document.createElement("script");
  s.defer = true;
  s.src = cfg.src || "https://cloud.umami.is/script.js";
  s.setAttribute("data-website-id", cfg.websiteId);
  if (cfg.domains) s.setAttribute("data-domains", cfg.domains.join(","));
  s.onload = () => {
    ready = true;
    queue.splice(0).forEach(([n, d]) => { try { window.umami.track(n, d); } catch (e) {} });
  };
  document.head.appendChild(s);
})();
