/* Geometry & parsing helpers – no dependencies */
window.Geo = (function () {
  const R = 6371008.8;
  const toRad = d => d * Math.PI / 180;

  function distanceM(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ring: [[lon,lat],...]
  function inRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(lon, lat, rings) {
    if (!inRing(lon, lat, rings[0])) return false;
    for (let k = 1; k < rings.length; k++) if (inRing(lon, lat, rings[k])) return false;
    return true;
  }

  /** Does a GeoJSON feature contain [lat,lon]? Circles: Point geometry + properties.radius_m */
  function contains(feature, lat, lon) {
    const g = feature.geometry, p = feature.properties || {};
    if (!g) return false;
    if (g.type === "Point") {
      if (!p.radius_m) return false;
      return distanceM(lat, lon, g.coordinates[1], g.coordinates[0]) <= p.radius_m;
    }
    if (g.type === "Polygon") return inPolygon(lon, lat, g.coordinates);
    if (g.type === "MultiPolygon") return g.coordinates.some(poly => inPolygon(lon, lat, poly));
    return false;
  }

  function featureCenter(feature) {
    const g = feature.geometry;
    if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
    let pts = [];
    if (g.type === "Polygon") pts = g.coordinates[0];
    else if (g.type === "MultiPolygon") pts = g.coordinates.flatMap(p => p[0]);
    let sx = 0, sy = 0;
    pts.forEach(c => { sx += c[0]; sy += c[1]; });
    return [sy / pts.length, sx / pts.length];
  }

  /** Parse user / NOTAM coordinates. Supports:
   *  "32.08, 34.78" · "32.08 34.78" · "320500N0344700E" · "3205N03447E"
   *  "32°05'00\"N 34°47'00\"E" */
  function parseCoords(text) {
    if (!text) return null;
    const s = text.trim().toUpperCase();
    // ICAO compact: DDMM[SS]N DDDMM[SS]E
    let m = s.match(/(\d{2})(\d{2})(\d{2}(?:\.\d+)?)?\s*([NS])\s*,?\s*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)?\s*([EW])/);
    if (m) {
      let lat = +m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0);
      let lon = +m[5] + +m[6] / 60 + (m[7] ? +m[7] / 3600 : 0);
      if (m[4] === "S") lat = -lat;
      if (m[8] === "W") lon = -lon;
      return valid(lat, lon);
    }
    // DMS with symbols
    m = s.match(/(\d{1,2})[°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:\.\d+)?)?["”\s]*([NS])[\s,]+(\d{1,3})[°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:\.\d+)?)?["”\s]*([EW])/);
    if (m) {
      let lat = +m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0);
      let lon = +m[5] + +m[6] / 60 + (m[7] ? +m[7] / 3600 : 0);
      if (m[4] === "S") lat = -lat;
      if (m[8] === "W") lon = -lon;
      return valid(lat, lon);
    }
    // decimal
    m = s.match(/(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)/);
    if (m) {
      let a = +m[1], b = +m[2];
      // allow "lon, lat" for Israel ranges
      if (a > 33 && a < 37 && b > 28 && b < 34) [a, b] = [b, a];
      return valid(a, b);
    }
    return null;
  }
  function valid(lat, lon) {
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [lat, lon];
  }

  /** Vertical limit to feet (approx). {v,u:"ft"|"m"|"FL",ref:"SFC"|"AGL"|"AMSL"|"FL"|"UNL"} */
  function limitFt(l) {
    if (!l) return null;
    if (l.ref === "SFC" || l.ref === "GND") return 0;
    if (l.ref === "UNL") return Infinity;
    if (l.ref === "FL" || l.u === "FL") return l.v * 100;
    return l.u === "m" ? l.v * 3.28084 : l.v;
  }

  return { distanceM, contains, featureCenter, parseCoords, limitFt };
})();
