# -*- coding: utf-8 -*-
"""Compare the map's P/R/D + CTR geometry with the official CAAI GIS layers (the same layers the CAAI publishes for the DronesIL app family).
usage: python3 crosscheck.py <site/data/zones.json> <out crosscheck.json>"""
import json, sys, warnings
from datetime import datetime, timezone
warnings.filterwarnings("ignore")
from shapely.geometry import shape
from shapely import force_2d
from pyproj import Transformer
from shapely.ops import transform
to = Transformer.from_crs(4326, 2039, always_xy=True).transform
zones = json.load(open(sys.argv[1]))["features"]
off = json.load(open("/home/claude/build/gis_official_prd.json"))

def g(f):
    p = f["properties"]; s = shape(f["geometry"])
    if s.geom_type == "Point": return transform(to, s).buffer(p.get("radius_m", 0), 64)
    return transform(to, force_2d(s)).buffer(0)

mine = {}
for f in zones:
    d = f["properties"].get("designator")
    if d and d[:3] in ("LLP", "LLR", "LLD", "LLL") and f["properties"]["layer"] in ("prohibited", "restricted", "danger"):
        mine.setdefault(d, []).append(f)
rows = []
ALIAS = {"LLR036": "LLR36"}
for d, o in sorted(off.items()):
    if d in ALIAS: d = ALIAS[d]
    go = transform(to, force_2d(shape(o["geometry"]))).buffer(0)
    if d not in mine:
        rows.append({"id": d, "name": o["name"], "status": "missing", "modified": o["modified"]}); continue
    gm = g(mine[d][0])
    for f in mine[d][1:]: gm = gm.union(g(f))
    iou = go.intersection(gm).area / go.union(gm).area if go.union(gm).area else 0
    st = "match" if iou >= 0.95 else "minor" if iou >= 0.8 else "differs"
    if "איחוד" in ((mine[d][0]["properties"].get("sourceNote") or {}).get("he") or ""): st = "union"
    up = mine[d][0]["properties"].get("upper") or {}
    rows.append({"id": d, "name": o["name"], "status": st, "iou": round(iou, 3), "maxdev_m": int(go.hausdorff_distance(gm)),
                 "upper_official": o["max"], "upper_map": up.get("v", up.get("ref")), "modified": o["modified"],
                 "note": (mine[d][0]["properties"].get("sourceNote") or {}).get("he")})
extra = sorted(d for d in mine if d not in off and d not in ALIAS.values() and not d.startswith("LLP3") and not d.startswith("LLP1") and not d.startswith("LLP2") and d[:3] in ("LLP", "LLR", "LLD"))
from collections import Counter
c = Counter(r["status"] for r in rows)
out = {"checkedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
       "summary": {"official": len(off), "match": c["match"], "minor": c["minor"], "differs": c["differs"], "union": c["union"], "missing": c["missing"], "onlyInMap": extra},
       "rows": rows,
       "policy": {"he": "מקור מחייב: טבלאות הקואורדינטות בפמ\"ת (א'-17). שכבות ה-GIS של רת\"א משמשות לאימות, להשלמת אזורים שהגדרתם במלל לא חד-משמעית, ולהוספת מרחבי פיקוח צבאיים ומגבלות רט\"ג.",
                  "en": "Binding source: AIP A-17 tables. CAAI GIS layers are used for cross-checking and filling gaps."}}
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print(out["summary"])
for r in rows:
    if r["status"] in ("differs", "missing", "minor"): print(r)
