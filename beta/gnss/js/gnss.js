/* =========================================================
 * שכבת GNSS (בטא) – שיבושים, חסימות והונאות ב-15 הדקות האחרונות.
 * GNSS layer (beta) – interference seen in the last 15 minutes.
 *
 * מקור: נתוני ADS-B חיים מרשתות קהילתיות (adsb.fi / adsb.lol).
 * כל מטוס משדר את דיוק הניווט שלו (NACp / NIC). אוסף ב-GitHub Actions דוגם את
 * המטוסים שמעל ישראל פעם בדקה ומפרסם את 16 הדקות האחרונות; הדפדפן מוריד את
 * הקובץ פעם בדקה, מסווג כל מטוס ומסכם לכל תא במפה.
 *
 * זו הערכה: המדידה היא ממטוסים בגובה, לא מגובה הקרקע.
 * ========================================================= */
window.GNSS = (function () {
  "use strict";
  const CFG = (window.APP_CONFIG && window.APP_CONFIG.gnss) || null;
  let app = null, map = null, group = null, timer = null, busy = false;
  const obs = new Map();     // "hex|cell" -> {t, st, why, fl, hex, raw}
  const lastPos = new Map(); // hex -> {t, lat, lon, gs}
  const S = { on: true, lastOk: null, lastTry: null, provider: null, error: null, started: null, cells: {}, total: 0, openCell: null };

  const TXT = {
    he: {
      title: "שיבושי GNSS (בטא)", layer: "שיבושי GNSS – 15 דקות אחרונות", pill: "GNSS",
      ok: "תקין", nodata: "אין נתונים", degraded: "שיבוש (דיוק ירוד)", jam: "חסימה (אובדן GPS)", spoof: "חשד להונאה (Spoofing)",
      okS: "תקין", nodataS: "אין נתונים", degradedS: "שיבוש", jamS: "חסימה", spoofS: "הונאה",
      updated: "עודכן", never: "עדיין לא התקבלו נתונים", loading: "טוען נתונים…",
      err: "אין חיבור למקור הנתונים החי. השכבה לא מעודכנת.",
      errStale: "האיסוף נעצר. הנתונים האחרונים הם משעה",
      window: "חלון זמן", windowFull: "15 הדקות האחרונות", windowPart: "{m} דקות (האיסוף התחיל לאחרונה; החלון המלא נבנה בהדרגה)",
      sampled: "מטוסים שנדגמו בתא", affected: "מטוסים שנפגעו", conf: "רמת ביטחון", confHigh: "בינונית-גבוהה", confLow: "נמוכה (מטוס יחיד)",
      cell: "תא", status: "סטטוס", source: "מקור", provider: "רשת ADS-B",
      estTitle: "הערכה בלבד",
      estText: "הסטטוס מחושב מדיווחי דיוק הניווט של מטוסים שעברו בתא. המדידה היא בגובה הטיסה שלהם ולא בגובה הקרקע, וגבולות התא סכמטיים. ייתכן שיבוש בקרקע גם בתא \"תקין\", ולהפך.",
      nodataText: "לא עבר בתא מטוס משדר ב-15 הדקות האחרונות, ולכן אי אפשר לדעת אם יש שיבוש. זה לא אומר שהאזור תקין.",
      okText: "המטוסים שעברו בתא דיווחו על דיוק ניווט תקין.",
      quote: "ציטוט מהנתונים הגולמיים", list: "תאים עם שיבוש כרגע", none: "לא זוהו שיבושים ב-15 הדקות האחרונות בתאים שנדגמו.",
      how: "איך זה מחושב",
      howItems: [
        "חסימה: מטוס שאיבד קליטת GPS (שדה gpsOkBefore) או שדיווח NACp=0. המיקום הוא הנקודה האחרונה שבה ה-GPS עוד היה תקין.",
        "שיבוש: מטוס עם משדר ADS-B גרסה 2 שדיווח דיוק ירוד (NACp ≤ {nac} או NIC ≤ {nic}).",
        "חשד להונאה: קפיצת מיקום שלא אפשרית פיזית בין שתי דגימות, או פער של יותר מ-{alt} רגל בין גובה ה-GNSS לגובה הברומטרי. זה סימן עקיף בלבד.",
        "תא שבו נפגע מטוס יחיד מסומן בקו מקווקו (ביטחון נמוך)."
      ],
      refresh: "רענן עכשיו", showLayer: "הצג את השכבה במפה", here: "GNSS בנקודה", zoom: "הצג במפה",
      legend: "מקרא", counts: "{d} תאים משובשים · {n} מטוסים נדגמו", min: "דק'"
    },
    en: {
      title: "GNSS interference (beta)", layer: "GNSS interference – last 15 min", pill: "GNSS",
      ok: "Normal", nodata: "No data", degraded: "Interference (degraded accuracy)", jam: "Jamming (GPS lost)", spoof: "Suspected spoofing",
      okS: "OK", nodataS: "No data", degradedS: "Degraded", jamS: "Jamming", spoofS: "Spoofing",
      updated: "Updated", never: "No data received yet", loading: "Loading…",
      err: "Cannot reach the live data source. The layer is not up to date.",
      errStale: "Collection has stopped. Latest data is from",
      window: "Time window", windowFull: "Last 15 minutes", windowPart: "{m} min (collection started recently; the full window builds up gradually)",
      sampled: "Aircraft sampled in cell", affected: "Aircraft affected", conf: "Confidence", confHigh: "Medium-high", confLow: "Low (single aircraft)",
      cell: "Cell", status: "Status", source: "Source", provider: "ADS-B network",
      estTitle: "Estimate only",
      estText: "Status is derived from navigation-accuracy values reported by aircraft that crossed the cell. It is measured at their flight altitude, not at ground level, and cell borders are schematic. Ground-level interference may exist in a \"normal\" cell and vice versa.",
      nodataText: "No transmitting aircraft crossed this cell in the last 15 minutes, so interference cannot be assessed. This does not mean the area is clear.",
      okText: "Aircraft crossing the cell reported normal navigation accuracy.",
      quote: "Raw data quote", list: "Cells with interference now", none: "No interference detected in the last 15 minutes in sampled cells.",
      how: "How it is computed",
      howItems: [
        "Jamming: an aircraft that lost GPS (gpsOkBefore field) or reported NACp=0. Plotted at its last good GPS position.",
        "Interference: an ADS-B version 2 aircraft reporting degraded accuracy (NACp ≤ {nac} or NIC ≤ {nic}).",
        "Suspected spoofing: a physically impossible position jump between two samples, or more than {alt} ft between GNSS and barometric altitude. Indirect evidence only.",
        "A cell where a single aircraft was affected is drawn dashed (low confidence)."
      ],
      refresh: "Refresh now", showLayer: "Show layer on map", here: "GNSS at this point", zoom: "Show on map",
      legend: "Legend", counts: "{d} cells affected · {n} aircraft sampled", min: "min"
    }
  };
  const lang = () => (app && app.state.lang) || "he";
  const t = k => (TXT[lang()] && TXT[lang()][k]) ?? TXT.he[k] ?? k;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RANK = { nodata: 0, ok: 1, degraded: 2, jam: 3, spoof: 4 };
  const hhmm = ms => new Date(ms).toLocaleTimeString(lang() === "he" ? "he-IL" : "en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });

  /* ---------- grid ---------- */
  function lonStep() { return CFG.cellDeg / Math.cos(((CFG.bbox[0] + CFG.bbox[2]) / 2) * Math.PI / 180); }
  function cellOf(lat, lon) {
    const [s, w, n, e] = CFG.bbox;
    if (!(lat >= s && lat < n && lon >= w && lon < e)) return null;
    return Math.floor((lat - s) / CFG.cellDeg) + "_" + Math.floor((lon - w) / lonStep());
  }
  function cellCenter(id) {
    const [r, c] = id.split("_").map(Number);
    return [CFG.bbox[0] + (r + 0.5) * CFG.cellDeg, CFG.bbox[1] + (c + 0.5) * lonStep()];
  }
  function allCells() {
    const [s, w, n, e] = CFG.bbox, out = [];
    const rows = Math.ceil((n - s) / CFG.cellDeg - 1e-9), cols = Math.ceil((e - w) / lonStep() - 1e-9);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(r + "_" + c);
    return out;
  }
  function octagon(id) {
    const [la, lo] = cellCenter(id);
    const R = (CFG.cellDeg / 2) * 0.97 / Math.cos(Math.PI / 8), k = Math.cos(la * Math.PI / 180), pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (22.5 + 45 * i) * Math.PI / 180;
      pts.push([la + R * Math.sin(a), lo + R * Math.cos(a) / k]);
    }
    return pts;
  }

  /* ---------- classification of one aircraft record ---------- */
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function classify(a, nowMs) {
    if (a.alt_baro === "ground") return null;
    const lat = num(a.lat), lon = num(a.lon);
    const okLat = num(a.gpsOkLat), okLon = num(a.gpsOkLon);
    const nac = num(a.nac_p), nic = num(a.nic), ver = num(a.version);
    const type = String(a.type || "");
    const fl = String(a.flight || "").trim() || String(a.r || "").trim() || String(a.hex || "");
    const base = `hex=${a.hex} ${fl} type=${type || "?"} nac_p=${nac ?? "–"} nic=${nic ?? "–"}`;

    // 1. GPS lost (readsb reports this for 15 min after the loss)
    if (a.gpsOkBefore != null) {
      let tb = Number(a.gpsOkBefore); if (tb < 1e12) tb *= 1000;
      const P = okLat != null && okLon != null ? [okLat, okLon] : (lat != null ? [lat, lon] : null);
      if (P && nowMs - tb <= CFG.windowMin * 60000 + 60000)
        return { st: "jam", lat: P[0], lon: P[1], fl, raw: `${base} gpsOkBefore=${hhmm(tb)}`, why: "gpsOkBefore" };
    }
    if (lat == null || lon == null) return null;
    if (num(a.seen_pos) != null && a.seen_pos > CFG.maxPosAgeSec) return null;
    const adsb = type.startsWith("adsb");
    // NIC=0 next to a good NACp is usually a light-aircraft GPS that does not report integrity, not jamming
    if (adsb && ver === 2 && (nac === 0 || (nic === 0 && (nac == null || nac <= CFG.nacDegraded))))
      return { st: "jam", lat, lon, fl, raw: base, why: "nac0" };

    // 2. suspected spoofing – indirect signs only
    const gs = num(a.gs), ag = num(a.alt_geom), ab = num(a.alt_baro);
    const prev = lastPos.get(a.hex);
    if (adsb) lastPos.set(a.hex, { t: nowMs, lat, lon, gs });
    if (adsb && prev && nowMs - prev.t >= 8000 && nowMs - prev.t <= 240000) {
      const dKm = Geo.distanceM(prev.lat, prev.lon, lat, lon) / 1000, dtH = (nowMs - prev.t) / 3600000;
      const implied = dKm / dtH / 1.852; // kt
      const lim = Math.max(CFG.spoofJumpKt, 2.5 * Math.max(gs || 0, prev.gs || 0));
      if (dKm > CFG.spoofJumpMinKm && implied > lim)
        return { st: "spoof", lat: prev.lat, lon: prev.lon, fl, raw: `${base} jump=${Math.round(dKm)}km/${Math.round((nowMs - prev.t) / 1000)}s (${Math.round(implied)}kt)`, why: "jump" };
    }
    if (adsb && ag != null && ab != null && Math.abs(ag - ab) > CFG.spoofAltDiffFt)
      return { st: "spoof", lat, lon, fl, raw: `${base} alt_geom=${ag} alt_baro=${ab}`, why: "alt" };

    // 3. degraded accuracy
    if (adsb && ver === 2 && ((nac != null && nac <= CFG.nacDegraded) || (nic != null && nic > 0 && nic <= CFG.nicDegraded)))
      return { st: "degraded", lat, lon, fl, raw: base, why: "nac" };
    if (adsb && (nac != null || nic != null)) return { st: "ok", lat, lon, fl, raw: base, why: "" };
    return null; // MLAT / Mode-S only: says nothing about GNSS quality
  }

  /* ---------- fetch ----------
   * The ADS-B APIs cannot be called from a browser (no CORS), so a GitHub Actions job
   * (beta/gnss/collector) samples them every minute and publishes the last 16 minutes
   * as one JSON file. Here we download it and replay the samples we have not seen yet. */
  async function fetchFeed() {
    let lastErr = null, best = null;
    for (const f of CFG.feeds) {
      try {
        const ctl = new AbortController(), h = setTimeout(() => ctl.abort(), 12000);
        const k = Math.floor((Date.now() - (f.slotShiftSec || 0) * 1000) / 60000) % 10;
        const r = await fetch(f.url.replace("{t}", Date.now()).replace("{k}", k), { signal: ctl.signal, cache: "no-store", headers: f.headers || {} });
        clearTimeout(h);
        if (!r.ok) throw new Error(f.id + " HTTP " + r.status);
        const j = await r.json();
        if (!j || !Array.isArray(j.snaps)) throw new Error(f.id + " bad payload");
        if (!best || (j.updated || 0) > (best.updated || 0)) best = j;
        // a CDN copy may lag a few minutes – only then try the next (rate-limited) address
        if (Date.now() - (j.updated || 0) < CFG.staleSec * 1000) break;
      } catch (e) { lastErr = e; }
    }
    if (!best) throw lastErr || new Error("no feed");
    return best;
  }

  function ingest(ac, now) {
    ac.forEach(a => {
      if (!a || !a.hex) return;
      let c; try { c = classify(a, now); } catch (e) { return; }
      if (!c) return;
      if (now < Date.now() - CFG.windowMin * 60000) return;
      const cell = cellOf(c.lat, c.lon); if (!cell) return;
      const key = a.hex + "|" + cell, old = obs.get(key);
      // keep the worst state seen for this aircraft in this cell during the window
      if (old && RANK[old.st] > RANK[c.st]) { old.seen = now; return; }
      obs.set(key, { t: now, seen: now, st: c.st, fl: c.fl, hex: a.hex, raw: c.raw, why: c.why, cell });
    });
  }
  function prune(now) {
    const lim = now - CFG.windowMin * 60000;
    obs.forEach((o, k) => { if (o.t < lim) obs.delete(k); });
    lastPos.forEach((p, k) => { if (p.t < now - 1200000) lastPos.delete(k); });
  }
  function summarize() {
    const cells = {}; const hexes = new Set();
    obs.forEach(o => {
      const c = cells[o.cell] || (cells[o.cell] = { n: 0, ok: 0, degraded: 0, jam: 0, spoof: 0, items: [] });
      c.n++; c[o.st]++; hexes.add(o.hex);
      if (o.st !== "ok") c.items.push(o);
    });
    Object.values(cells).forEach(c => {
      const bad = c.degraded + c.jam + c.spoof;
      c.bad = bad;
      c.st = c.spoof ? "spoof" : c.jam ? "jam" : (c.degraded >= 2 || (c.degraded && c.degraded / c.n >= CFG.degradedShare)) ? "degraded" : "ok";
      c.low = c.st !== "ok" && bad < 2;
      c.items.sort((a, b) => RANK[b.st] - RANK[a.st] || b.t - a.t);
    });
    S.cells = cells; S.total = hexes.size;
  }
  function cellInfo(id) { return S.cells[id] || { n: 0, bad: 0, st: "nodata", items: [], low: false }; }

  async function tick(force) {
    if (!S.on || busy || (document.hidden && !force)) return;
    busy = true; S.lastTry = Date.now();
    try {
      const feed = await fetchFeed();
      feed.snaps.slice().sort((x, y) => x.t - y.t).forEach(sn => {
        if (sn.t <= (S.lastSnap || 0)) return;
        ingest(sn.ac || [], sn.t); S.lastSnap = sn.t;
      });
      prune(Date.now());
      S.started = feed.snaps.length ? Math.min(...feed.snaps.map(x => x.t)) : null;
      S.provider = feed.provider; S.lastOk = feed.updated || null; S.feedError = feed.error || null;
      S.stale = !S.lastOk || Date.now() - S.lastOk > CFG.staleSec * 1000;
      S.error = S.stale ? "stale" : null;
    } catch (e) {
      S.error = String(e && e.message || e);
      prune(Date.now());
    }
    busy = false;
    summarize(); draw(); pill();
    if (app && app.sheetKind() === "gnss") reopen();
  }

  /* ---------- drawing ---------- */
  function styleOf(info) {
    const c = CFG.colors[info.st], bad = RANK[info.st] >= 2;
    return {
      pane: bad ? "p_gnssTop" : "p_gnss", color: c, weight: bad ? 2.6 : 1, opacity: bad ? 0.95 : info.st === "ok" ? 0.55 : 0.45,
      dashArray: info.st === "nodata" ? "2 5" : info.low ? "7 5" : null,
      fillColor: c, fillOpacity: bad ? 0.26 : info.st === "ok" ? 0.10 : 0.04, className: "gnss-oct g-" + info.st
    };
  }
  function draw() {
    if (!group) return;
    group.clearLayers();
    if (!S.on) return;
    const z = map.getZoom();
    allCells().forEach(id => {
      const info = cellInfo(id);
      const bad = RANK[info.st] >= 2;
      // white halo under the outline so an affected cell stands out from the airspace zones
      if (bad) L.polygon(octagon(id), { pane: "p_gnssTop", color: "#fff", weight: 6, opacity: 0.9, fill: false, interactive: false }).addTo(group);
      const poly = L.polygon(octagon(id), styleOf(info));
      // same behaviour as any tap on the map: the point sheet opens with the GNSS card first
      poly.on("click", e => { L.DomEvent.stop(e); app.openPoint(e.latlng.lat, e.latlng.lng); });
      poly.addTo(group);
      if (RANK[info.st] >= 2 && z >= 8) {
        L.marker(cellCenter(id), {
          pane: "p_gnssTop", interactive: false, keyboard: false,
          icon: L.divIcon({ className: "gnss-tag g-" + info.st, html: `<span style="--gc:${CFG.colors[info.st]}">${esc(t(info.st + "S"))}${info.low ? "?" : ""}</span>`, iconSize: [0, 0] })
        }).addTo(group);
      }
    });
  }
  function badCells() {
    return Object.keys(S.cells).filter(id => RANK[S.cells[id].st] >= 2).sort((a, b) => RANK[S.cells[b].st] - RANK[S.cells[a].st]);
  }
  function worst() { return badCells().reduce((w, id) => RANK[S.cells[id].st] > RANK[w] ? S.cells[id].st : w, "ok"); }
  function pill() {
    const el = document.getElementById("gnssPill"); if (!el) return;
    el.hidden = false;
    const bad = badCells().length;
    const st = !S.on ? "off" : S.error && (!S.lastOk || !obs.size) ? "err" : !S.lastOk ? "load" : worst();
    el.className = "gnss-pill p-" + st + (S.error ? " stale" : "");
    const txt = !S.on ? "—" : st === "err" ? "!" : st === "load" ? "…" : bad ? String(bad) : "✓";
    el.innerHTML = `<i></i><b>${esc(t("pill"))}</b><span>${esc(txt)}</span>${S.lastOk && S.on ? `<time>${hhmm(S.lastOk)}</time>` : ""}`;
  }

  /* ---------- panels ---------- */
  function windowText() {
    if (!S.started || !S.lastOk) return t("never");
    const m = Math.floor((S.lastOk - S.started) / 60000);
    return m >= CFG.windowMin - 2 ? t("windowFull") : t("windowPart").replace("{m}", Math.max(1, m));
  }
  function statusLine() {
    if (S.error) return `<div class="gnss-err">⚠ ${esc(t(S.lastOk ? "errStale" : "err"))}${S.lastOk ? ` ${hhmm(S.lastOk)}` : ""}</div>`;
    if (!S.lastOk) return `<p class="muted">${esc(t("loading"))}</p>`;
    return `<p class="muted gnss-upd">${esc(t("updated"))} ${hhmm(S.lastOk)} · ${esc(t("counts").replace("{d}", badCells().length).replace("{n}", S.total))}</p>`;
  }
  function legendHtml() {
    return `<ul class="legend gnss-legend">${["jam", "spoof", "degraded", "ok", "nodata"].map(k =>
      `<li><i class="sw oct" style="--zc:${CFG.colors[k]};--dash:${k === "nodata" ? "dashed" : "solid"}"></i>${esc(t(k))}</li>`).join("")}</ul>`;
  }
  function estBox(extra) {
    return `<div class="approx gnss-est"><b>⚠ ${esc(t("estTitle"))}</b><p>${esc(t("estText"))}</p>${extra || ""}</div>`;
  }
  function sourceHtml() {
    const p = CFG.providers.find(x => x.id === S.provider);
    return p ? `<a href="${esc(p.site)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : CFG.providers.map(x => esc(x.name)).join(" / ");
  }
  function cellCard(id, open) {
    const info = cellInfo(id), c = cellCenter(id), col = CFG.colors[info.st];
    const rows = [
      [t("status"), `<span class="gnss-st" style="--gc:${col}">${esc(t(info.st))}</span>`],
      [t("window"), esc(windowText())],
      [t("sampled"), String(info.n)]
    ];
    if (RANK[info.st] >= 2) {
      rows.push([t("affected"), `${info.bad} ${info.items.length ? "· <span class=\"mono\">" + info.items.slice(0, 6).map(o => esc(o.fl)).join(", ") + "</span>" : ""}`]);
      rows.push([t("conf"), esc(info.low ? t("confLow") : t("confHigh"))]);
    }
    rows.push([t("cell"), `<span class="mono">${c[0].toFixed(2)}, ${c[1].toFixed(2)} (±${Math.round(CFG.cellDeg * 111 / 2)} ${lang() === "he" ? "ק\"מ" : "km"})</span>`]);
    rows.push([t("source"), `${sourceHtml()} · ${esc(t("provider"))}`]);
    const note = info.st === "nodata" ? `<p>${esc(t("nodataText"))}</p>` : info.st === "ok" ? `<p>${esc(t("okText"))}</p>` : "";
    const raw = info.items.length ? `<details class="raw" open><summary>${esc(t("quote"))}</summary><pre dir="ltr">${info.items.slice(0, 12).map(o => esc(`${hhmm(o.t)}  [${o.st}]  ${o.raw}`)).join("\n")}</pre></details>` : "";
    return `<details class="zcard" ${open ? "open" : ""} style="--zc:${col}">
      <summary><i class="sw oct"></i><span>GNSS · ${esc(t(info.st))}</span></summary>
      ${estBox(note)}
      <dl>${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${r[1]}</dd>`).join("")}</dl>
      ${raw}
    </details>`;
  }
  function openCell(id) {
    S.openCell = id;
    app.openSheet(`<h2>${esc(t("title"))}</h2>${statusLine()}${cellCard(id, true)}
      <button class="btn" data-act="gnssPanel">${esc(t("legend"))} · ${esc(t("how"))}</button>`, "gnss");
    if (window.Track) Track("gnss-cell", { st: cellInfo(id).st });
  }
  function openPanel() {
    S.openCell = null;
    const bad = badCells();
    const list = bad.length ? `<ul class="near gnss-list">${bad.map(id => {
      const i = S.cells[id], c = cellCenter(id);
      return `<li><button class="linkish" data-act="gnssCell" data-id="${id}"><i class="sw oct" style="--zc:${CFG.colors[i.st]}"></i>${esc(t(i.st))}${i.low ? " ?" : ""}</button> · <span class="mono">${c[0].toFixed(2)}, ${c[1].toFixed(2)}</span> · ${i.bad}/${i.n}</li>`;
    }).join("")}</ul>` : `<p class="muted">${esc(S.lastOk ? t("none") : t("never"))}</p>`;
    app.openSheet(`<h2>${esc(t("title"))}</h2>
      <label class="lrow"><input type="checkbox" data-gnss="1" ${S.on ? "checked" : ""}><span>${esc(t("showLayer"))}</span></label>
      ${statusLine()}
      <p class="muted" style="font-size:12.5px">${esc(t("window"))}: ${esc(windowText())}</p>
      <h3>${esc(t("list"))} <small>(${bad.length})</small></h3>${list}
      <h3>${esc(t("legend"))}</h3>${legendHtml()}
      ${estBox()}
      <details class="rules"><summary>${esc(t("how"))}</summary><ul>${t("howItems").map(s => `<li>${esc(s.replace("{nac}", CFG.nacDegraded).replace("{nic}", CFG.nicDegraded).replace("{alt}", CFG.spoofAltDiffFt.toLocaleString()))}</li>`).join("")}</ul>
        <p class="muted">${esc(t("source"))}: ${CFG.providers.map(p => `<a href="${esc(p.site)}" target="_blank" rel="noopener">${esc(p.name)}</a>`).join(" · ")}</p></details>
      <button class="btn" data-act="gnssRefresh">↻ ${esc(t("refresh"))}</button>`, "gnss");
  }
  function reopen() { if (S.openCell) openCell(S.openCell); else openPanel(); }

  /* ---------- hooks used by app.js ---------- */
  function layersHtml() {
    if (!CFG) return "";
    return `<h3>${esc(t("title"))}</h3>
      <label class="lrow"><input type="checkbox" data-gnss="1" ${S.on ? "checked" : ""}><i class="sw oct" style="--zc:${CFG.colors.jam}"></i><span>${esc(t("layer"))}</span><small>${badCells().length}</small></label>
      <button class="linkish" data-act="gnssPanel" style="font-size:13px">${esc(t("legend"))} · ${esc(t("how"))}</button>`;
  }
  function pointHtml(lat, lon) {
    if (!CFG || !S.on) return "";
    const id = cellOf(lat, lon); if (!id) return "";
    return `<h3>${esc(t("here"))}</h3>${cellCard(id, RANK[cellInfo(id).st] >= 2)}`;
  }
  function setOn(v) {
    S.on = !!v; app.store.set("gnssOn", S.on);
    if (window.Track) Track("layer-toggle", { layer: "gnss", on: S.on });
    if (S.on) { schedule(); tick(true); } else { clearInterval(timer); timer = null; draw(); pill(); }
  }
  function schedule() { clearInterval(timer); timer = setInterval(() => tick(false), CFG.pollSec * 1000); }
  function onClick(act, b) {
    if (act === "gnssPanel") openPanel();
    if (act === "gnssRefresh") tick(true);
    if (act === "gnssCell") { const id = b.dataset.id, c = cellCenter(id); map.setView(c, Math.max(map.getZoom(), 10)); openCell(id); }
  }

  function init(a) {
    if (!CFG) return;
    app = a; map = a.map;
    map.createPane("p_gnss").style.zIndex = CFG.paneZ || 312;          // normal / no-data cells: under the zones
    map.createPane("p_gnssTop").style.zIndex = CFG.paneTopZ || 372;    // affected cells: above the zones
    group = L.layerGroup().addTo(map);
    S.on = app.store.get("gnssOn", CFG.on !== false);
    summarize(); draw(); pill();
    const el = document.getElementById("gnssPill"); if (el) el.onclick = openPanel;
    map.on("zoomend", draw);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && S.on && (!S.lastTry || Date.now() - S.lastTry > CFG.pollSec * 1000)) tick(true); });
    if (S.on) { schedule(); tick(true); }
  }
  function onLang() { draw(); pill(); }

  return { init, layersHtml, pointHtml, setOn, onClick, openPanel, reopen, onLang,
           _test: { classify, ingest, summarize, cellOf, cellCenter, octagon, allCells, S, obs } };
})();
