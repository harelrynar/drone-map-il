/* =========================================================
 * תנועה אווירית נמוכה (1.8) – כלי טיס שמשדרים ADS-B מתחת לגובה שנקבע.
 * Low-level air traffic – aircraft broadcasting ADS-B below a set altitude.
 *
 * המקור הוא אותו קובץ שהאוסף של בטא ה-GNSS מפרסם פעם בדקה לענף gnss-data
 * (beta/gnss/collector, GitHub Actions; ספקים: adsb.fi / adsb.lol). אין קריאה ישירה לספקים מהדפדפן.
 *
 * מגבלות שחייבים להכיר:
 *  - מוצג רק מי שמשדר ADS-B ונקלט במקלטי הקהילה. רוב כלי הטיס הצבאיים, חלק מהמסוקים,
 *    רחפנים ומצנחי רחיפה אינם משדרים – ולא יופיעו. מפה ריקה אינה אומרת שהשמיים ריקים.
 *  - הנתון מתעכב כדקה עד שתיים. המיקום המוצג הוא המיקום האחרון שנקלט, לא המיקום ברגע זה.
 *  - הגובה הוא גובה ברומטרי (ביחס ללחץ תקני), לא גובה מעל הקרקע.
 *
 * Traffic.init(map, { lang, on, onUpdate })   · Traffic.set(on)
 * Traffic.near(lat, lon) -> [{...aircraft, d}]  · Traffic.status() · Traffic.nearHtml / listHtml
 * ========================================================= */
