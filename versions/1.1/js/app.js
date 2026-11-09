/* =========================================================
 * מפת מרחב אווירי לכטב"ם – לוגיקת האפליקציה
 * מבנה: state → load data → render layers → UI sheets
 * ========================================================= */
(function () {
  "use strict";
  const CFG = window.APP_CONFIG;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- local storage (optional) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("uasmap." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("uasmap." + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ---------- state ---------- */
  const defaultsLayers = Object.fromEntries(Object.entries(CFG.layers).map(([k, v]) => [k, v.on]));
  const state = {
    lang: store.get("lang", "he"),
    layersOn: Object.assign({}, defaultsLayers, store.get("layers", {})),
    altM: store.get("altM", 120),           // null = all altitudes; default: typical small-UAS ceiling
    when: null,                              // null = now
    showInactive: store.get("showInactive", false),
    lastSeen: store.get("lastSeen", null),
    watch: store.get("watch", []),
    meta: null, features: [], unlocated: [], basemap: null,
    overlays: [], ovlState: store.get("ovl", {}), ovlLayers: {},
    newIds: new Set(),
    checkMarker: null
  };
  const T = k => (I18N[state.lang] && I18N[state.lang][k]) ?? I18N.he[k] ?? k;
  const L_ = o => o == null ? "" : (typeof o === "string" ? o : (o[state.lang] ?? o.he ?? o.en ?? ""));

  /* ---------- formatting ---------- */
  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleString(state.lang === "he" ? "he-IL" : "en-GB", {
      timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  }
  function fmtLimit(l) {
    if (!l) return "—";
    if (l.ref === "SFC" || l.ref === "GND") return T("sfc");
    if (l.ref === "UNL") return T("unl");
    if (l.ref === "FL" || l.u === "FL") return "FL" + String(l.v).padStart(3, "0");
    const unit = l.u === "m" ? (state.lang === "he" ? "מ'" : "m") : "ft";
    return `${Number(l.v).toLocaleString()} ${unit} ${l.ref || ""}`.trim();
  }
  function fmtCoord(lat, lon) { return `${lat.toFixed(5)}, ${lon.toFixed(5)}`; }

  /* ---------- filtering ---------- */
  function nowT() { return state.when ? new Date(state.when) : new Date(); }
  function layerKey(f) {
    const p = f.properties;
    if (p.layer === "notam" && p.confidence === "approx") return "notamApprox";
    return p.layer;
  }
  function timeStatus(f) {
    const p = f.properties, v = p.valid || {};
    if (p.status === "inactive") return "inactive";
    const t = nowT();
    if (v.to && new Date(v.to) < t) return "inactive";
    if (v.from && new Date(v.from) > t) return "scheduled";
    return "active";
  }
  function altitudeRelevant(f) {
    if (state.altM == null) return true;
    const p = f.properties;
    if (!p.lower) return true;
    const altFt = state.altM * 3.28084;
    const lowFt = Geo.limitFt(p.lower);
    if (lowFt == null) return true;
    if (p.lower.ref === "AMSL" || p.lower.ref === "FL" || p.lower.u === "FL") {
      // בלי מודל טופוגרפיה – מסתירים רק אם הגבול התחתון גבוה בהרבה מכל קרקע בישראל (כולל החרמון)
      return lowFt <= altFt + 7400;
    }
    return lowFt <= altFt;
  }
  function isShown(f) {
    const k = layerKey(f);
    if (!state.layersOn[k]) return false;
    const st = timeStatus(f);
    if (!state.showInactive && st === "inactive") return false;
    // תאריך עתידי שנבחר במכוון – מציגים את מה שפעיל באותו זמן
    if (state.when && st === "scheduled" && !state.showInactive) return false;
    return altitudeRelevant(f);
  }

  /* ---------- map ---------- */
  const map = L.map("map", {
    zoomControl: false, attributionControl: true, minZoom: CFG.map.minZoom, maxZoom: CFG.map.maxZoom,
    maxBounds: L.latLngBounds(CFG.map.bounds).pad(0.3), preferCanvas: false, tap: true
  }).setView(CFG.map.center, CFG.map.zoom);
  const zoomCtl = L.control.zoom({ position: "topleft" }).addTo(map);
  map.attributionControl.setPrefix(false);

  // תמיד נסה אריחי OSM; בסביבה שחוסמת תמונות חיצוניות נשארת מפת הבסיס הווקטורית
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: "© OpenStreetMap", opacity: 0.85
  });
  let tilesOk = false;
  tiles.on("tileload", () => { if (!tilesOk) { tilesOk = true; document.body.classList.add("has-tiles"); } });
  tiles.addTo(map);

  const panes = {};
  ["basemap", "annex", "labels"].concat(CFG.drawOrder).forEach((name, i) => {
    panes[name] = map.createPane("p_" + name);
    panes[name].style.zIndex = 300 + i * 5;
  });
  panes.labels.style.zIndex = 640; panes.labels.style.pointerEvents = "none";
  panes.annex.style.zIndex = 302; panes.annex.style.pointerEvents = "none";

  let baseLayer = null, cityLayer = null;
  function drawBasemap() {
    if (!state.basemap) return;
    if (baseLayer) baseLayer.remove();
    baseLayer = L.geoJSON(state.basemap.countries, {
      pane: "p_basemap", interactive: false,
      style: f => {
        const id = f.properties.id;
        return { stroke: true, color: "#9aa4ad", weight: id === "ISR" || id === "PSE" ? 1.2 : 0.8,
          dashArray: id === "PSE" ? "4 3" : null,
          fillColor: id === "ISR" ? "#fbfaf5" : id === "PSE" ? "#f6f3ea" : "#ebe7dc", fillOpacity: 1 };
      }
    }).addTo(map);
    drawCities();
  }
  function drawCities() {
    if (cityLayer) cityLayer.remove();
    const z = map.getZoom();
    const minPop = z <= 7 ? 250000 : z <= 8 ? 60000 : z <= 9 ? 15000 : z <= 10 ? 3000 : z <= 11 ? 400 : -1;
    cityLayer = L.layerGroup([], { pane: "p_labels" });
    const placed = [];
    state.basemap.cities.filter(c => c.p >= minPop).sort((a, b) => b.p - a.p).forEach(c => {
      const pt = map.project([c.c[1], c.c[0]], z);
      const name = state.lang === "he" ? c.he : c.en;
      const tier = c.p >= 100000 ? "c1" : c.p >= 20000 ? "c2" : c.p >= 2000 ? "c3" : "c4";
      const w = name.length * (tier === "c1" ? 8 : 6.5) + 10;
      if (placed.some(q => Math.abs(q.y - pt.y) < 15 && pt.x < q.x + q.w && pt.x + w > q.x)) return;
      placed.push({ x: pt.x, y: pt.y, w });
      L.marker([c.c[1], c.c[0]], {
        pane: "p_labels", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "city " + tier, html: `<i></i><span>${esc(name)}</span>`, iconSize: [0, 0] })
      }).addTo(cityLayer);
    });
    cityLayer.addTo(map);
  }
  map.on("zoomend", () => { if (state.basemap) drawCities(); });

  /* ---------- zones ---------- */
  const zoneLayers = {}; // id -> leaflet layer
  let zoneGroup = L.layerGroup().addTo(map);

  function airfieldIcon(f) {
    const heli = f.properties.layer === "heliport";
    const svg = heli
      ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5"/><text x="12" y="16.5" text-anchor="middle">H</text></svg>`
      : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5"/><path d="M12 4.5l1.3 5 5.2 2.5v1.6l-5.2-1.2-.4 4.2 1.8 1.4v1.3L12 18.6l-2.7.7V18l1.8-1.4-.4-4.2-5.2 1.2V12l5.2-2.5z"/></svg>`;
    return L.divIcon({ className: "af-icon" + (heli ? " heli" : "") + (state.newIds.has(f.properties.id) ? " is-new" : ""), html: svg, iconSize: [26, 26], iconAnchor: [13, 13] });
  }

  function drawZones() {
    zoneGroup.clearLayers();
    for (const k in zoneLayers) delete zoneLayers[k];
    const sorted = state.features.slice().sort((a, b) => CFG.drawOrder.indexOf(layerKey(a)) - CFG.drawOrder.indexOf(layerKey(b)));
    let counts = {};
    sorted.forEach(f => {
      const key = layerKey(f), lc = CFG.layers[key];
      if (!lc) return;
      if (!isShown(f)) return;
      counts[key] = (counts[key] || 0) + 1;
      const p = f.properties, isNew = state.newIds.has(p.id);
      const st = timeStatus(f);
      const style = {
        pane: "p_" + key, color: lc.color, weight: key === "notamApprox" ? 2.5 : 2, dashArray: lc.dash,
        fillColor: lc.color, fillOpacity: st === "active" ? lc.fill : lc.fill * 0.4,
        opacity: st === "active" ? 0.95 : 0.5,
        className: "zone z-" + key + (isNew ? " is-new" : "")
      };
      let layer;
      const g = f.geometry;
      if (g.type === "Point") {
        const ll = [g.coordinates[1], g.coordinates[0]];
        if (key === "airfield" || key === "heliport") {
          const grp = [];
          if (p.radius_m) grp.push(L.circle(ll, Object.assign({}, style, { radius: p.radius_m, fillOpacity: 0.05, weight: 1.2, dashArray: "4 4" })));
          grp.push(L.marker(ll, { pane: "p_" + key, icon: airfieldIcon(f), title: L_(p.name) }));
          layer = L.featureGroup(grp);
        } else {
          layer = L.circle(ll, Object.assign({}, style, { radius: p.radius_m || 500 }));
        }
      } else {
        layer = L.geoJSON(f, { pane: "p_" + key, style: () => style });
      }
      layer.on("click", e => { L.DomEvent.stop(e); openPoint(e.latlng.lat, e.latlng.lng, p.id); });
      if (layer.bindTooltip && !L.Browser.mobile) layer.bindTooltip(esc(L_(p.name)), { sticky: true, direction: "top", className: "ztip" });
      layer.addTo(zoneGroup);
      zoneLayers[p.id] = layer;
    });
    state.counts = counts;
    updateFilterDot();
  }

  /* ---------- point check ---------- */
  function zonesAt(lat, lon) {
    return state.features.filter(f => {
      const k = layerKey(f);
      if (k === "airfield" || k === "heliport") return f.properties.radius_m && Geo.contains(f, lat, lon) && isShown(f);
      return Geo.contains(f, lat, lon) && isShown(f);
    });
  }
  function airfieldsNear(lat, lon) {
    return state.features
      .filter(f => (f.properties.layer === "airfield" || f.properties.layer === "heliport") && f.geometry.type === "Point")
      .map(f => ({ f, d: Geo.distanceM(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
      .filter(x => x.d <= CFG.nearbyAirfieldKm * 1000)
      .sort((a, b) => a.d - b.d);
  }

  function openPoint(lat, lon, focusId) {
    state.lastPoint = [lat, lon, focusId];
    if (state.checkMarker) state.checkMarker.remove();
    state.checkMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: "pin", html: "<i></i>", iconSize: [22, 22], iconAnchor: [11, 22] }), zIndexOffset: 1000
    }).addTo(map);
    const here = zonesAt(lat, lon);
    const near = airfieldsNear(lat, lon);
    const sev = Math.max(0, ...here.map(f => {
      const s = CFG.layers[layerKey(f)].severity;
      return timeStatus(f) === "active" ? s : Math.min(s, 2);
    }), near.length ? 2 : 0);
    const v = sev >= 3 ? ["no", T("verdictNo")] : sev === 2 ? ["caution", T("verdictCaution")] : ["ok", T("verdictInfo")];
    here.sort((a, b) => (b.properties.id === focusId) - (a.properties.id === focusId) || CFG.layers[layerKey(b)].severity - CFG.layers[layerKey(a)].severity);

    const watched = state.watch.some(w => Math.abs(w.lat - lat) < 1e-4 && Math.abs(w.lon - lon) < 1e-4);
    let html = `
      <div class="verdict v-${v[0]}">
        <div class="v-title">${esc(v[1])}</div>
        <div class="v-sub">${esc(T("verdictInfoSub"))}</div>
      </div>
      <div class="pt-row">
        <span class="mono">${fmtCoord(lat, lon)}</span>
        <button class="mini" data-act="copy" data-v="${fmtCoord(lat, lon)}">⧉</button>
        ${CFG.features.watchPoints ? `<button class="mini" data-act="${watched ? "unwatch" : "watch"}" data-lat="${lat}" data-lon="${lon}">${watched ? "★ " + esc(T("watched")) : "☆ " + esc(T("watch"))}</button>` : ""}
      </div>
      ${filterSummary()}
      <h3>${esc(T("zonesHere"))} <small>(${here.length})</small></h3>
      ${here.length ? here.map((f, i) => zoneCard(f, i === 0 || f.properties.id === focusId)).join("") : `<p class="muted">—</p>`}
    `;
    if (near.length) {
      html += `<h3>${esc(T("nearbyAirfields"))}</h3><ul class="near">` + near.map(x =>
        `<li><button class="linkish" data-act="focus" data-id="${esc(x.f.properties.id)}">${esc(L_(x.f.properties.name))}</button> · ${(x.d / 1000).toFixed(1)} ${esc(T("km"))}${contactInline(x.f.properties)}</li>`
      ).join("") + "</ul>";
    }
    html += generalNoticesHtml();
    html += vlosHtml();
    html += `<p class="disclaimer">${esc(T("disclaimer"))}</p>`;
    openSheet(html, "point");
  }

  function activeUnlocated(kind) {
    const t = nowT();
    return state.unlocated.filter(u => u.kind === kind && (!u.valid || !u.valid.to || new Date(u.valid.to) >= t) && (!u.valid || !u.valid.from || new Date(u.valid.from) <= t || state.showInactive));
  }
  function unlocatedItem(n) {
    return `<details class="raw"><summary><b class="mono">${esc(n.id)}</b> · ${esc(L_(n.summary))}</summary>
      <div class="muted">${esc(T("validity"))}: ${fmtTime(n.valid && n.valid.from) || "—"} – ${n.valid && n.valid.to ? fmtTime(n.valid.to) : esc(T("permanent"))}${n.valid && n.valid.schedule ? " · " + esc(L_(n.valid.schedule)) : ""}</div>
      <pre dir="ltr">${esc(n.raw)}</pre></details>`;
  }
  function generalNoticesHtml() {
    const g = activeUnlocated("general");
    if (!g.length) return "";
    return `<div class="notice"><b>⚠ ${esc(T("generalNotices"))}</b>${g.map(unlocatedItem).join("")}</div>`;
  }
  function vlosHtml() {
    return `<details class="rules"><summary>${esc(T("vlosTitle"))}</summary><ul>${T("vlosRules").map(r => `<li>${esc(r)}</li>`).join("")}</ul>
      <p class="muted">${state.lang === "he" ? "מקור: פמ\"ת ב'-09 ותקנות הטיס (הפעלת מערכת כטב\"ם קטן), התשפ\"ד-2024. יש לבדוק את הנוסח המלא." : "Source: AIP B-09 and the small-UAS regulations (2024). Check the full text."}</p></details>`;
  }
  function filterSummary() {
    const parts = [];
    if (state.altM != null) parts.push(`${state.altM} ${T("metersAgl")}`);
    if (state.when) parts.push(fmtTime(state.when));
    return parts.length ? `<div class="fsum">${esc(T("filters"))}: ${esc(parts.join(" · "))}</div>` : "";
  }
  function contactInline(p) {
    const c = (p.contact || [])[0];
    return c ? ` · <span class="muted">${esc(c.value)}</span>` : "";
  }

  function zoneCard(f, open) {
    const p = f.properties, key = layerKey(f), lc = CFG.layers[key], st = timeStatus(f);
    const v = p.valid || {};
    const rows = [];
    rows.push([T("type"), `${esc(lc[state.lang] || lc.he)}${p.designator ? ` · <b class="mono">${esc(p.designator)}</b>` : ""}`]);
    rows.push([T("status"), `<span class="st st-${st}">${esc(T(st))}</span>`]);
    if (p.lower || p.upper) {
      let lim = `<bdi>${esc(fmtLimit(p.lower))}</bdi> ← <bdi>${esc(fmtLimit(p.upper))}</bdi>`.replace("←", state.lang === "he" ? "←" : "→");
      if (p.lower && (p.lower.ref === "AMSL")) lim += `<div class="note">${esc(T("amslNote"))}</div>`;
      rows.push([T("limits"), lim]);
    }
    if (!(key === "airfield" || key === "heliport")) rows.push([T("validity"), (v.from || v.to) ? `${esc(T("from"))} ${fmtTime(v.from) || "—"} ${esc(T("to"))} ${v.to ? fmtTime(v.to) : esc(T("permanent"))}` : esc(T("permanent"))]);
    if (v.schedule) rows.push([T("schedule"), esc(L_(v.schedule))]);
    if (p.elevation_ft != null) rows.push([state.lang === "he" ? "גובה השדה" : "Elevation", `${p.elevation_ft} ft`]);
    if (p.contact && p.contact.length) rows.push([T("contact"), p.contact.map(contactHtml).join("<br>")]);
    if (p.remarks && L_(p.remarks)) rows.push([T("remarks"), esc(L_(p.remarks))]);
    if (p.source) rows.push([T("source"), p.source.url ? `<a href="${esc(p.source.url)}" target="_blank" rel="noopener">${esc(L_(p.source.name))}</a>${p.source.ref ? " · " + esc(p.source.ref) : ""}` : esc(L_(p.source.name))]);

    let approx = "";
    if (p.confidence === "approx") approx = `<div class="approx"><b>⚠ ${esc(T("approxTitle"))}</b><p>${esc(T("approxText"))}</p>${p.approxReason ? `<p class="muted">${esc(L_(p.approxReason))}</p>` : ""}</div>`;
    let raw = "";
    if (p.interpreted) rows.push([T("source"), `<span class="badge">🤖 ${esc(T("interpreted"))}</span>`]);
    if (p.notam && p.notam.raw) raw = `<details class="raw" ${p.confidence === "approx" ? "open" : ""}><summary>${esc(T("notamQuote"))} ${esc(p.notam.id || "")}</summary><pre dir="ltr">${esc(p.notam.raw)}</pre></details>`;

    return `
      <details class="zcard" ${open ? "open" : ""} style="--zc:${lc.color}">
        <summary><i class="sw"></i><span>${esc(L_(p.name))}</span>${state.newIds.has(p.id) ? `<em class="newtag">${esc(T("newUpdate"))}</em>` : ""}</summary>
        ${approx}
        <dl>${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${r[1]}</dd>`).join("")}</dl>
        ${raw}
        <button class="mini" data-act="zoomto" data-id="${esc(p.id)}">⌖</button>
      </details>`;
  }
  function contactHtml(c) {
    const label = c.label ? esc(L_(c.label)) + ": " : "";
    const v = esc(c.value);
    if (c.type === "phone") return `${label}<a class="mono" dir="ltr" href="tel:${v.replace(/[^\d+]/g, "")}">${v}</a>`;
    if (c.type === "url") return `${label}<a href="${v}" target="_blank" rel="noopener">${v}</a>`;
    if (c.type === "email") return `${label}<span class="mono">${v}</span>`;
    return `${label}<span class="mono">${v}</span>`;
  }

  /* ---------- sheet ---------- */
  let sheetKind = null;
  function openSheet(html, kind) {
    sheetKind = kind;
    $("#sheetBody").innerHTML = html;
    $("#sheet").hidden = false;
    $("#sheet").scrollTop = 0;
    document.body.classList.add("sheet-open");
  }
  function closeSheet() {
    $("#sheet").hidden = true; sheetKind = null;
    document.body.classList.remove("sheet-open");
    if (state.checkMarker) { state.checkMarker.remove(); state.checkMarker = null; }
  }
  $("#sheetClose").onclick = closeSheet;

  $("#sheetBody").addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "copy") { try { navigator.clipboard.writeText(b.dataset.v).then(() => toast("✓")).catch(() => {}); } catch (x) {} }
    if (act === "watch" || act === "unwatch") {
      const lat = +b.dataset.lat, lon = +b.dataset.lon;
      if (act === "watch") state.watch.push({ lat, lon, at: new Date().toISOString() });
      else state.watch = state.watch.filter(w => !(Math.abs(w.lat - lat) < 1e-4 && Math.abs(w.lon - lon) < 1e-4));
      store.set("watch", state.watch); drawWatch(); openPoint(lat, lon);
    }
    if (act === "focus" || act === "zoomto") focusZone(b.dataset.id);
    if (act === "layer") { state.layersOn[b.dataset.k] = b.checked; store.set("layers", state.layersOn); drawZones(); openLayers(); }
    if (act === "geo") locateMe();
    if (act === "allOn" || act === "allOff") {
      Object.keys(CFG.layers).forEach(k => state.layersOn[k] = act === "allOn");
      store.set("layers", state.layersOn); drawZones(); openLayers();
    }
    if (act === "coords") { const v = Geo.parseCoords($("#coordIn").value); if (!v) toast(T("badCoords")); else { map.setView(v, Math.max(map.getZoom(), 12)); openPoint(v[0], v[1]); } }
    if (act === "resetFilters") { state.altM = null; state.when = null; state.showInactive = false; persistFilters(); drawZones(); openFilters(); }
  });
  $("#sheetBody").addEventListener("change", e => {
    const t = e.target;
    if (t.matches("[data-ovl]")) setOverlay(t.dataset.ovl, t.checked);
    if (t.matches("[data-layer]")) { state.layersOn[t.dataset.layer] = t.checked; store.set("layers", state.layersOn); drawZones(); }
    if (t.id === "altSel") { state.altM = t.value === "" ? null : +t.value; persistFilters(); drawZones(); }
    if (t.id === "whenIn") { state.when = t.value ? new Date(t.value).toISOString() : null; drawZones(); updateFilterDot(); }
    if (t.id === "inactiveChk") { state.showInactive = t.checked; persistFilters(); drawZones(); }
  });
  $("#sheetBody").addEventListener("input", e => { const t = e.target; if (t.matches("[data-ovlop]")) setOverlayOpacity(t.dataset.ovlop, +t.value); });
  $("#sheetBody").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "coordIn") $("#sheetBody [data-act=coords]").click(); });

  function persistFilters() { store.set("altM", state.altM); store.set("showInactive", state.showInactive); updateFilterDot(); }
  function updateFilterDot() { $("#filterDot").hidden = !(state.altM != null || state.when || state.showInactive); }

  function sheetPadding() {
    const mobile = window.innerWidth <= 820;
    if (mobile) return { paddingTopLeft: [30, 30], paddingBottomRight: [30, Math.round(window.innerHeight * 0.72) + 20] };
    const side = [424, 40];
    return I18N[state.lang].dir === "rtl" ? { paddingTopLeft: [40, 40], paddingBottomRight: side } : { paddingTopLeft: side, paddingBottomRight: [40, 40] };
  }
  function focusZone(id) {
    const f = state.features.find(x => x.properties.id === id); if (!f) return;
    // make sure it's visible
    const k = layerKey(f);
    if (!state.layersOn[k]) { state.layersOn[k] = true; store.set("layers", state.layersOn); }
    if (!isShown(f)) { state.showInactive = true; persistFilters(); }
    drawZones();
    const lyr = zoneLayers[id];
    if (lyr && lyr.getBounds) { try { map.fitBounds(lyr.getBounds(), Object.assign({ maxZoom: 13 }, sheetPadding())); } catch (e) {} }
    const c = Geo.featureCenter(f);
    if (!(lyr && lyr.getBounds)) map.setView(c, 12);
    closeSearchUI();
    openPoint(c[0], c[1], id);
  }

  /* ---------- AIP annex map overlays ---------- */
  async function setOverlay(id, on) {
    const o = state.overlays.find(x => x.id === id); if (!o) return;
    const st = state.ovlState[id] = Object.assign({ on: false, opacity: 0.7 }, state.ovlState[id], { on });
    store.set("ovl", state.ovlState);
    if (!on) { if (state.ovlLayers[id]) { state.ovlLayers[id].remove(); } return; }
    if (!state.ovlLayers[id]) {
      try {
        const r = await fetch(o.file); const blob = await r.blob();
        state.ovlLayers[id] = L.imageOverlay(URL.createObjectURL(blob), o.bounds, { pane: "p_annex", opacity: st.opacity, interactive: false });
      } catch (e) { toast("Overlay load error"); return; }
    }
    state.ovlLayers[id].setOpacity(st.opacity).addTo(map);
  }
  function setOverlayOpacity(id, v) {
    state.ovlState[id] = Object.assign({ on: true }, state.ovlState[id], { opacity: v }); store.set("ovl", state.ovlState);
    if (state.ovlLayers[id]) state.ovlLayers[id].setOpacity(v);
  }
  function overlaysHtml() {
    if (!state.overlays.length) return "";
    return `<h3>${esc(T("annexMaps"))}</h3><p class="muted" style="font-size:12px">${esc(T("annexNote"))}</p>` + state.overlays.map(o => {
      const st = state.ovlState[o.id] || {};
      return `<div class="ovl"><label><input type="checkbox" data-ovl="${o.id}" ${st.on ? "checked" : ""}><span>${esc(state.lang === "he" ? o.he : o.en)}</span></label>
        <div class="muted">${esc(T("opacity"))}</div><input type="range" min="0.15" max="1" step="0.05" value="${st.opacity || 0.7}" data-ovlop="${o.id}">
        <div class="muted">${esc(T("fitErr"))}: ±${o.err_m < 100 ? 100 : o.err_m} m${o.edition ? " · " + esc(o.edition) : ""} · <a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(T("openPdf"))}</a></div></div>`;
    }).join("");
  }

  /* ---------- panels ---------- */
  function openLayers() {
    const rows = CFG.drawOrder.slice().reverse().map(k => {
      const lc = CFG.layers[k]; const n = state.features.filter(f => layerKey(f) === k).length;
      return `<label class="lrow"><input type="checkbox" data-layer="${k}" ${state.layersOn[k] ? "checked" : ""}>
        <i class="sw ${k === "airfield" || k === "heliport" ? "dot" : ""}" style="--zc:${lc.color};--dash:${lc.dash ? "dashed" : "solid"}"></i>
        <span>${esc(lc[state.lang] || lc.he)}</span><small>${n}</small></label>`;
    }).join("");
    let html = `<h2>${esc(T("layers"))}</h2>
      <div class="lbtns"><button class="btn" data-act="allOn">✓ ${esc(T("selectAll"))}</button><button class="btn" data-act="allOff">✕ ${esc(T("clearAll"))}</button></div>
      <div class="lrows">${rows}</div>` + overlaysHtml();
    const gen = activeUnlocated("general"), ad = activeUnlocated("ad"), oth = state.unlocated.filter(u => u.kind !== "general" && u.kind !== "ad");
    if (gen.length) html += `<h3>⚠ ${esc(T("generalNotices"))} <small>(${gen.length})</small></h3>` + gen.map(unlocatedItem).join("");
    if (ad.length) html += `<h3>${esc(T("adClosures"))} <small>(${ad.length})</small></h3>` + ad.map(unlocatedItem).join("");
    if (oth.length) html += `<details class="rules"><summary>${esc(T("otherNotams"))} (${oth.length})</summary>${oth.map(unlocatedItem).join("")}</details>`;
    openSheet(html, "layers");
  }

  function openFilters() {
    const opts = [`<option value="">${esc(T("altAll"))}</option>`].concat(CFG.altitudeStepsM.map(m =>
      `<option value="${m}" ${state.altM === m ? "selected" : ""}>${m} ${esc(T("metersAgl"))} (${Math.round(m * 3.28084)} ft)</option>`)).join("");
    const whenVal = state.when ? toLocalInput(new Date(state.when)) : "";
    openSheet(`
      <h2>${esc(T("filters"))}</h2>
      <label class="field"><span>${esc(T("altitude"))}</span><select id="altSel">${opts}</select></label>
      <label class="field"><span>${esc(T("when"))}</span><input id="whenIn" type="datetime-local" value="${whenVal}"><small class="muted">${esc(T("now"))} = ${esc(state.lang === "he" ? "ריק" : "empty")}</small></label>
      <label class="lrow"><input id="inactiveChk" type="checkbox" ${state.showInactive ? "checked" : ""}><span>${esc(T("showInactive"))}</span></label>
      <button class="btn" data-act="resetFilters">↺</button>
    `, "filters");
  }
  function toLocalInput(d) {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openCheck() {
    openSheet(`
      <h2>${esc(T("checkHere"))}</h2>
      <button class="btn primary wide" data-act="geo">◎ ${esc(T("myLocation"))}</button>
      <div class="coord-row"><input id="coordIn" dir="ltr" placeholder="${esc(T("coordsPlaceholder"))}"><button class="btn" data-act="coords">${esc(T("go"))}</button></div>
      <p class="muted">${esc(T("tapMapHint"))}</p>
      ${watchListHtml()}
      <p class="disclaimer">${esc(T("disclaimer"))}</p>
    `, "check");
  }
  function watchListHtml() {
    if (!state.watch.length) return "";
    return `<h3>★ ${esc(T("watched"))}</h3><ul class="near">` + state.watch.map(w =>
      `<li><button class="linkish" data-act="goto" data-lat="${w.lat}" data-lon="${w.lon}">${fmtCoord(w.lat, w.lon)}</button></li>`).join("") + "</ul>";
  }
  $("#sheetBody").addEventListener("click", e => {
    const b = e.target.closest("[data-act=goto]"); if (!b) return;
    const lat = +b.dataset.lat, lon = +b.dataset.lon; map.setView([lat, lon], 12); openPoint(lat, lon);
  });

  function locateMe() {
    if (!navigator.geolocation) return toast(T("geoFail"));
    let done = false;
    const t = setTimeout(() => { if (!done) toast(T("geoFail")); }, 9000);
    try {
      navigator.geolocation.getCurrentPosition(pos => {
        done = true; clearTimeout(t);
        const { latitude: la, longitude: lo } = pos.coords;
        map.setView([la, lo], 12); openPoint(la, lo);
      }, () => { done = true; clearTimeout(t); toast(T("geoFail")); }, { enableHighAccuracy: true, timeout: 8000 });
    } catch (e) { done = true; clearTimeout(t); toast(T("geoFail")); }
  }

  /* ---------- what's new / banner ---------- */
  function changesSince(ts) {
    const ch = (state.meta && state.meta.changes) || [];
    return ts ? ch.filter(c => new Date(c.at) > new Date(ts)) : [];
  }
  function watchHits(changes) {
    if (!state.watch.length) return [];
    return changes.filter(c => {
      const f = state.features.find(x => x.properties.id === c.id);
      if (!f) return false;
      return state.watch.some(w => Geo.contains(f, w.lat, w.lon) ||
        Geo.distanceM(w.lat, w.lon, ...Geo.featureCenter(f)) < 10000);
    });
  }
  function renderBanner() {
    const m = state.meta; if (!m || !CFG.features.updateBanner) return;
    const fresh = changesSince(state.lastSeen);
    state.newIds = new Set(fresh.map(c => c.id));
    $("#newsBadge").hidden = !fresh.length; $("#newsBadge").textContent = fresh.length;
    const latest = [m.notam && m.notam.updatedAt, m.aip && m.aip.updatedAt].filter(Boolean).sort().pop();
    if (!state.lastSeen) { state.lastSeen = latest || new Date().toISOString(); store.set("lastSeen", state.lastSeen); return; }
    if (!fresh.length) { $("#banner").hidden = true; return; }
    const hits = watchHits(fresh);
    const srcs = [...new Set(fresh.map(c => c.source))].map(s => s === "aip" ? `${T("aipUpdated")} ${fmtTime(m.aip.updatedAt)}` : `${T("notamUpdated")} ${fmtTime(m.notam.updatedAt)}`);
    $("#banner").innerHTML = `
      <div class="b-main"><b>● ${esc(T("newUpdate"))}</b> · ${esc(srcs.join(" · "))} · ${fresh.length} ${esc(T("changes"))} ${esc(T("since"))}
      ${hits.length ? `<div class="b-watch">★ ${esc(T("watchAlert"))}: ${hits.map(h => esc(L_(h.text))).join("; ")}</div>` : ""}</div>
      <div class="b-acts"><button class="btn small" id="bShow">${esc(T("showChanges"))}</button><button class="btn small ghost" id="bDismiss">${esc(T("dismiss"))}</button></div>`;
    $("#banner").hidden = false;
    $("#bShow").onclick = openNews;
    $("#bDismiss").onclick = markSeen;
  }
  function markSeen() {
    state.lastSeen = new Date().toISOString(); store.set("lastSeen", state.lastSeen);
    $("#banner").hidden = true; state.newIds = new Set(); $("#newsBadge").hidden = true; drawZones();
  }
  function openNews() {
    const m = state.meta || {};
    const all = (m.changes || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 60);
    const fresh = new Set(changesSince(state.lastSeen).map(c => c));
    const kindLbl = k => T(k) || k;
    let html = `<h2>${esc(T("whatsNew"))}</h2>
      <div class="upd">
        <div><span>${esc(T("aipUpdated"))}</span><b>${fmtTime(m.aip && m.aip.updatedAt) || "—"}</b>${m.aip && m.aip.checkedAt ? `<span>${state.lang === "he" ? "נבדק לאחרונה" : "Last checked"}: ${fmtTime(m.aip.checkedAt)}</span>` : ""}${m.aip && m.aip.summary ? `<p>${esc(L_(m.aip.summary))}</p>` : ""}</div>
        <div><span>${esc(T("notamUpdated"))}</span><b>${fmtTime(m.notam && m.notam.updatedAt) || "—"}</b>${m.notam && m.notam.summary ? `<p>${esc(L_(m.notam.summary))}</p>` : ""}</div>
      </div>`;
    html += all.length ? `<ul class="chg">` + all.map(c => `
      <li class="${fresh.has(c) ? "fresh" : ""}">
        <span class="k k-${esc(c.kind)}">${esc(kindLbl(c.kind))}</span>
        <span class="src">${c.source === "aip" ? "פמ\"ת" : "NOTAM"}</span>
        <time>${fmtTime(c.at)}</time>
        <div>${c.kind !== "removed" && state.features.some(f => f.properties.id === c.id) ? `<button class="linkish" data-act="focus" data-id="${esc(c.id)}">${esc(L_(c.text))}</button>` : esc(L_(c.text))}</div>
      </li>`).join("") + "</ul>" : `<p class="muted">${esc(T("noChanges"))}</p>`;
    openSheet(html, "news");
  }

  function openAbout() {
    const m = state.meta || {};
    const legend = CFG.drawOrder.slice().reverse().map(k => { const lc = CFG.layers[k]; return `<li><i class="sw ${k === "airfield" || k === "heliport" ? "dot" : ""}" style="--zc:${lc.color};--dash:${lc.dash ? "dashed" : "solid"}"></i>${esc(lc[state.lang] || lc.he)}</li>`; }).join("");
    const log = (m.appChangelog || []).map(c => `<li><b>${esc(c.version)}</b> <time>${esc(c.date)}</time> – ${esc(L_(c))}</li>`).join("");
    openSheet(`
      <h2>${esc(T("title"))}</h2>
      <p class="disclaimer">${esc(T("disclaimer"))}</p>
      <h3>${esc(T("legend"))}</h3><ul class="legend">${legend}</ul>
      <h3>${esc(T("sourcesTitle"))}</h3>
      <ul class="near">${CFG.sources.aip.concat([CFG.sources.notam]).map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.he)}</a></li>`).join("")}</ul>
      ${m.aip && m.aip.edition ? `<p class="muted">${esc(m.aip.edition)}</p>` : ""}
      <p class="fsum">${esc(T("gaps"))}</p>
      <h3>${esc(T("changelog"))}</h3><ul class="near">${log}</ul>
      <p class="muted">${esc(T("version"))} ${esc(CFG.version)}</p>
    `, "about");
  }

  /* ---------- search ---------- */
  function closeSearchUI() { const b = $("#searchResults"); if (b) b.hidden = true; }
  function setupSearch() {
    const inp = $("#search"), box = $("#searchResults");
    inp.addEventListener("input", () => {
      const q = inp.value.trim().toLowerCase();
      if (q.length < 2) { box.hidden = true; return; }
      const coords = Geo.parseCoords(inp.value);
      let items = [];
      if (coords) items.push(`<button data-lat="${coords[0]}" data-lon="${coords[1]}">📍 ${fmtCoord(coords[0], coords[1])}</button>`);
      state.features.filter(f => {
        const p = f.properties;
        return [p.name && p.name.he, p.name && p.name.en, p.designator, p.id, p.notam && p.notam.id].some(s => s && String(s).toLowerCase().includes(q));
      }).slice(0, 12).forEach(f => {
        const lc = CFG.layers[layerKey(f)];
        items.push(`<button data-id="${esc(f.properties.id)}"><i class="sw" style="--zc:${lc.color}"></i>${esc(L_(f.properties.name))}${f.properties.designator ? ` <small class="mono">${esc(f.properties.designator)}</small>` : ""}</button>`);
      });
      (state.basemap ? state.basemap.cities : []).filter(c => c.he.includes(q) || c.en.toLowerCase().includes(q)).slice(0, 5).forEach(c =>
        items.push(`<button data-city="1" data-lat="${c.c[1]}" data-lon="${c.c[0]}">🏙 ${esc(state.lang === "he" ? c.he : c.en)}</button>`));
      box.innerHTML = items.length ? items.join("") : `<div class="muted pad">${esc(T("noResults"))}</div>`;
      box.hidden = false;
    });
    box.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      box.hidden = true; inp.value = ""; inp.blur();
      if (b.dataset.id) focusZone(b.dataset.id);
      else if (b.dataset.city) map.setView([+b.dataset.lat, +b.dataset.lon], 12);
      else { map.setView([+b.dataset.lat, +b.dataset.lon], 12); openPoint(+b.dataset.lat, +b.dataset.lon); }
    });
    document.addEventListener("click", e => { if (!e.target.closest("#searchWrap")) box.hidden = true; });
  }

  /* ---------- watch points ---------- */
  let watchLayer = L.layerGroup().addTo(map);
  function drawWatch() {
    watchLayer.clearLayers();
    state.watch.forEach(w => L.marker([w.lat, w.lon], { icon: L.divIcon({ className: "watch", html: "★", iconSize: [20, 20] }), interactive: false }).addTo(watchLayer));
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.className = "show"; clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 3500);
  }

  /* ---------- i18n apply ---------- */
  function applyLang() {
    const d = I18N[state.lang];
    document.documentElement.lang = state.lang; document.documentElement.dir = d.dir;
    document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = T(el.dataset.i18n));
    document.querySelectorAll("[data-i18n-ph]").forEach(el => el.placeholder = T(el.dataset.i18nPh));
    $("#btnLang").textContent = T("lang");
    zoomCtl.setPosition(d.dir === "rtl" ? "topleft" : "topright");
    $("#btnAbout").textContent = `${T("version")} ${CFG.version} · ${T("sourcesTitle")} · ${T("legend")}`;
    updatedLine();
    if (state.basemap) drawCities();
  }
  function updatedLine() {
    const m = state.meta;
    $("#updatedLine").textContent = m ? `${T("aipUpdated")} ${fmtTime(m.aip && m.aip.updatedAt) || "—"} · ${T("notamUpdated")} ${fmtTime(m.notam && m.notam.updatedAt) || "—"}` : T("subtitle");
  }

  /* ---------- events ---------- */
  map.on("click", e => { if (CFG.features.pointCheck) openPoint(e.latlng.lat, e.latlng.lng); });
  $("#btnLayers").onclick = openLayers;
  $("#btnFilters").onclick = openFilters;
  $("#btnCheck").onclick = openCheck;
  $("#btnNews").onclick = openNews;
  $("#btnAbout").onclick = openAbout;
  $("#btnLang").onclick = () => {
    state.lang = state.lang === "he" ? "en" : "he"; store.set("lang", state.lang); applyLang();
    const k = sheetKind; if (k === "layers") openLayers(); else if (k === "filters") openFilters(); else if (k === "check") openCheck(); else if (k === "news") openNews(); else if (k === "about") openAbout(); else if (k === "point" && state.lastPoint) openPoint(...state.lastPoint);
  };
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

  /* ---------- load ---------- */
  async function getJSON(path) {
    const r = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }
  async function init() {
    applyLang(); setupSearch(); drawWatch();
    try {
      const [basemap, meta, zones, notams] = await Promise.all([
        getJSON("data/basemap.json"), getJSON("data/meta.json"), getJSON("data/zones.json"), getJSON("data/notams.json")
      ]);
      state.basemap = basemap; state.meta = meta;
      state.features = (zones.features || []).concat((notams.located && notams.located.features) || []);
      state.unlocated = notams.unlocated || [];
      try { state.overlays = await getJSON("data/overlays.json"); } catch (e) { state.overlays = []; }
      state.overlays.forEach(o => { if ((state.ovlState[o.id] || {}).on) setOverlay(o.id, true); });
      $("#demoRibbon").hidden = !meta.demo;
      drawBasemap(); renderBanner(); drawZones(); applyLang();
    } catch (err) {
      console.error(err);
      toast("Data load error: " + err.message);
    }
  }
  window.__app = { map, openPoint, focusZone, state };
  init();
})();
