# -*- coding: utf-8 -*-
"""Daily DronesIL sanity check (owner-only alert, NOT shown in the app).

DronesIL (CAAI's official drone map app, Android package il.gov.rata) has no public API. The data it shows is the CAAI GIS
layer family published in AIP chapter 11 ("שכבות מידע גאוגרפיות"): F_Limited (P/R/D), CTR (civil + military CTR/CTA/ATZ)
and the RATAG KMZ (INPA nature-reserve flight limits). This script compares those official layers, freshly downloaded,
against what the live map publishes (data/zones.json), and reports only gaps that were NOT seen in previous runs.

usage: python3 dronesil_check.py <data/zones.json> <pipeline/dronesil_state.json> <out report.json> [--no-save]
inputs (built by the runbook, section D): /home/claude/raw/gis/{flimited,ctr}.geojson, /home/claude/build/gis.json,
        /home/claude/raw/aip/pdf/{אסורים_לטיסה_וCTRים.zip,RATAG_kmz.zip}
The state file keeps every gap already reported (with first-seen date), so each gap is pushed to the owner only once.
Exit code: 0 = no new gaps, 10 = new gaps (see report["new"]), 2 = inputs missing/invalid (do not trust the result)."""
import json, sys, os, hashlib, warnings
from datetime import datetime, timezone
warnings.filterwarnings("ignore")
from shapely.geometry import shape
from shapely import force_2d
from shapely.ops import transform, unary_union
from pyproj import Transformer

ZONES, STATE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SAVE = "--no-save" not in sys.argv
G = "/home/claude/raw/gis/"
ZIPS = ["/home/claude/raw/aip/pdf/אסורים_לטיסה_וCTRים.zip", "/home/claude/raw/aip/pdf/RATAG_kmz.zip"]
to_itm = Transformer.from_crs(4326, 2039, always_xy=True).transform
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def die(msg):
    json.dump({"checkedAt": NOW, "error": msg}, open(OUT, "w"), ensure_ascii=False, indent=1)
    print("ERROR:", msg); sys.exit(2)

for p in [ZONES, G + "flimited.geojson", G + "ctr.geojson", "/home/claude/build/gis.json"] + ZIPS:
    if not os.path.exists(p): die(f"missing input {p}")

def geom(f, radius=None):
    if not f.get("geometry"): return shape({"type": "Polygon", "coordinates": []})
    s = shape(f["geometry"])
    if s.geom_type == "Point": return transform(to_itm, s).buffer(radius or f["properties"].get("radius_m") or 0, 64)
    return transform(to_itm, force_2d(s)).buffer(0)

def compare(a, b):
    u = a.union(b).area
    iou = a.intersection(b).area / u if u else 0
    h = a.hausdorff_distance(b) if not (a.is_empty or b.is_empty) else float("nan")
    return round(iou, 3), (int(h) if h == h else -1)

def status(iou): return "match" if iou >= 0.95 else "minor" if iou >= 0.8 else "differs"

def upper_ft(p):
    u = p.get("upper") or {}
    return u.get("v")

zones = json.load(open(ZONES))["features"]
if len(zones) < 300: die(f"zones.json has only {len(zones)} features")
flim = json.load(open(G + "flimited.geojson"))["features"]
ctr = json.load(open(G + "ctr.geojson"))["features"]
nat = [f for f in json.load(open("/home/claude/build/gis.json"))["features"] if f["properties"]["layer"] == "nature"]
if len(flim) < 50 or len(ctr) < 10 or len(nat) < 300: die(f"official layers look truncated (P/R/D {len(flim)}, CTR {len(ctr)}, RATAG {len(nat)})")

gaps = []   # {key, kind, id, name, status, detail}
def gap(kind, id_, name, st, detail):
    gaps.append({"key": f"{kind}:{id_}:{st}", "kind": kind, "id": id_, "name": name, "status": st, "detail": detail})

# ---------------- 1. P/R/D (F_Limited) vs our prohibited/restricted/danger
ALIAS = {"LLR036": "LLR36"}
off = {}
for f in flim:
    d = (f["properties"].get("designator") or "").strip()
    if d: off.setdefault(ALIAS.get(d, d), []).append(f)
mine = {}
for f in zones:
    p = f["properties"]; d = p.get("designator")
    if d and p["layer"] in ("prohibited", "restricted", "danger"): mine.setdefault(d, []).append(f)
for d, fs in sorted(off.items()):
    p0 = fs[0]["properties"]; name = p0.get("HebrewName") or p0.get("name") or d
    go = unary_union([geom(f) for f in fs])
    if d not in mine: gap("prd", d, name, "missing", "קיים ב-DronesIL/רת\"א ולא מוצג במפה"); continue
    gm = unary_union([geom(f, f["properties"].get("radius_m")) for f in mine[d]])
    iou, dev = compare(go, gm)
    st = status(iou)
    if "איחוד" in (((mine[d][0]["properties"].get("sourceNote") or {}).get("he")) or ""): st = "union"
    if st not in ("match", "union"): gap("prd", d, name, st, f"חפיפה {iou:.0%}, סטייה מרבית {dev} מ'")
    try: om = int(float(str(p0.get("AltMax")).split("/")[0]))
    except Exception: om = None
    um = upper_ft(mine[d][0]["properties"])
    if om and um and om != um: gap("prd", d, name, f"alt{om}", f"גובה עליון ברת\"א {om} רגל, אצלנו {um} רגל")
