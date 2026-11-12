#!/usr/bin/env python3
"""Builds the OSM-based layers of the map: obstacles and built-up / crowd places.

Runs in GitHub Actions (the public Overpass API is not reachable from the Claude build
environment). Output is a small grid of JSON files (0.25 degree cells) so a phone only
downloads the cells it is looking at:

  <out>/index.json            generated time, list of cells, counts, errors
  <out>/obs/<cell>.json       {"lines": [...], "pts": [...]}     power lines, masts, turbines...
  <out>/pop/<cell>.json       {"built": [...], "crowd": [...]}   built-up polygons, crowd places

usage: osm_build.py <out_dir> <basemap.json> --pbf <extract.osm.pbf>     (preferred: Geofabrik extract, needs `pip install osmium`)
       osm_build.py <out_dir> <basemap.json>                            (Overpass API – slow and rate-limited)
       osm_build.py <out_dir> <basemap.json> --from-cache <dir>         (tests)
Data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, sys, time, urllib.parse, urllib.request

BBOX = (29.4, 34.15, 33.4, 35.95)                 # S, W, N, E
EXTRA_BOXES = [(32.65, 35.6, 33.35, 35.9)]        # Golan – not inside the base-map ISR polygon
CELL = 0.25
BANDS = 4                                         # every query is split into latitude bands
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = "drone-map-il osm layers (github.com/harelrynar/drone-map-il)"

QUERIES = {
    "lines": 'way["power"~"^(line|minor_line)$"]({b});way["aerialway"~"^(cable_car|gondola|chair_lift|mixed_lift|zip_line|goods)$"]({b});',
    "pts": 'nwr["man_made"~"^(mast|tower|communications_tower|chimney|crane)$"]({b});'
           'nwr["power"="generator"]["generator:source"="wind"]({b});',
    "tall": 'nwr["building"]["height"](if:number(t["height"])>=45)({b});'
            'nwr["building"]["building:levels"](if:number(t["building:levels"])>=15)({b});',
    "built": 'way["landuse"~"^(residential|commercial|retail|industrial)$"]({b});'
             'relation["landuse"~"^(residential|commercial|retail|industrial)$"]({b});',
    "crowd": 'nwr["amenity"~"^(school|university|college|hospital|marketplace|bus_station)$"]({b});'
             'nwr["leisure"~"^(stadium|water_park)$"]({b});nwr["shop"="mall"]({b});'
             'nwr["tourism"~"^(theme_park|zoo)$"]({b});nwr["natural"="beach"]({b});'
             'nwr["railway"="station"]({b});',
}
OUT_MODE = {"lines": "tags geom", "pts": "tags center", "tall": "tags center", "built": "tags geom", "crowd": "tags center"}


# ---------- overpass ----------
def overpass(body, out_mode):
    q = f"[out:json][timeout:240][maxsize:1073741824];({body});out {out_mode};"
    data = urllib.parse.urlencode({"data": q}).encode()
    err = None
    for attempt in range(4):
        for ep in ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=data, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=300) as r:
                    j = json.load(r)
                if "elements" not in j:
                    raise ValueError("no elements")
                if j.get("remark"):
                    raise ValueError("remark: " + str(j["remark"])[:120])
                return j["elements"]
            except Exception as e:           # noqa: BLE001
                err = f"{ep.split('/')[2]}: {e}"
                print("  overpass failed:", err, flush=True)
                time.sleep(8 + 10 * attempt)
    raise RuntimeError(err)


def fetch(kind, cache=None):
    if cache and os.path.exists(os.path.join(cache, kind + ".json")):
        return json.load(open(os.path.join(cache, kind + ".json")))
    s, w, n, e = BBOX
    step = (n - s) / BANDS
    seen, out = set(), []
    for i in range(BANDS):
        b = f"{s + i * step:.4f},{w},{s + (i + 1) * step:.4f},{e}"
        els = overpass(QUERIES[kind].replace("{b}", b), OUT_MODE[kind])
        print(f"{kind} band {i + 1}/{BANDS}: {len(els)} elements", flush=True)
        for el in els:
            k = (el["type"], el["id"])
            if k not in seen:
                seen.add(k); out.append(el)
        time.sleep(3)
    if cache:
        os.makedirs(cache, exist_ok=True)
        json.dump(out, open(os.path.join(cache, kind + ".json"), "w"))
    return out


# ---------- OSM extract (.osm.pbf) ----------
MM = ("mast", "tower", "communications_tower", "chimney", "crane")
LANDUSE = ("residential", "commercial", "retail", "industrial")
AERIAL = ("cable_car", "gondola", "chair_lift", "mixed_lift", "zip_line", "goods")


def kinds_of(t):
    """Which of the raw lists a point-like element belongs to (same rules as the Overpass queries)."""
    out = []
    if t.get("man_made") in MM or (t.get("power") == "generator" and t.get("generator:source") == "wind"):
        out.append("pts")
    if "building" in t:
        h, lv = num(t.get("height")), num(t.get("building:levels"))
        if (h is not None and h >= 45) or (lv is not None and lv >= 15):
            out.append("tall")
    if (t.get("amenity") in ("school", "university", "college", "hospital", "marketplace", "bus_station")
            or t.get("leisure") in ("stadium", "water_park") or t.get("shop") == "mall"
            or t.get("tourism") in ("theme_park", "zoo") or t.get("natural") == "beach" or t.get("railway") == "station"):
        out.append("crowd")
    return out


def read_pbf(path):
    import osmium
    raw = {k: [] for k in QUERIES}
    s, w, n, e = BBOX

    def inside(lat, lon):
        return s - 0.3 <= lat <= n + 0.3 and w - 0.3 <= lon <= e + 0.3

    class H(osmium.SimpleHandler):
        def node(self, o):
            t = dict(o.tags)
            ks = kinds_of(t) if t else []
            if ks and o.location.valid() and inside(o.location.lat, o.location.lon):
                el = {"type": "node", "id": o.id, "lat": o.location.lat, "lon": o.location.lon, "tags": t}
                for k in ks:
                    raw[k].append(el)

        def way(self, o):
            t = o.tags
            if t.get("power") in ("line", "minor_line") or t.get("aerialway") in AERIAL:
                g = [{"lat": nd.location.lat, "lon": nd.location.lon} for nd in o.nodes if nd.location.valid()]
                if len(g) >= 2 and inside(g[0]["lat"], g[0]["lon"]):
                    raw["lines"].append({"type": "way", "id": o.id, "tags": dict(t), "geometry": g})

        def area(self, o):          # closed ways and multipolygon relations
            t = dict(o.tags)
            lu = t.get("landuse") in LANDUSE
            ks = kinds_of(t)
            if not lu and not ks:
                return
            typ = "way" if o.from_way() else "relation"
            rings = []
            for ring in o.outer_rings():
                pts = [(nd.lon, nd.lat) for nd in ring if nd.location.valid()]
                if len(pts) >= 4:
                    rings.append(pts)
            if not rings or not inside(rings[0][0][1], rings[0][0][0]):
                return
            if lu:
                for i, pts in enumerate(rings):
                    raw["built"].append({"type": "way", "id": f"{typ[0]}{o.orig_id()}_{i}", "tags": t,
                                         "geometry": [{"lat": la, "lon": lo} for lo, la in pts]})
            if ks:
                big = max(rings, key=len)
                lats = [p[1] for p in big]; lons = [p[0] for p in big]
                el = {"type": typ, "id": o.orig_id(), "tags": t,
                      "center": {"lat": (min(lats) + max(lats)) / 2, "lon": (min(lons) + max(lons)) / 2}}
                for k in ks:
                    raw[k].append(el)

    H().apply_file(path, locations=True)
    return raw


# ---------- geometry ----------
def in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def load_country_rings(path):
    rings = []
    for f in json.load(open(path))["countries"]["features"]:
        if f["properties"].get("id") not in ("ISR", "PSE"):
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings += [p[0] for p in polys]
    return rings


def cell_key(lat, lon):
    return f"{math.floor(lat / CELL)}_{math.floor(lon / CELL)}"


def wanted_cells(rings):
    cells = set()
    s, w, n, e = BBOX
    for la in range(math.floor(s / CELL), math.ceil(n / CELL)):
        for lo in range(math.floor(w / CELL), math.ceil(e / CELL)):
            lat0, lon0 = la * CELL, lo * CELL
            hit = any(b[0] < lat0 + CELL and b[2] > lat0 and b[1] < lon0 + CELL and b[3] > lon0 for b in EXTRA_BOXES)
            if not hit:
                for i in range(6):
                    for k in range(6):
                        x, y = lon0 + CELL * k / 5, lat0 + CELL * i / 5
                        if any(in_ring(x, y, r) for r in rings):
                            hit = True; break
                    if hit:
                        break
            if not hit:   # a thin strip of the country can cross a cell between sample points
                hit = any(lon0 <= p[0] <= lon0 + CELL and lat0 <= p[1] <= lat0 + CELL for r in rings for p in r)
            if hit:
                cells.add(f"{la}_{lo}")
    return cells


def simplify(pts, tol_m):
    """Douglas-Peucker on [(lon,lat)...]; tolerance in metres (local flat approximation)."""
    if len(pts) < 3:
        return pts
    kx = 111320 * math.cos(math.radians(pts[0][1])); ky = 110540
    xy = [(p[0] * kx, p[1] * ky) for p in pts]
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = xy[a]; bx, by = xy[b]
        dx, dy = bx - ax, by - ay
        d2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            if d2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / d2))
                d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > best:
                best, bi = d, i
        if best > tol_m:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def ring_area_m2(ring):
    if len(ring) < 4:
        return 0.0
    kx = 111320 * math.cos(math.radians(ring[0][1])); ky = 110540
    a = 0.0
    for i in range(len(ring) - 1):
        a += (ring[i][0] * kx) * (ring[i + 1][1] * ky) - (ring[i + 1][0] * kx) * (ring[i][1] * ky)
    return abs(a) / 2


def flat(pts):
    out = []
    for p in pts:
        out.append(round(p[0], 5)); out.append(round(p[1], 5))
    return out


def geom_pts(el):
    return [(g["lon"], g["lat"]) for g in el.get("geometry") or [] if g]


def center(el):
    if el["type"] == "node":
        return el.get("lat"), el.get("lon")
    c = el.get("center") or {}
    return c.get("lat"), c.get("lon")


def num(v):
    """'45', '45 m', '45.5m', '161000;22000' -> largest number, else None"""
    if v is None:
        return None
    best = None
    for part in str(v).replace(",", ".").split(";"):
        s = "".join(ch for ch in part.strip() if ch.isdigit() or ch == ".")
        try:
            x = float(s)
        except ValueError:
            continue
        best = x if best is None else max(best, x)
    return best


def name_of(tags):
    he = tags.get("name:he") or tags.get("name") or ""
    en = tags.get("name:en") or ""
    return he[:60], en[:60]


def stitch_rings(ways):
    """Join the outer member ways of a multipolygon into closed rings."""
    segs = [w for w in ways if len(w) >= 2]
    rings = []
    while segs:
        cur = list(segs.pop())
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[-2::-1]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[:0:-1] + cur
                else:
                    continue
                segs.pop(i); changed = True
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur)
    return rings


# ---------- builders ----------
def build(raw, cells):
    obs = {c: {"lines": [], "pts": []} for c in cells}
    pop = {c: {"built": [], "crowd": []} for c in cells}
    counts = {"lines": 0, "minor": 0, "cable": 0, "pts": 0, "tall": 0, "built": 0, "crowd": 0}

    # power lines / cableways: cut each way into per-cell pieces
    for el in raw.get("lines", []):
        t = el.get("tags") or {}
        pts = simplify(geom_pts(el), 5)
        if len(pts) < 2:
            continue
        if t.get("aerialway"):
            k = "c"; counts["cable"] += 1
        elif t.get("power") == "line":
            k = "l"; counts["lines"] += 1
        else:
            k = "m"; counts["minor"] += 1
        v = num(t.get("voltage"))
        kv = int(round(v / 1000)) if v and v >= 1000 else 0
        pieces = {}                          # cell -> list of polyline pieces inside (or crossing) it
        for a, b in zip(pts, pts[1:]):
            n = max(1, int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / 0.02) + 1)
            touched = {cell_key(a[1] + (b[1] - a[1]) * s / n, a[0] + (b[0] - a[0]) * s / n) for s in range(n + 1)}
            for c in touched:
                if c not in cells:
                    continue
                lst = pieces.setdefault(c, [])
                if lst and lst[-1][-1] == a:
                    lst[-1].append(b)
                else:
                    lst.append([a, b])
        for c, lst in pieces.items():
            for piece in lst:
                obs[c]["lines"].append({"i": el["id"], "k": k, "v": kv, "g": flat(piece)})

    def add_pt(el, kind, key):
        t = el.get("tags") or {}
        la, lo = center(el)
        if la is None:
            return
        c = cell_key(la, lo)
        if c not in cells:
            return
        h = num(t.get("height"))
        if h is None and t.get("building:levels") and kind == "bldg":
            lv = num(t.get("building:levels"))
            h = round(lv * 3.2) if lv else None      # estimate – flagged in the app as "e"
            est = 1
        else:
            est = 0
        if h is not None and (h < 8 or h > 400):
            if h < 8:
                return
            h = None
        he, en = name_of(t)
        row = {"i": f"{el['type'][0]}{el['id']}", "k": kind, "c": [round(lo, 5), round(la, 5)]}
        if h is not None:
            row["h"] = round(h)
        if est:
            row["e"] = 1
        if he:
            row["n"] = he
        if en and en != he:
            row["ne"] = en
        obs[c]["pts"].append(row); counts[key] += 1

    for el in raw.get("pts", []):
        t = el.get("tags") or {}
        mm = t.get("man_made")
        if t.get("generator:source") == "wind":
            kind = "wind"
        elif mm == "chimney":
            kind = "chim"
        elif mm == "crane":
            kind = "crane"
        elif mm == "mast" or mm == "communications_tower" or t.get("tower:type") == "communication":
            kind = "mast"
        else:
            kind = "tower"
        add_pt(el, kind, "pts")
    for el in raw.get("tall", []):
        add_pt(el, "bldg", "tall")

    # built-up polygons
    LU = {"residential": "r", "commercial": "c", "retail": "c", "industrial": "i"}
    for el in raw.get("built", []):
        t = el.get("tags") or {}
        kind = LU.get(t.get("landuse"))
        if not kind:
            continue
        if el["type"] == "way":
            rings = [geom_pts(el)]
        else:
            ways = [[(g["lon"], g["lat"]) for g in m.get("geometry") or []] for m in el.get("members") or []
                    if m.get("type") == "way" and m.get("role") in ("outer", "")]
            rings = stitch_rings(ways)
        for n, ring in enumerate(rings):
            if len(ring) < 4 or ring[0] != ring[-1] or ring_area_m2(ring) < 4000:
                continue
            ring = simplify(ring, 10)
            if len(ring) < 4:
                continue
            lats = [p[1] for p in ring]; lons = [p[0] for p in ring]
            row = {"i": f"{el['type'][0]}{el['id']}.{n}", "k": kind, "g": flat(ring)}
            done = set()
            for la in (min(lats), max(lats)):
                for lo in (min(lons), max(lons)):
                    done.add(cell_key(la, lo))
            # a big polygon can span more than its four corner cells
            la0, la1 = math.floor(min(lats) / CELL), math.floor(max(lats) / CELL)
            lo0, lo1 = math.floor(min(lons) / CELL), math.floor(max(lons) / CELL)
            for a in range(la0, la1 + 1):
                for b in range(lo0, lo1 + 1):
                    done.add(f"{a}_{b}")
            hit = False
            for c in done:
                if c in cells:
                    pop[c]["built"].append(row); hit = True
            counts["built"] += hit

    def crowd_kind(t):
        a = t.get("amenity")
        if a == "school": return "school"
        if a in ("university", "college"): return "univ"
        if a == "hospital": return "hosp"
        if a == "marketplace": return "market"
        if a == "bus_station" or t.get("railway") == "station": return "station"
        if t.get("shop") == "mall": return "mall"
        if t.get("leisure") == "stadium": return "stadium"
        if t.get("leisure") == "water_park" or t.get("tourism") in ("theme_park", "zoo"): return "park"
        if t.get("natural") == "beach": return "beach"
        return None

    for el in raw.get("crowd", []):
        t = el.get("tags") or {}
        kind = crowd_kind(t)
        la, lo = center(el)
        if not kind or la is None:
            continue
        c = cell_key(la, lo)
        if c not in cells:
            continue
        he, en = name_of(t)
        if kind == "beach" and not he and not en:
            continue                          # unnamed strips of sand are not crowd places
        row = {"i": f"{el['type'][0]}{el['id']}", "k": kind, "c": [round(lo, 5), round(la, 5)]}
        if he:
            row["n"] = he
        if en and en != he:
            row["ne"] = en
        pop[c]["crowd"].append(row); counts["crowd"] += 1
    return obs, pop, counts


def main():
    out, basemap = sys.argv[1], sys.argv[2]
    cache = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--from-cache" else None
    pbf = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--pbf" else None
    cells = wanted_cells(load_country_rings(basemap))
    print(len(cells), "cells", flush=True)
    raw, errors = {}, {}
    if pbf:
        raw = read_pbf(pbf)
        for kind in QUERIES:
            print(kind, len(raw[kind]), "elements", flush=True)
    for kind in ([] if pbf else QUERIES):
        try:
            raw[kind] = fetch(kind, cache)
            print(kind, len(raw[kind]), "elements total", flush=True)
        except Exception as e:               # noqa: BLE001
            errors[kind] = str(e)[:300]
            print("FAILED", kind, e, flush=True)
    if not any(raw.get(k) for k in ("lines", "built")):
        sys.exit("nothing fetched – keeping the previous data")
    obs, pop, counts = build(raw, cells)
    os.makedirs(os.path.join(out, "obs"), exist_ok=True)
    os.makedirs(os.path.join(out, "pop"), exist_ok=True)
    index = {"v": 1, "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "cellDeg": CELL, "bbox": BBOX,
             "counts": counts, "errors": errors, "source": "OpenStreetMap contributors (ODbL), via " + ("Geofabrik extract" if pbf else "Overpass API"), "cells": {}}
    total = 0
    for c in sorted(cells):
        o, p = obs[c], pop[c]
        entry = {}
        if o["lines"] or o["pts"]:
            body = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
            open(os.path.join(out, "obs", c + ".json"), "w", encoding="utf-8").write(body)
            entry["o"] = len(o["lines"]) + len(o["pts"]); total += len(body)
        if p["built"] or p["crowd"]:
            body = json.dumps(p, ensure_ascii=False, separators=(",", ":"))
            open(os.path.join(out, "pop", c + ".json"), "w", encoding="utf-8").write(body)
            entry["p"] = len(p["built"]) + len(p["crowd"]); total += len(body)
        index["cells"][c] = entry
    json.dump(index, open(os.path.join(out, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("counts", counts, "errors", errors, "bytes", total, flush=True)


if __name__ == "__main__":
    main()
