"""Shared geometry / coordinate helpers for the data build."""
import math, re

R = 6371008.8

def dms(d, m, s, hemi):
    v = float(d) + float(m) / 60 + float(s or 0) / 3600
    return -v if hemi in "SW" else v

# 31° 07' 13.65" N  |  31°07'13"N  |  3247'07"N  |  32˚39'15''N
_DMS = re.compile(r"(\d{1,3})\s*[°˚º]?\s*(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d+)?)?\s*(?:\"|''|”|″|’’)?\s*([NSEW])")
# ICAO compact 314037N0343323E / 3140N03433E
_ICAO = re.compile(r"(\d{2})(\d{2})(\d{2}(?:\.\d+)?)?([NS])\s*0?(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)?([EW])")

def parse_latlon_pair(text):
    """Return [lat, lon] from a string containing one N and one E coordinate."""
    t = text.replace("‫", "").replace("‬", "").replace("‪", "")
    m = _ICAO.search(t.replace(" ", ""))
    if m and not _DMS.search(t):
        lat = dms(m.group(1), m.group(2), m.group(3), m.group(4))
        lon = dms(m.group(5), m.group(6), m.group(7), m.group(8))
        return [lat, lon]
    found = {}
    for m in _DMS.finditer(t):
        found.setdefault(m.group(4), dms(m.group(1), m.group(2), m.group(3), m.group(4)))
    if "N" in found and "E" in found:
        return [found["N"], found["E"]]
    if m := _ICAO.search(t.replace(" ", "")):
        return [dms(m.group(1), m.group(2), m.group(3), m.group(4)), dms(m.group(5), m.group(6), m.group(7), m.group(8))]
    return None

def dest(lat, lon, brg_deg, dist_m):
    p1, l1, b, d = math.radians(lat), math.radians(lon), math.radians(brg_deg), dist_m / R
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return [math.degrees(p2), math.degrees(l2)]

def bearing(lat1, lon1, lat2, lon2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def dist(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

def arc(center, start, end, radius_m, clockwise=True, step=4):
    """Points along an arc (excluding start, including end)."""
    b0 = bearing(*center, *start); b1 = bearing(*center, *end)
    if clockwise:
        sweep = (b1 - b0) % 360
    else:
        sweep = -((b0 - b1) % 360)
    n = max(2, int(abs(sweep) / step))
    pts = [dest(*center, b0 + sweep * i / n, radius_m) for i in range(1, n)]
    return pts + [end]

def circle(center, radius_m, n=64):
    pts = [dest(*center, 360 * i / n, radius_m) for i in range(n)]
    return pts + [pts[0]]

def to_geojson_ring(latlons):
    ring = [[round(p[1], 6), round(p[0], 6)] for p in latlons]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring

def radius_m(text):
    """'1.5 ק"מ' / '500 מטר' / '3 מייל ימי' / 'חצי ק"מ' / '1.6 NM' / '1 KM' -> meters"""
    t = text.replace("‫", "").replace("‬", "")
    if "חצי ק" in t: return 500.0
    if 'ק"מ אחד' in t: return 1000.0
    m = re.search(r"(\d+(?:\.\d+)?)\s*(ק\"מ|קילומטר|KM|km|מטר|מ'|מ\b|מייל|NM|nm|M\b)", t)
    if not m: return None
    v = float(m.group(1)); u = m.group(2)
    if u in ('ק"מ', "קילומטר", "KM", "km"): return v * 1000
    if u in ("מייל", "NM", "nm", "M"): return v * 1852
    return v