for d in sorted(set(mine) - set(off)):
    if d[:4] in ("LLP1", "LLP2", "LLP3") or d[:3] not in ("LLP", "LLR", "LLD"): continue   # A-17 text-only areas
    gap("prd", d, (mine[d][0]["properties"].get("name") or {}).get("he", d), "extra", "מוצג במפה ולא קיים בשכבת רת\"א")

# ---------------- 2. CTR / CTA / ATZ (civil + military)
offc = {}
for f in ctr:
    p = f["properties"]; offc.setdefault(f"{p['Code']} {p['TYPE']}", []).append(f)
minec = {}
for f in zones:
    p = f["properties"]
    if p["layer"] == "ctr" and p.get("designator"):
        minec.setdefault(" ".join(p["designator"].split()[:2]), []).append(f)
for d, fs in sorted(offc.items()):
    name = fs[0]["properties"].get("Name") or d
    if d not in minec: gap("ctr", d, name, "missing", "קיים ב-DronesIL/רת\"א ולא מוצג במפה"); continue
    iou, dev = compare(unary_union([geom(f) for f in fs]), unary_union([geom(f) for f in minec[d]]))
    if status(iou) != "match": gap("ctr", d, name, status(iou), f"חפיפה {iou:.0%}, סטייה מרבית {dev} מ'")
    oa = sorted({int(float(str(f["properties"]["Max_Alt"]).split("/")[0])) for f in fs if f["properties"].get("Max_Alt")})
    ma = sorted({upper_ft(f["properties"]) for f in minec[d] if upper_ft(f["properties"])})
    if oa and ma and oa != ma: gap("ctr", d, name, "alt" + "-".join(map(str, oa)), f"גבהים ברת\"א {oa}, אצלנו {ma}")
for d in sorted(set(minec) - set(offc)):
    gap("ctr", d, d, "extra", "מוצג במפה ולא קיים בשכבת רת\"א")

# ---------------- 3. RATAG nature-reserve limits
offn, minen = {}, {}
for f in nat: offn.setdefault(f["properties"]["designator"], []).append(f)
for f in zones:
    if f["properties"]["layer"] == "nature": minen.setdefault(f["properties"]["designator"], []).append(f)
for d, fs in sorted(offn.items()):
    name = fs[0]["properties"]["name"]["he"]
    if d not in minen: gap("nature", d, name, "missing", "קיים ב-DronesIL/רת\"א ולא מוצג במפה"); continue
    iou, dev = compare(unary_union([geom(f) for f in fs]), unary_union([geom(f) for f in minen[d]]))
    if status(iou) != "match": gap("nature", d, name, status(iou), f"חפיפה {iou:.0%}, סטייה מרבית {dev} מ'")
    oa, ma = upper_ft(fs[0]["properties"]), upper_ft(minen[d][0]["properties"])
    if oa != ma: gap("nature", d, name, f"alt{oa}", f"גובה מינימלי ברת\"א {oa} רגל, אצלנו {ma} רגל")
for d in sorted(set(minen) - set(offn)):
    gap("nature", d, minen[d][0]["properties"]["name"]["he"], "extra", "מוצג במפה ולא קיים בשכבת רת\"א")

# ---------------- diff against previously reported gaps
state = json.load(open(STATE)) if os.path.exists(STATE) else {"known": {}, "sources": {}}
known = state.get("known", {})
cur = {g["key"]: g for g in gaps}
new = [g for g in gaps if g["key"] not in known]
resolved = [dict(known[k], key=k) for k in known if k not in cur]
sources = {os.path.basename(z): hashlib.sha256(open(z, "rb").read()).hexdigest() for z in ZIPS}
src_changed = sorted(k for k, v in sources.items() if state.get("sources", {}).get(k) not in (None, v))
counts = {"prd": len(off), "ctr": len(offc), "nature": len(offn)}

report = {"checkedAt": NOW, "officialCounts": counts, "openGaps": len(gaps), "new": new,
          "resolved": resolved, "sourcesChanged": src_changed, "firstRun": not state.get("known")}
json.dump(report, open(OUT, "w"), ensure_ascii=False, indent=1)

if SAVE:
    state = {"checkedAt": NOW, "sources": sources, "officialCounts": counts,
             "known": {k: {"kind": g["kind"], "id": g["id"], "name": g["name"], "status": g["status"], "detail": g["detail"],
                           "firstSeen": known.get(k, {}).get("firstSeen", NOW[:10])} for k, g in cur.items()}}
    json.dump(state, open(STATE, "w"), ensure_ascii=False, indent=1)

KIND = {"prd": "P/R/D", "ctr": "CTR/ATZ", "nature": "רט\"ג"}
print(f"official: {counts}; open gaps: {len(gaps)}; new: {len(new)}; resolved: {len(resolved)}; sources changed: {src_changed}")
for g in new: print(f"NEW  [{KIND[g['kind']]}] {g['id']} {g['name']} – {g['detail']}")
for g in resolved: print(f"GONE [{KIND[g['kind']]}] {g['id']} {g['name']}")
sys.exit(10 if new and not report["firstRun"] else 0)