(function () {
  "use strict";
  const CFG = Object.assign({
    feeds: [
      { url: "https://raw.githubusercontent.com/harelrynar/drone-map-il/gnss-data/s/{k}.json", slotShiftSec: 90 },
      { url: "https://raw.githubusercontent.com/harelrynar/drone-map-il/gnss-data/s/{k}.json", slotShiftSec: 150 },
      { url: "https://api.github.com/repos/harelrynar/drone-map-il/contents/gnss.json?ref=gnss-data&t={t}", headers: { Accept: "application/vnd.github.raw+json" } }
    ],
    slots: 10,
    pollSec: 60,
    staleSec: 240,           // קובץ ישן מזה = "אין נתונים עדכניים"
    maxPosAgeSec: 150,       // מיקום ישן מזה לא מוצג
    maxAltFt: 5000,          // "נמוך" = מתחת לגובה ברומטרי זה
    nearKm: 10,              // רדיוס "תנועה בסביבה" בחלון הנקודה
    color: "#0d47a1"
  }, (window.APP_CONFIG && window.APP_CONFIG.traffic) || {});
  const FT = 3.28084;

  const TXT = {
    he: {
      title: "תנועה אווירית נמוכה", pill: "נמוכים", pillStale: "אין נתון עדכני", pillOff: "תנועה",
      nearTitle: "תנועה נמוכה בטווח {r} ק\"מ", nearNone: "לא נקלט כלי טיס נמוך בטווח {r} ק\"מ.",
      listNone: "כרגע לא נקלט אף כלי טיס מתחת ל-{a} רגל באזור המפה.",
      stale: "אין נתונים עדכניים (האיסוף לא התעדכן {m} דקות).", off: "השכבה כבויה. אפשר להדליק אותה בלוח השכבות.",
      loading: "טוען…", alt: "גובה", ft: "רגל", m: "מ'", kt: "קשר", ago: "נקלט לפני {s} שנ'", agoMin: "נקלט לפני כ-{m} דק'",
      km: "ק\"מ", heading: "כיוון", unknown: "לא מזוהה", heli: "מסוק", light: "מטוס קל", plane: "מטוס",
      caveat: "מוצגים רק כלי טיס שמשדרים ADS-B ונקלטים. רוב הצבאיים, חלק מהמסוקים ורחפנים אחרים לא יופיעו. עיכוב של דקה עד שתיים. הגובה ברומטרי, לא מעל הקרקע.",
      src: "מקור: ADS-B קהילתי ({p}), נאסף פעם בדקה",
      dirs: ["צפון", "צפון-מזרח", "מזרח", "דרום-מזרח", "דרום", "דרום-מערב", "מערב", "צפון-מערב"]
    },
    en: {
      title: "Low-level air traffic", pill: "low", pillStale: "no fresh data", pillOff: "Traffic",
      nearTitle: "Low traffic within {r} km", nearNone: "No low aircraft received within {r} km.",
      listNone: "No aircraft below {a} ft are being received in the map area right now.",
      stale: "No fresh data (the collector has not updated for {m} minutes).", off: "The layer is off. Turn it on in the layers panel.",
      loading: "Loading…", alt: "Altitude", ft: "ft", m: "m", kt: "kt", ago: "received {s} s ago", agoMin: "received about {m} min ago",
      km: "km", heading: "heading", unknown: "unidentified", heli: "Helicopter", light: "Light aircraft", plane: "Aircraft",
      caveat: "Only aircraft that broadcast ADS-B and are received are shown. Most military aircraft, some helicopters and other drones will not appear. Delay of one to two minutes. Altitude is barometric, not above ground.",
      src: "Source: community ADS-B ({p}), sampled once a minute",
      dirs: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    }
  };
  const t = (lang, k) => (TXT[lang] || TXT.he)[k] ?? TXT.he[k] ?? k;

  let map = null, group = null, pill = null, timer = null, on = true, getLang = () => "he", onUpdate = null;
  let feed = null, list = [], fetchedAt = 0, lastErr = null;

  function feedUrl(f) {
    const now = Date.now();
    const k = Math.floor((now - (f.slotShiftSec || 0) * 1000) / 60000) % CFG.slots;
    return f.url.replace("{k}", k).replace("{t}", now);
  }
  async function fetchFeed() {
    let best = null, err = null;
    for (const f of CFG.feeds) {
      try {
        const r = await fetch(feedUrl(f), { headers: f.headers || {}, cache: "no-store" });
        if (!r.ok) throw new Error("traffic feed " + r.status);
        const j = await r.json();
        if (!j || !Array.isArray(j.snaps)) throw new Error("traffic feed: bad payload");
        if (!best || (j.updated || 0) > (best.updated || 0)) best = j;
        if (Date.now() - (j.updated || 0) < CFG.staleSec * 1000) break;   // fresh enough – no need for the fallbacks
      } catch (e) { err = e; }
    }
    if (!best) throw err || new Error("traffic feed unavailable");
    return best;
  }

  const bearing = (la1, lo1, la2, lo2) => {
    const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
    const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  };
  const distKm = (la1, lo1, la2, lo2) => Math.hypot((lo2 - lo1) * 111.32 * Math.cos(la1 * Math.PI / 180), (la2 - la1) * 110.54);

  /* ICAO type designators / emitter category -> rough class for the icon and label */
  function classify(a) {
    if (a.category === "A7" || /^(H\d|EC\d|AS\d|B06|B40|B41|B42|B47|R22|R44|R66|S76|S92|UH|AH|CH|MD5|MD6|A109|A139|A169|B505|EN28|G2CA|BK17)/.test(a.t || "")) return "heli";
    if (a.category === "A1" || a.category === "B1" || a.category === "B4") return "light";
    return "plane";
  }

  function process(j) {
    const snaps = j.snaps || [];
    const last = snaps[snaps.length - 1];
    if (!last) return [];
    const prevPos = new Map();
    snaps.slice(0, -1).forEach(s => (s.ac || []).forEach(a => { if (typeof a.lat === "number") prevPos.set(a.hex, a); }));
    const out = [];
    (last.ac || []).forEach(a => {
      if (typeof a.lat !== "number" || typeof a.lon !== "number") return;
      if (typeof a.alt_baro !== "number") return;                 // "ground" or missing
      if (a.alt_baro > CFG.maxAltFt) return;
      const ageSec = (Date.now() - last.t) / 1000 + (a.seen_pos || 0);
      if (ageSec > CFG.maxPosAgeSec + 60) return;
      let trk = typeof a.track === "number" ? a.track : null;
      if (trk == null) {
        const p = prevPos.get(a.hex);
        if (p && distKm(p.lat, p.lon, a.lat, a.lon) > 0.2) trk = bearing(p.lat, p.lon, a.lat, a.lon);
      }
      out.push({ hex: a.hex, call: (a.flight || "").trim(), reg: a.r || "", t: a.t || "", cls: classify(a),
        lat: a.lat, lon: a.lon, altFt: a.alt_baro, gs: a.gs, trk, at: last.t - (a.seen_pos || 0) * 1000 });
    });
    return out.sort((x, y) => x.altFt - y.altFt);
  }

  function status() {
    if (!on) return { state: "off" };
    if (!feed) return { state: lastErr ? "error" : "loading" };
    const ageSec = (Date.now() - (feed.updated || 0)) / 1000;
    return { state: ageSec > CFG.staleSec ? "stale" : "ok", ageSec, count: list.length, provider: feed.provider, updated: feed.updated };
  }

  /* ---------- drawing ---------- */
  const nameOf = (a, lang) => a.call || a.reg || t(lang, "unknown");
  function icon(a) {
    const rot = a.trk == null ? 0 : a.trk;
    const glyph = a.cls === "heli"
      ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M2 12h20M12 2v20" fill="none" stroke-width="2.4"/></svg>`
      : `<svg viewBox="0 0 24 24" style="transform:rotate(${rot}deg)"><path d="M12 2l2.2 7.2 7.3 3.6v2.2l-7.3-1.8-.5 5 2.4 1.9v1.6L12 20.8l-4.1.9v-1.6l2.4-1.9-.5-5-7.3 1.8v-2.2l7.3-3.6z"/></svg>`;
    return L.divIcon({ className: "tfc " + a.cls + (a.trk == null && a.cls !== "heli" ? " nodir" : ""),
      html: `${glyph}<span>${Math.round(a.altFt / 100) * 100}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
  }
  function agoText(a, lang) {
    const s = Math.max(0, Math.round((Date.now() - a.at) / 1000));
    return s < 90 ? t(lang, "ago").replace("{s}", Math.round(s / 10) * 10) : t(lang, "agoMin").replace("{m}", Math.round(s / 60));
  }
  function detailHtml(a, lang, esc) {
    const cls = t(lang, a.cls);
    const dir = a.trk == null ? "" : ` · ${esc(t(lang, "heading"))} ${esc(t(lang, "dirs")[Math.round(a.trk / 45) % 8])}`;
    return `<b>${esc(nameOf(a, lang))}</b>${a.reg && a.call ? ` <span class="mono">${esc(a.reg)}</span>` : ""} · ${esc(cls)}${a.t ? ` <span class="mono">${esc(a.t)}</span>` : ""}
      <br>${esc(t(lang, "alt"))} ${Math.round(a.altFt).toLocaleString()} ${esc(t(lang, "ft"))} (${Math.round(a.altFt / FT).toLocaleString()} ${esc(t(lang, "m"))})${a.gs != null ? ` · ${Math.round(a.gs)} ${esc(t(lang, "kt"))}` : ""}${dir}
      <br><span class="muted">${esc(agoText(a, lang))}</span>`;
  }
  const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function draw() {
    if (!group) return;
    group.clearLayers();
    const lang = getLang(), st = status();
    if (on && st.state === "ok") list.forEach(a => {
      if (Date.now() - a.at > CFG.maxPosAgeSec * 1000) return;
      L.marker([a.lat, a.lon], { icon: icon(a), zIndexOffset: 900, title: nameOf(a, lang) })
        .bindPopup(() => `<div class="tfc-pop">${detailHtml(a, getLang(), escHtml)}</div>`, { closeButton: false, offset: [0, -8] })
        .addTo(group);
    });
    drawPill();
  }
  function drawPill() {
    if (!pill) return;
    const lang = getLang(), st = status();
    pill.hidden = false;
    pill.className = "tfc-pill" + (st.state === "stale" || st.state === "error" ? " stale" : "") + (st.state === "off" ? " off" : "");
    const plane = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 7.2 7.3 3.6v2.2l-7.3-1.8-.5 5 2.4 1.9v1.6L12 20.8l-4.1.9v-1.6l2.4-1.9-.5-5-7.3 1.8v-2.2l7.3-3.6z"/></svg>`;
    let txt;
    if (st.state === "off") txt = t(lang, "pillOff");
    else if (st.state === "ok") txt = `<b>${st.count}</b> ${escHtml(t(lang, "pill"))}`;
    else if (st.state === "loading") txt = "…";
    else txt = escHtml(t(lang, "pillStale"));
    pill.innerHTML = plane + `<span>${txt}</span>`;
  }

  async function tick() {
    if (!on || document.hidden) return;
    try {
      feed = await fetchFeed(); lastErr = null; fetchedAt = Date.now();
      list = process(feed);
    } catch (e) { lastErr = e; console.warn(e); }
    draw();
    if (onUpdate) onUpdate();
  }
  function schedule() {
    clearInterval(timer); timer = null;
    if (on) { timer = setInterval(tick, CFG.pollSec * 1000); tick(); }
  }

  function init(m, opts) {
    map = m; opts = opts || {};
    if (opts.lang) getLang = opts.lang;
    if (opts.on != null) on = !!opts.on;
    onUpdate = opts.onUpdate || null;
    group = L.layerGroup().addTo(map);
    pill = opts.pill || null;
    document.addEventListener("visibilitychange", () => { if (!document.hidden && on && Date.now() - fetchedAt > CFG.pollSec * 1000) tick(); });
    schedule(); drawPill();
  }
  function set(v) { on = !!v; if (!on) { list = []; } schedule(); draw(); }

  function near(lat, lon) {
    return list.map(a => Object.assign({ d: distKm(lat, lon, a.lat, a.lon) }, a))
      .filter(a => a.d <= CFG.nearKm && Date.now() - a.at <= CFG.maxPosAgeSec * 1000).sort((a, b) => a.d - b.d);
  }

  /* ---------- HTML ---------- */
  function stateHtml(lang, esc) {
    const st = status();
    if (st.state === "off") return `<p class="muted">${esc(t(lang, "off"))}</p>`;
    if (st.state === "loading") return `<p class="muted">${esc(t(lang, "loading"))}</p>`;
    if (st.state === "stale" || st.state === "error")
      return `<p class="tfc-stale">⚠ ${esc(t(lang, "stale").replace("{m}", st.ageSec ? Math.round(st.ageSec / 60) : "?"))}</p>`;
    return null;
  }
  const foot = (lang, esc) => `<p class="fine">${esc(t(lang, "caveat"))} ${esc(t(lang, "src").replace("{p}", (feed && feed.provider) || "adsb.fi"))}.</p>`;

  function nearHtml(lat, lon, o) {
    const L_ = o.lang, title = `<h3>${o.esc(t(L_, "nearTitle").replace("{r}", CFG.nearKm))}</h3>`;
    const bad = stateHtml(L_, o.esc);
    if (bad) return title + bad;
    const ac = near(lat, lon);
    const body = ac.length
      ? `<ul class="tfc-list">${ac.slice(0, 6).map(a => `<li><span>${detailHtml(a, L_, o.esc)}</span><em>${a.d.toFixed(1)} ${o.esc(t(L_, "km"))}</em></li>`).join("")}</ul>`
      : `<p class="muted">${o.esc(t(L_, "nearNone").replace("{r}", CFG.nearKm))}</p>`;
    return title + body + foot(L_, o.esc);
  }
  function listHtml(o) {
    const L_ = o.lang, title = `<h2>${o.esc(t(L_, "title"))}</h2>`;
    const bad = stateHtml(L_, o.esc);
    if (bad) return title + bad + foot(L_, o.esc);
    const body = list.length
      ? `<ul class="tfc-list">${list.map(a => `<li><span>${detailHtml(a, L_, o.esc)}</span><button class="mini" type="button" data-act="tfcGo" data-lat="${a.lat}" data-lon="${a.lon}">⌖</button></li>`).join("")}</ul>`
      : `<p class="muted">${o.esc(t(L_, "listNone").replace("{a}", CFG.maxAltFt.toLocaleString()))}</p>`;
    return title + body + foot(L_, o.esc);
  }

  window.Traffic = { init, set, near, status, nearHtml, listHtml, redraw: draw, t, cfg: CFG, _process: process };
})();
