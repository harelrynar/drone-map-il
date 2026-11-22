/* =========================================================
 * גובה קרקע ותקרה אמיתית (1.8) – Open-Meteo Elevation API (Copernicus DEM, ~90 מ'), ללא מפתח.
 * Ground elevation and "real" vertical limits above the ground at a point.
 *
 * Terrain.get(lat, lon)            -> Promise<number>  ground elevation, metres AMSL
 * Terrain.aglM(limit, elevM)       -> metres above ground of an AIP vertical limit
 * Terrain.boxHtml / zoneHtml       -> HTML fragments for the point panel
 *
 * דיוק: מודל הגבהים הוא ממוצע של תא ~90 מ'. בשטח מישורי הסטייה מטרים בודדים; במדרון תלול,
 * מצוק או ואדי היא יכולה להגיע לעשרות מטרים. לכן כל המספרים מוצגים כהערכה.
 * ========================================================= */
(function () {
  "use strict";
  const CFG = Object.assign({
    url: "https://api.open-meteo.com/v1/elevation",
    timeoutMs: 10000
  }, (window.APP_CONFIG && window.APP_CONFIG.terrain) || {});
  const FT = 3.28084;

  const TXT = {
    he: {
      ground: "גובה הקרקע כאן", amsl: "מעל פני הים", est: "הערכה", loading: "בודק גובה קרקע…",
      error: "גובה הקרקע לא זמין כרגע", retry: "נסה שוב",
      note: "לפי מודל גבהים בדיוק של כ-90 מ'. במדרון תלול או ליד מצוק הסטייה יכולה להגיע לעשרות מטרים.",
      above: "מעל הקרקע כאן", fromGround: "מהקרקע", upTo: "עד", unl: "ללא הגבלה", m: "מ'",
      belowGround: "לפי הנתונים, תקרת האזור נמוכה מגובה הקרקע בנקודה הזו. בדקו את גבולות האזור במקור.",
      inside: "בגובה {a} מ' מעל הקרקע אתם בתוך תחום הגבהים של האזור",
      under: "רצפת האזור כ-{d} מ' מעל גובה הטיסה שנבחר ({a} מ')",
      underSkip: "רצפת האזור כ-{d} מ' מעל גובה הטיסה שנבחר ({a} מ') – האזור לא נספר בתשובה שלמעלה",
      over: "תקרת האזור כ-{d} מ' מתחת לגובה הטיסה שנבחר ({a} מ'), אבל המראה ונחיתה מכאן עוברות דרך האזור",
      skipped1: "אזור אחד שמתחיל מעל גובה הטיסה שנבחר ({a} מ') לא נספר, לפי גובה הקרקע כאן.",
      skipped: "{n} אזורים שמתחילים מעל גובה הטיסה שנבחר ({a} מ') לא נספרו, לפי גובה הקרקע כאן.",
      fl: "רמת טיסה היא גובה לחץ – ההמרה לגובה מעל הקרקע משוערת",
      src: "מקור: Open-Meteo (Copernicus DEM)"
    },
    en: {
      ground: "Ground elevation here", amsl: "AMSL", est: "estimate", loading: "Checking ground elevation…",
      error: "Ground elevation is not available right now", retry: "Retry",
      note: "From a ~90 m elevation model. On steep slopes or near cliffs the error can reach tens of metres.",
      above: "Above the ground here", fromGround: "ground", upTo: "to", unl: "unlimited", m: "m",
      belowGround: "According to the data the zone's ceiling is below ground level at this point. Check the source.",
      inside: "At {a} m above ground you are inside the zone's vertical limits",
      under: "The zone's floor is about {d} m above the selected flight height ({a} m)",
      underSkip: "The zone's floor is about {d} m above the selected flight height ({a} m) – not counted in the answer above",
      over: "The zone's ceiling is about {d} m below the selected flight height ({a} m), but take-off and landing here pass through it",
      skipped1: "One zone that starts above the selected flight height ({a} m) was not counted, based on the ground elevation here.",
      skipped: "{n} zone(s) that start above the selected flight height ({a} m) were not counted, based on the ground elevation here.",
      fl: "A flight level is a pressure altitude – the conversion to height above ground is approximate",
      src: "Source: Open-Meteo (Copernicus DEM)"
    }
  };
  const t = (lang, k) => (TXT[lang] || TXT.he)[k] ?? TXT.he[k] ?? k;

  const cache = new Map();          // "lat,lon" (4 decimals ≈ 11 m) -> Promise<number>
  function get(lat, lon, force) {
    const key = lat.toFixed(4) + "," + lon.toFixed(4);
    if (!force && cache.has(key)) return cache.get(key);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CFG.timeoutMs);
    const p = fetch(`${CFG.url}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`, { signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error("elevation " + r.status); return r.json(); })
      .then(j => {
        const v = j && j.elevation && j.elevation[0];
        if (typeof v !== "number" || !isFinite(v)) throw new Error("elevation: bad payload");
        return v;
      })
      .finally(() => clearTimeout(timer));
    cache.set(key, p);
    p.catch(() => cache.delete(key));   // a failure is not cached
    return p;
  }

  /** Height above ground (m) of a vertical limit {v,u,ref}. null = unknown. */
  function aglM(l, elevM) {
    if (!l) return null;
    if (l.ref === "SFC" || l.ref === "GND") return 0;
    if (l.ref === "UNL") return Infinity;
    if (l.v == null) return null;
    const isFL = l.ref === "FL" || l.u === "FL";
    const m = isFL ? l.v * 100 / FT : (l.u === "m" ? l.v : l.v / FT);
    if (l.ref === "AGL") return m;
    return m - elevM;                   // AMSL / FL
  }

  const num = (n, lang) => Math.round(n).toLocaleString(lang === "he" ? "he-IL" : "en-GB");

  function boxHtml(elevM, o) {
    const L = o.lang;
    return `<div class="terr-row"><span class="terr-l">${o.esc(t(L, "ground"))}</span>
        <b>${num(elevM, L)} ${o.esc(t(L, "m"))}</b> <span class="terr-u">${o.esc(t(L, "amsl"))} · ${num(elevM * FT, L)} ft</span>
        <span class="terr-est">${o.esc(t(L, "est"))}</span></div>
      <details class="terr-more"><summary>ⓘ</summary><p>${o.esc(t(L, "note"))} ${o.esc(t(L, "src"))}.</p></details>`;
  }
  function loadingHtml(o) { return `<span class="muted">${o.esc(t(o.lang, "loading"))}</span>`; }
  function errorHtml(o) {
    return `<span class="muted">${o.esc(t(o.lang, "error"))}</span> <button class="mini" type="button" data-act="terrRetry">↻ ${o.esc(t(o.lang, "retry"))}</button>`;
  }

  /** One line for a zone card: the zone's limits as metres above the ground at the point,
   *  and how the selected flight height (o.altM, may be null) relates to them. */
  function zoneHtml(p, elevM, o) {
    const L = o.lang, lo = aglM(p.lower, elevM), hi = aglM(p.upper, elevM);
    if (lo == null && hi == null) return "";
    const needsTerrain = [p.lower, p.upper].some(l => l && (l.ref === "AMSL" || l.ref === "FL" || l.u === "FL"));
    if (!needsTerrain && !(o.altM != null)) return "";
    const fmt = v => v === Infinity ? t(L, "unl") : v <= 0 ? t(L, "fromGround") : `${num(v, L)} ${t(L, "m")}`;
    let html = "";
    if (hi != null && hi <= 0) return `<div class="agl agl-warn">⚠ ${o.esc(t(L, "belowGround"))}</div>`;
    if (needsTerrain) {
      html += `<div class="agl"><span>${o.esc(t(L, "above"))}:</span> <b>${o.esc(fmt(lo == null ? 0 : lo))} ${o.esc(t(L, "upTo"))} ${o.esc(fmt(hi == null ? Infinity : hi))}</b>`;
      if (hi != null && isFinite(hi) && hi > 0) html += ` <span class="terr-u">(${num(hi * FT, L)} ft AGL)</span>`;
      html += ` <span class="terr-est">${o.esc(t(L, "est"))}</span></div>`;
    }
    if (o.altM != null) {
      const a = o.altM, lo0 = lo == null ? 0 : lo, hi0 = hi == null ? Infinity : hi;
      let rel, cls;
      if (a < lo0) { rel = t(L, o.above && o.above.has(p.id) ? "underSkip" : "under").replace("{d}", num(lo0 - a, L)); cls = "agl-out"; }
      else if (a > hi0) { rel = t(L, "over").replace("{d}", num(a - hi0, L)); cls = "agl-in"; }
      else { rel = t(L, "inside"); cls = "agl-in"; }
      html += `<div class="agl ${cls}">${o.esc(rel.replace(/\{a\}/g, String(a)))}</div>`;
    }
    if ([p.lower, p.upper].some(l => l && (l.ref === "FL" || l.u === "FL"))) html += `<div class="agl muted">${o.esc(t(L, "fl"))}</div>`;
    return html;
  }

  window.Terrain = { get, aglM, boxHtml, loadingHtml, errorHtml, zoneHtml, t };
})();
