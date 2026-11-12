/* =========================================================
 * מכשולים, שטח בנוי וריכוזי קהל (1.8) – מתוך OpenStreetMap.
 * Obstacles, built-up areas and crowd places, from OpenStreetMap (ODbL).
 *
 * הנתונים נבנים מראש (tools/osm_build.py ב-GitHub Actions) לרשת תאים של 0.25°, כך שהטלפון
 * מוריד רק את התאים שמוצגים. אין קריאה חיה ל-OSM מהדפדפן.
 *
 * Osm.init(map, { lang, on })   · Osm.set(kind, on)   kind: "obs" | "built" | "crowd"
 * Osm.at(lat, lon)              -> Promise<{ ok, lines, pts, built, builtNearM, crowd }>
 * Osm.obstaclesHtml / peopleHtml -> HTML for the point panel
 *
 * מגבלה חשובה: OSM ממופה בידי מתנדבים. קו מתח, עגורן או אנטנה שלא מופו – לא יופיעו.
 * ========================================================= */
(function () {
  "use strict";
  const CFG = Object.assign({
    base: "data/osm/",
    cellDeg: 0.25,
    minZoom: { lines: 11, built: 10, pts: 12, tall: 14, crowd: 14 },
    maxCells: 16,              // לא טוענים יותר מזה בתצוגה אחת
    nearObstacleM: 300,        // רדיוס "מכשולים בסביבה" בחלון הנקודה
    nearCrowdM: 300,
    nearBuiltM: 150,
    colors: { line: "#7a4a12", pt: "#7a4a12", built: "#6b7280", crowd: "#00695c" }
  }, (window.APP_CONFIG && window.APP_CONFIG.osm) || {});

  const TXT = {
    he: {
      obsTitle: "מכשולים בטווח {r} מ'", pplTitle: "שטח בנוי וריכוזי קהל",
      loading: "בודק…", noData: "אין נתוני OpenStreetMap לאזור הזה.", loadErr: "הנתונים לא נטענו. בדקו את החיבור.",
      none: "לא נמצאו מכשולים ממופים בטווח {r} מ'.",
      caveat: "מבוסס OpenStreetMap: מכשולים שלא מופו (קווי חשמל מקומיים, עגורנים, עצים, כבלים) לא יופיעו. המרחק נמדד מהנקודה שנבחרה.",
      l: "קו מתח עליון", m: "קו חשמל (מתח נמוך / בינוני)", c: "רכבל / כבל עילי",
      mast: "אנטנה / תורן", tower: "מגדל", chim: "ארובה", crane: "עגורן", wind: "טורבינת רוח", bldg: "מבנה גבוה", nLines: "{n} קווים, הקרוב:",
      kv: "ק\"ו", h: "גובה {h} מ'", hEst: "כ-{h} מ' (הערכה לפי מספר קומות)", hUnknown: "גובה לא ידוע", mAway: "{d} מ'",
      crossing: "מעל הנקודה / צמוד",
      inBuilt: "הנקודה בתוך שטח בנוי", r: "מגורים", cK: "מסחר", i: "תעשייה",
      nearBuilt: "שטח בנוי במרחק כ-{d} מ'", notBuilt: "הנקודה מחוץ לשטח בנוי ממופה.",
      builtRule: "תנאי ב'-09 לטיסה בקשר עין ללא סגירה אווירית: לא מעל אזור מאוכלס, אלא באישור.",
      crowdNear: "ריכוזי קהל בטווח {r} מ'", crowdNone: "לא נמצאו ריכוזי קהל ממופים בטווח {r} מ'.",
      school: "בית ספר", univ: "מכללה / אוניברסיטה", hosp: "בית חולים", mall: "קניון", market: "שוק",
      stadium: "אצטדיון", park: "פארק שעשועים / גן חיות", beach: "חוף", station: "תחנת רכבת / אוטובוס",
      pplCaveat: "שטח בנוי = שימושי קרקע של מגורים, מסחר ותעשייה ב-OpenStreetMap. זו אינה ההגדרה המשפטית של \"אזור מאוכלס\".",
      updated: "נתוני OSM מ-", zoomHint: "מקירוב {z}"
    },
    en: {
      obsTitle: "Obstacles within {r} m", pplTitle: "Built-up area and crowd places",
      loading: "Checking…", noData: "No OpenStreetMap data for this area.", loadErr: "Data did not load. Check your connection.",
      none: "No mapped obstacles within {r} m.",
      caveat: "Based on OpenStreetMap: unmapped obstacles (local power lines, cranes, trees, cables) will not appear. Distance is from the selected point.",
      l: "High-voltage power line", m: "Power line (low / medium voltage)", c: "Cable car / aerial cable",
      mast: "Antenna / mast", tower: "Tower", chim: "Chimney", crane: "Crane", wind: "Wind turbine", bldg: "Tall structure", nLines: "{n} lines, nearest:",
      kv: "kV", h: "height {h} m", hEst: "about {h} m (estimated from floors)", hUnknown: "height unknown", mAway: "{d} m",
      crossing: "overhead / adjacent",
      inBuilt: "The point is inside a built-up area", r: "residential", cK: "commercial", i: "industrial",
      nearBuilt: "Built-up area about {d} m away", notBuilt: "The point is outside mapped built-up areas.",
      builtRule: "AIP B-09 VLOS condition without an airspace closure: not over populated areas unless approved.",
      crowdNear: "Crowd places within {r} m", crowdNone: "No mapped crowd places within {r} m.",
      school: "School", univ: "College / university", hosp: "Hospital", mall: "Mall", market: "Market",
      stadium: "Stadium", park: "Theme park / zoo", beach: "Beach", station: "Train / bus station",
      pplCaveat: "Built-up = residential, commercial and industrial land use in OpenStreetMap. It is not the legal definition of a \"populated area\".",
      updated: "OSM data from ", zoomHint: "zoom {z}+"
    }
  };
  const t = (lang, k) => (TXT[lang] || TXT.he)[k] ?? TXT.he[k] ?? k;

  let map = null, renderer = null, index = null, indexP = null;
  const on = { obs: true, built: true, crowd: true };
  const cells = new Map();    // "obs:128_139" -> { p: Promise, data, layers: {lines,pts,built,crowd} }
  const groups = {};          // kind -> L.layerGroup on the map

  const key = (lat, lon) => Math.floor(lat / CFG.cellDeg) + "_" + Math.floor(lon / CFG.cellDeg);

  function loadIndex() {
    if (!indexP) indexP = fetch(CFG.base + "index.json", { cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error("osm index " + r.status); return r.json(); })
      .then(j => (index = j))
      .catch(e => { indexP = null; throw e; });
    return indexP;
  }
  /** file: "obs" | "pop". Resolves to the cell's data, or null when the cell has none. */
  function loadCell(file, k) {
    const id = file + ":" + k;
    let c = cells.get(id);
    if (c) return c.p;
    c = { data: null, layers: {} };
    c.p = loadIndex().then(ix => {
      const e = ix.cells[k];
      if (!e || !e[file === "obs" ? "o" : "p"]) return null;
      return fetch(`${CFG.base}${file}/${k}.json?g=${encodeURIComponent(ix.generated || "")}`)
        .then(r => { if (!r.ok) throw new Error(file + " " + k + " " + r.status); return r.json(); })
        .then(d => (c.data = d));
    });
    c.p.catch(() => cells.delete(id));
    cells.set(id, c);
    return c.p;
  }

  /* ---------- drawing ---------- */
  const pairs = g => { const out = []; for (let i = 0; i < g.length; i += 2) out.push([g[i + 1], g[i]]); return out; };
  function buildLayers(file, k) {
    const c = cells.get(file + ":" + k); if (!c || !c.data || c.built) return c;
    c.built = true;
    const col = CFG.colors, base = { renderer, interactive: false, pane: "p_osm" };
    if (file === "obs") {
      c.layers.lines = L.layerGroup((c.data.lines || []).map(l => L.polyline(pairs(l.g), Object.assign({}, base, {
        color: col.line, weight: l.k === "l" ? 2.4 : 1.3, opacity: l.k === "l" ? 0.95 : 0.8,
        dashArray: l.k === "m" ? "5 4" : l.k === "c" ? "2 5" : null
      }))));
      const dot = p => L.circleMarker([p.c[1], p.c[0]], Object.assign({}, base, {
        radius: p.k === "wind" ? 5 : p.k === "bldg" ? 3.2 : 4, color: "#fff", weight: 1.2, fillColor: col.pt, fillOpacity: 1
      }));
      c.layers.pts = L.layerGroup((c.data.pts || []).filter(p => p.k !== "bldg").map(dot));    // masts, towers, chimneys, cranes, turbines
      c.layers.tall = L.layerGroup((c.data.pts || []).filter(p => p.k === "bldg").map(dot));   // tall buildings – only when zoomed in
    } else {
      c.layers.built = L.layerGroup((c.data.built || []).map(b => L.polygon(pairs(b.g), Object.assign({}, base, {
        stroke: false, fillColor: col.built, fillOpacity: 0.22
      }))));
      c.layers.crowd = L.layerGroup((c.data.crowd || []).map(p => L.circleMarker([p.c[1], p.c[0]], Object.assign({}, base, {
        radius: 4, color: "#fff", weight: 1.2, fillColor: col.crowd, fillOpacity: 1
      }))));
    }
    return c;
  }
  const SUB = { lines: ["obs", "obs"], pts: ["obs", "obs"], tall: ["obs", "obs"], built: ["pop", "built"], crowd: ["pop", "crowd"] };  // sub -> [file, toggle]

  let seq = 0;
  function refresh() {
    if (!map) return;
    const z = map.getZoom(), my = ++seq;
    const want = {};
    Object.keys(SUB).forEach(s => { want[s] = on[SUB[s][1]] && z >= CFG.minZoom[s]; });
    if (!Object.values(want).some(Boolean)) { Object.values(groups).forEach(g => g.clearLayers()); return; }
    const b = map.getBounds(), ks = [];
    for (let la = Math.floor(b.getSouth() / CFG.cellDeg); la <= Math.floor(b.getNorth() / CFG.cellDeg); la++)
      for (let lo = Math.floor(b.getWest() / CFG.cellDeg); lo <= Math.floor(b.getEast() / CFG.cellDeg); lo++) ks.push(la + "_" + lo);
    if (ks.length > CFG.maxCells) { Object.values(groups).forEach(g => g.clearLayers()); return; }
    const files = new Set(Object.keys(SUB).filter(s => want[s]).map(s => SUB[s][0]));
    const jobs = [];
    files.forEach(f => ks.forEach(k => jobs.push(loadCell(f, k).then(() => buildLayers(f, k)).catch(() => null))));
    Promise.all(jobs).then(() => {
      if (my !== seq) return;
      Object.keys(SUB).forEach(s => {
        const g = groups[s]; g.clearLayers();
        if (!want[s]) return;
        ks.forEach(k => { const c = cells.get(SUB[s][0] + ":" + k); if (c && c.layers[s]) g.addLayer(c.layers[s]); });
      });
    });
  }

  function init(m, opts) {
    map = m;
    Object.assign(on, (opts && opts.on) || {});
    const pane = map.createPane("p_osm");
    pane.style.zIndex = (opts && opts.z) || 301;   // above the base map (300), below the AIP annex overlay and all zones pane.style.pointerEvents = "none";
    renderer = L.canvas({ pane: "p_osm", padding: 0.2 });
    ["built", "lines", "crowd", "tall", "pts"].forEach(s => { groups[s] = L.layerGroup().addTo(map); });
    let h = null;
    map.on("moveend zoomend", () => { clearTimeout(h); h = setTimeout(refresh, 120); });
    refresh();
  }
  function set(kind, v) { on[kind] = !!v; refresh(); }

  /* ---------- point query ---------- */
  function segDistM(lat, lon, g, closed) {   // min distance (m) from a point to a flat [lon,lat,...] polyline
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
    let best = Infinity;
    for (let i = 0; i + 3 < g.length; i += 2) {
      const ax = (g[i] - lon) * kx, ay = (g[i + 1] - lat) * ky, bx = (g[i + 2] - lon) * kx, by = (g[i + 3] - lat) * ky;
      const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy;
      const u = d2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / d2)) : 0;
      const d = Math.hypot(ax + u * dx, ay + u * dy);
      if (d < best) best = d;
    }
    return best;
  }
  function inFlatRing(lat, lon, g) {
    let inside = false;
    for (let i = 0, j = g.length - 2; i < g.length; j = i, i += 2) {
      const xi = g[i], yi = g[i + 1], xj = g[j], yj = g[j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const distM = (lat, lon, c) => Math.hypot((c[0] - lon) * 111320 * Math.cos(lat * Math.PI / 180), (c[1] - lat) * 110540);

  async function at(lat, lon) {
    const R = Math.max(CFG.nearObstacleM, CFG.nearCrowdM, CFG.nearBuiltM) + 50;
    const dLat = R / 110540, dLon = R / (111320 * Math.cos(lat * Math.PI / 180));
    const ks = [...new Set([[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]].map(([a, b]) => key(lat + a * dLat, lon + b * dLon)))];
    const ix = await loadIndex();
    if (!ks.some(k => ix.cells[k])) return { ok: false };
    const obs = (await Promise.all(ks.map(k => loadCell("obs", k)))).filter(Boolean);
    const pop = (await Promise.all(ks.map(k => loadCell("pop", k)))).filter(Boolean);

    const lines = new Map();
    obs.forEach(d => (d.lines || []).forEach(l => {
      const dm = segDistM(lat, lon, l.g);
      if (dm > CFG.nearObstacleM) return;
      const prev = lines.get(l.i);
      if (!prev || dm < prev.d) lines.set(l.i, { k: l.k, v: l.v, d: dm });
    }));
    const pts = new Map();
    obs.forEach(d => (d.pts || []).forEach(p => {
      const dm = distM(lat, lon, p.c);
      if (dm <= CFG.nearObstacleM) pts.set(p.i, Object.assign({ d: dm }, p));
    }));
    let built = null, builtNearM = Infinity;
    const seen = new Set();
    pop.forEach(d => (d.built || []).forEach(b => {
      if (built || seen.has(b.i)) return;
      seen.add(b.i);
      if (inFlatRing(lat, lon, b.g)) { built = { k: b.k }; return; }
      const dm = segDistM(lat, lon, b.g);
      if (dm < builtNearM) builtNearM = dm;
    }));
    const crowd = new Map();
    pop.forEach(d => (d.crowd || []).forEach(p => {
      const dm = distM(lat, lon, p.c);
      if (dm <= CFG.nearCrowdM) crowd.set(p.i, Object.assign({ d: dm }, p));
    }));
    const byD = (a, b) => a.d - b.d;
    return {
      ok: true, generated: ix.generated,
      lines: [...lines.values()].sort(byD), pts: [...pts.values()].sort(byD),
      built, builtNearM: built ? 0 : builtNearM, crowd: [...crowd.values()].sort(byD)
    };
  }

  /* ---------- HTML ---------- */
  const r10 = d => Math.max(10, Math.round(d / 10) * 10);
  const nameOf = (p, lang) => (lang === "en" && p.ne) || p.n || p.ne || "";
  function away(d, lang) { return d < 15 ? t(lang, "crossing") : t(lang, "mAway").replace("{d}", r10(d)); }
  function stamp(res, o) {
    if (!res.generated) return "";
    const d = new Date(res.generated);
    return isNaN(d) ? "" : ` ${o.esc(t(o.lang, "updated"))}${d.toLocaleDateString(o.lang === "he" ? "he-IL" : "en-GB")}.`;
  }

  function obstaclesHtml(res, o) {
    const L = o.lang, R = CFG.nearObstacleM;
    const title = `<h3>${o.esc(t(L, "obsTitle").replace("{r}", R))}</h3>`;
    if (!res) return title + `<p class="muted">${o.esc(t(L, "loading"))}</p>`;
    if (res.error) return title + `<p class="muted">${o.esc(t(L, "loadErr"))}</p>`;
    if (!res.ok) return title + `<p class="muted">${o.esc(t(L, "noData"))}</p>`;
    const rows = [];
    const lineGroups = new Map();          // parallel circuits of the same kind and voltage are one row
    res.lines.forEach(l => {
      const g = lineGroups.get(l.k + l.v);
      if (g) g.n++; else lineGroups.set(l.k + l.v, { k: l.k, v: l.v, d: l.d, n: 1 });   // res.lines is sorted, so the first is the nearest
    });
    [...lineGroups.values()].slice(0, 6).forEach(l => rows.push({
      d: l.d, cls: "ln-" + l.k,
      html: `<b>${o.esc(t(L, l.k))}</b>${l.v ? ` · ${l.v} ${o.esc(t(L, "kv"))}` : ""}${l.n > 1 ? ` · ${o.esc(t(L, "nLines").replace("{n}", l.n))}` : ""}`
    }));
    res.pts.slice(0, 8).forEach(p => {
      const h = p.h ? t(L, p.e ? "hEst" : "h").replace("{h}", p.h) : t(L, "hUnknown");
      const n = nameOf(p, L);
      rows.push({ d: p.d, cls: "pt", html: `<b>${o.esc(t(L, p.k))}</b>${n ? " " + o.esc(n) : ""} · ${o.esc(h)}` });
    });
    rows.sort((a, b) => a.d - b.d);
    const list = rows.length
      ? `<ul class="obs">${rows.map(r => `<li class="${r.cls}${r.d < 60 ? " close" : ""}"><i></i><span>${r.html}</span><em>${o.esc(away(r.d, L))}</em></li>`).join("")}</ul>`
      : `<p class="obs-none">✓ ${o.esc(t(L, "none").replace("{r}", R))}</p>`;
    return title + list + `<p class="fine">${o.esc(t(L, "caveat"))}${stamp(res, o)}</p>`;
  }

  function peopleHtml(res, o) {
    const L = o.lang, R = CFG.nearCrowdM;
    const title = `<h3>${o.esc(t(L, "pplTitle"))}</h3>`;
    if (!res) return title + `<p class="muted">${o.esc(t(L, "loading"))}</p>`;
    if (res.error) return title + `<p class="muted">${o.esc(t(L, "loadErr"))}</p>`;
    if (!res.ok) return title + `<p class="muted">${o.esc(t(L, "noData"))}</p>`;
    let html = title;
    if (res.built) {
      const kind = t(L, res.built.k === "c" ? "cK" : res.built.k);
      html += `<div class="ppl ppl-in"><b>⚠ ${o.esc(t(L, "inBuilt"))} (${o.esc(kind)})</b><p>${o.esc(t(L, "builtRule"))}</p></div>`;
    } else if (res.builtNearM <= CFG.nearBuiltM) {
      html += `<div class="ppl ppl-near"><b>${o.esc(t(L, "nearBuilt").replace("{d}", r10(res.builtNearM)))}</b><p>${o.esc(t(L, "builtRule"))}</p></div>`;
    } else {
      html += `<p class="obs-none">✓ ${o.esc(t(L, "notBuilt"))}</p>`;
    }
    if (res.crowd.length) {
      html += `<div class="crowd-h">${o.esc(t(L, "crowdNear").replace("{r}", R))}</div><ul class="obs">` + res.crowd.slice(0, 8).map(p => {
        const n = nameOf(p, L);
        return `<li class="cr"><i></i><span><b>${o.esc(t(L, p.k))}</b>${n ? " " + o.esc(n) : ""}</span><em>${o.esc(t(L, "mAway").replace("{d}", r10(p.d)))}</em></li>`;
      }).join("") + "</ul>";
    } else {
      html += `<p class="muted crowd-none">${o.esc(t(L, "crowdNone").replace("{r}", R))}</p>`;
    }
    return html + `<p class="fine">${o.esc(t(L, "pplCaveat"))}${stamp(res, o)}</p>`;
  }

  window.Osm = { init, set, at, refresh, obstaclesHtml, peopleHtml, t, cfg: CFG };
})();
