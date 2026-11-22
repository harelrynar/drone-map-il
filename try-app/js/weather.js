/* =========================================================
 * נתונים מטאורולוגיים לנקודה (מ-1.7) – Open-Meteo, ללא מפתח.
 * Point weather (since 1.7) – Open-Meteo forecast API, no key, fetched from the browser.
 *
 * Weather.get(lat, lon, force) -> Promise<data>   (cached ~5 min per ~1 km cell)
 * Weather.render(data, { lang, unit, esc })  -> HTML
 *
 * הערות דיוק / accuracy notes:
 *  - הערכים הם ערכי מודל לנקודה (מתעדכנים כל 15 דקות), לא מדידה מתחנה.
 *  - רוח ב-100 מ' = ממוצע וקטורי של 80 מ' ו-120 מ' (המודל לא מספק 100 מ' ישירות).
 *  - בסיס ענן = הערכה לפי הפרש טמפרטורה–נקודת טל (125 מ' לכל מעלה).
 * ========================================================= */
(function () {
  "use strict";
  const CFG = Object.assign({
    url: "https://api.open-meteo.com/v1/forecast",
    cacheMinutes: 5,
    timeoutMs: 12000,
    forecastHours: 3,
    minVisibilityKm: 3          // תנאי VLOS בפמ"ת ב'-09 – ראות מעל 3 ק"מ
  }, (window.APP_CONFIG && window.APP_CONFIG.weather) || {});

  const CUR_CORE = ["temperature_2m", "precipitation", "weather_code", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"];
  const CUR_FULL = CUR_CORE.concat(["dew_point_2m", "cloud_cover", "visibility", "is_day",
    "wind_speed_80m", "wind_speed_120m", "wind_direction_80m", "wind_direction_120m"]);
  const HOURLY = ["weather_code", "precipitation", "wind_speed_10m", "wind_gusts_10m"];

  /* ---------- texts ---------- */
  const TXT = {
    he: {
      wxButton: "נתונים מטאורולוגיים", wxLoading: "טוען נתוני מזג אוויר…",
      wxError: "לא הצלחתי לטעון נתוני מזג אוויר. בדקו את החיבור ונסו שוב.", wxRetry: "נסה שוב", wxRefresh: "רענן",
      wxWind: "רוח (10 מ')", wxGusts: "משבים", wxWind100: "רוח ב-100 מ'", wxRain: "גשם", wxTemp: "טמפרטורה",
      wxVis: "ראות", wxCloudBase: "בסיס ענן", wxSun: "זריחה / שקיעה",
      wxKn: "קשר", wxMs: "מ'/ש'", wxMmH: "מ\"מ/שעה", wxKm: "ק\"מ", wxM: "מ'", wxFrom: "מ-",
      wxCalm: "שקט", wxEst: "הערכה", wxClear: "שמיים בהירים", wxFog: "ערפל – בגובה הקרקע", wxNoData: "אין נתון",
      wxVisLow: "מתחת ל-3 ק\"מ (תנאי VLOS)",
      wxNext: "ב-{n} השעות הקרובות", wxWindUpTo: "רוח עד {v}", wxGustsUpTo: "משבים עד {v}",
      wxNoRain: "ללא גשם", wxRainSum: "גשם כ-{v} מ\"מ",
      wxAsOf: "נכון ל-", wxFetched: "נשלף", wxModel: "ערכי מודל לנקודה, לא מדידה מתחנה",
      wxNotes: "רוח ב-100 מ': ממוצע של 80 ו-120 מ'. בסיס ענן: הערכה לפי טמפרטורה ונקודת טל.",
      wxSource: "מקור: Open-Meteo",
      dirs: ["צפון", "צפון-מזרח", "מזרח", "דרום-מזרח", "דרום", "דרום-מערב", "מערב", "צפון-מערב"],
      codes: { 0: "בהיר", 1: "בהיר ברובו", 2: "מעונן חלקית", 3: "מעונן", 45: "ערפל", 51: "טפטוף", 61: "גשם", 66: "גשם קופא", 71: "שלג", 80: "ממטרים", 85: "ממטרי שלג", 95: "סופות רעמים" }
    },
    en: {
      wxButton: "Weather data", wxLoading: "Loading weather…",
      wxError: "Could not load weather data. Check your connection and try again.", wxRetry: "Retry", wxRefresh: "Refresh",
      wxWind: "Wind (10 m)", wxGusts: "Gusts", wxWind100: "Wind at 100 m", wxRain: "Rain", wxTemp: "Temperature",
      wxVis: "Visibility", wxCloudBase: "Cloud base", wxSun: "Sunrise / sunset",
      wxKn: "kt", wxMs: "m/s", wxMmH: "mm/h", wxKm: "km", wxM: "m", wxFrom: "from ",
      wxCalm: "Calm", wxEst: "estimate", wxClear: "Clear sky", wxFog: "Fog – at ground level", wxNoData: "n/a",
      wxVisLow: "below 3 km (VLOS condition)",
      wxNext: "Next {n} hours", wxWindUpTo: "wind up to {v}", wxGustsUpTo: "gusts up to {v}",
      wxNoRain: "no rain", wxRainSum: "about {v} mm of rain",
      wxAsOf: "As of ", wxFetched: "fetched", wxModel: "model values for this point, not a station measurement",
      wxNotes: "Wind at 100 m: mean of 80 and 120 m. Cloud base: estimated from temperature and dew point.",
      wxSource: "Source: Open-Meteo",
      dirs: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
      codes: { 0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 51: "drizzle", 61: "rain", 66: "freezing rain", 71: "snow", 80: "showers", 85: "snow showers", 95: "thunderstorms" }
    }
  };
  const t = (lang, k) => (TXT[lang] || TXT.he)[k] ?? TXT.he[k] ?? k;

  /* WMO weather code -> group key used in TXT.codes */
  function codeGroup(c) {
    if (c == null) return null;
    if (c <= 3) return c;
    if (c === 45 || c === 48) return 45;
    if (c >= 51 && c <= 57) return 51;
    if (c === 66 || c === 67) return 66;
    if (c >= 61 && c <= 65) return 61;
    if (c >= 71 && c <= 77) return 71;
    if (c >= 80 && c <= 82) return 80;
    if (c === 85 || c === 86) return 85;
    if (c >= 95) return 95;
    return null;
  }

  /* ---------- fetch ---------- */
  const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
  const cache = new Map();
  const cellKey = (lat, lon) => lat.toFixed(2) + "," + lon.toFixed(2);

  async function call(lat, lon, cur) {
    const q = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4),
      current: cur.join(","), hourly: HOURLY.join(","), forecast_hours: String(CFG.forecastHours + 2),
      daily: "sunrise,sunset", forecast_days: "1",
      wind_speed_unit: "ms", timezone: "Asia/Jerusalem"
    });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CFG.timeoutMs);
    try {
      const r = await fetch(CFG.url + "?" + q.toString(), { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) { const e = new Error("weather HTTP " + r.status); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  /* mean of two winds as vectors (so 350° and 10° average to 0°, not 180°) */
  function meanWind(s1, d1, s2, d2) {
    if (s1 == null || s2 == null) return null;
    if (d1 == null || d2 == null) return { s: (s1 + s2) / 2, d: d1 ?? d2 };
    const rad = Math.PI / 180;
    const u = -(s1 * Math.sin(d1 * rad) + s2 * Math.sin(d2 * rad)) / 2;
    const v = -(s1 * Math.cos(d1 * rad) + s2 * Math.cos(d2 * rad)) / 2;
    return { s: Math.hypot(u, v), d: (Math.atan2(-u, -v) / rad + 360) % 360 };
  }

  function normalize(j, partial) {
    const c = j.current || {}, h = j.hourly || {}, d = j.daily || {};
    const out = {
      time: c.time || null, fetchedAt: Date.now(), partial: !!partial,
      temp: num(c.temperature_2m),
      wind: { s: num(c.wind_speed_10m), d: num(c.wind_direction_10m), g: num(c.wind_gusts_10m) },
      wind100: meanWind(num(c.wind_speed_80m), num(c.wind_direction_80m), num(c.wind_speed_120m), num(c.wind_direction_120m)),
      code: num(c.weather_code), visM: num(c.visibility), cloud: num(c.cloud_cover),
      sunrise: (d.sunrise && d.sunrise[0]) || null, sunset: (d.sunset && d.sunset[0]) || null,
      rainMmH: null, cloudBase: null, next: null
    };
    // "current" precipitation is the sum over the preceding interval (normally 15 min) -> rate per hour
    const p = num(c.precipitation), iv = num(c.interval) || 900;
    if (p != null) out.rainMmH = p * 3600 / iv;

    // cloud base
    const td = num(c.dew_point_2m);
    if (out.code === 45 || out.code === 48) out.cloudBase = { kind: "fog" };
    else if (out.cloud != null && out.cloud < 15) out.cloudBase = { kind: "clear" };
    else if (out.temp != null && td != null) {
      const m = Math.max(0, 125 * (out.temp - td));
      out.cloudBase = m < 50 ? { kind: "fog" } : { kind: "est", m: Math.round(m / 50) * 50 };
    }

    // next N hours: hourly values describe the hour that ENDS at the timestamp
    if (Array.isArray(h.time) && out.time) {
      const idx = h.time.map((x, i) => i).filter(i => h.time[i] > out.time).slice(0, CFG.forecastHours);
      if (idx.length) {
        const col = k => idx.map(i => num((h[k] || [])[i])).filter(v => v != null);
        const mx = a => a.length ? Math.max(...a) : null;
        out.next = {
          hours: idx.length,
          wind: mx(col("wind_speed_10m")), gust: mx(col("wind_gusts_10m")),
          rain: col("precipitation").reduce((a, b) => a + b, 0),
          code: mx(col("weather_code"))
        };
      }
    }
    return out;
  }

  async function get(lat, lon, force) {
    const k = cellKey(lat, lon), hit = cache.get(k);
    if (!force && hit && Date.now() - hit.fetchedAt < CFG.cacheMinutes * 60000) return hit;
    let data;
    try { data = normalize(await call(lat, lon, CUR_FULL), false); }
    catch (e) {
      // 400 = the API rejected a variable name; retry with the core set so the feature keeps working
      if (e && e.status === 400) data = normalize(await call(lat, lon, CUR_CORE), true);
      else throw e;
    }
    cache.set(k, data);
    return data;
  }

  /* ---------- render ---------- */
  const KN = 1.943844;
  function render(d, o) {
    const lang = o.lang === "en" ? "en" : "he", unit = o.unit === "ms" ? "ms" : "kn";
    const esc = o.esc || (s => String(s));
    const X = k => t(lang, k);
    const nd = `<span class="muted">${esc(X("wxNoData"))}</span>`;
    const spd = v => v == null ? null : (unit === "kn" ? String(Math.round(v * KN)) : (Math.round(v * 10) / 10).toFixed(1));
    const spdU = v => v == null ? nd : `<b>${spd(v)}</b> <span class="wx-u">${esc(X(unit === "kn" ? "wxKn" : "wxMs"))}</span>`;
    const spdT = v => `${spd(v)} ${X(unit === "kn" ? "wxKn" : "wxMs")}`;
    const dirName = deg => X("dirs")[Math.round(deg / 45) % 8];
    const arrow = deg => deg == null ? "" :
      `<svg class="wx-arrow" viewBox="0 0 24 24" style="transform:rotate(${Math.round(deg) + 180}deg)" aria-hidden="true"><path d="M12 2l6 9h-4.2v11h-3.6V11H6z"/></svg>`;
    const dirTxt = deg => deg == null ? "" : `<span class="wx-sub">${esc(X("wxFrom"))}${esc(dirName(deg))} · <bdi>${String(Math.round(deg) % 360).padStart(3, "0")}°</bdi></span>`;
    const hhmm = s => s ? esc(String(s).slice(11, 16)) : "—";
    const calm = d.wind.s != null && d.wind.s < 0.3;

    const tiles = [];
    const tile = (label, main, sub, cls) => tiles.push(`<div class="wx-tile ${cls || ""}"><span class="wx-l">${esc(label)}</span><div class="wx-v">${main}</div>${sub || ""}</div>`);

    tile(X("wxWind"), `${calm ? "" : arrow(d.wind.d)}${calm ? `<b>${esc(X("wxCalm"))}</b>` : spdU(d.wind.s)}`, calm ? "" : dirTxt(d.wind.d));
    tile(X("wxGusts"), spdU(d.wind.g));
    if (d.wind100) tile(X("wxWind100"), `${arrow(d.wind100.d)}${spdU(d.wind100.s)}`, dirTxt(d.wind100.d));
    else tile(X("wxWind100"), nd);
    tile(X("wxRain"), d.rainMmH == null ? nd : `<b>${(Math.round(d.rainMmH * 10) / 10).toFixed(1)}</b> <span class="wx-u">${esc(X("wxMmH"))}</span>`);
    tile(X("wxTemp"), d.temp == null ? nd : `<b><bdi>${Math.round(d.temp * 10) / 10}°C</bdi></b>`);

    if (d.visM == null) tile(X("wxVis"), nd);
    else {
      const km = d.visM / 1000, low = km < CFG.minVisibilityKm;
      const v = km >= 10 ? Math.round(km) : (Math.round(km * 10) / 10);
      tile(X("wxVis"), `<b>${v}</b> <span class="wx-u">${esc(X("wxKm"))}</span>`, low ? `<span class="wx-sub">${esc(X("wxVisLow"))}</span>` : "", low ? "wx-warn" : "");
    }

    const cb = d.cloudBase;
    if (!cb) tile(X("wxCloudBase"), nd);
    else if (cb.kind === "clear") tile(X("wxCloudBase"), `<b class="wx-s">${esc(X("wxClear"))}</b>`);
    else if (cb.kind === "fog") tile(X("wxCloudBase"), `<b class="wx-s">${esc(X("wxFog"))}</b>`, "", "wx-warn");
    else tile(X("wxCloudBase"), `<b><bdi>~${cb.m.toLocaleString("en-US")}</bdi></b> <span class="wx-u">${esc(X("wxM"))}</span>`,
      `<span class="wx-sub"><bdi>~${(Math.round(cb.m * 3.28084 / 100) * 100).toLocaleString("en-US")} ft</bdi> · ${esc(X("wxEst"))}</span>`);

    tile(X("wxSun"), `<b><bdi>${hhmm(d.sunrise)}</bdi> / <bdi>${hhmm(d.sunset)}</bdi></b>`);

    // one-sentence forecast
    let fc = "";
    if (d.next) {
      const n = d.next, parts = [];
      const g = codeGroup(n.code); if (g != null && X("codes")[g]) parts.push(X("codes")[g]);
      if (n.wind != null) parts.push(X("wxWindUpTo").replace("{v}", spdT(n.wind)) + (n.gust != null ? ` (${X("wxGustsUpTo").replace("{v}", spdT(n.gust))})` : ""));
      parts.push(n.rain < 0.05 ? X("wxNoRain") : X("wxRainSum").replace("{v}", (Math.round(n.rain * 10) / 10).toFixed(1)));
      fc = `<p class="wx-fc"><b>${esc(X("wxNext").replace("{n}", n.hours))}:</b> ${esc(parts.join(", "))}.</p>`;
    }
    const nowG = codeGroup(d.code);
    const nowTxt = nowG != null && X("codes")[nowG] ? `<span class="wx-now">${esc(X("codes")[nowG])}</span>` : "";
    const fetched = new Date(d.fetchedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });

    return `
      <div class="wx-head">
        <div class="wx-stamp"><b>${esc(X("wxAsOf"))}<bdi>${hhmm(d.time)}</bdi></b>${nowTxt}</div>
        <div class="wx-seg" role="group">
          <button type="button" data-act="wxUnit" data-u="kn" class="${unit === "kn" ? "on" : ""}" aria-pressed="${unit === "kn"}">knots</button>
          <button type="button" data-act="wxUnit" data-u="ms" class="${unit === "ms" ? "on" : ""}" aria-pressed="${unit === "ms"}">m/s</button>
        </div>
      </div>
      <div class="wx-grid">${tiles.join("")}</div>
      ${fc}
      <p class="wx-foot">${esc(X("wxModel"))} · ${esc(X("wxFetched"))} <bdi>${fetched}</bdi> · <button type="button" class="linkish" data-act="wxRefresh">${esc(X("wxRefresh"))}</button><br>
        ${esc(X("wxNotes"))} <a href="https://open-meteo.com/" target="_blank" rel="noopener">${esc(X("wxSource"))}</a></p>`;
  }

  window.Weather = { get, render, t, _normalize: normalize, _meanWind: meanWind };
})();
