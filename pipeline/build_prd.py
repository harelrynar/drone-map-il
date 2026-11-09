"""Build Prohibited / Restricted / Danger areas + LLU (UAS-prohibited) + tethered balloons
from AIP chapter א'-17 (Hebrew, authoritative) and eAIP ENR 5.1 (geometry with arc directions)."""
import json, re, sys
sys.path.insert(0, "/home/claude/build")
from geo_util import *
from pdfrows import rows
from curated import REMARKS, CONTACTS, LLU_CONTACTS, SBS

PDF = "/home/claude/raw/aip/pdf/"
SRC_A17 = {"name": {"he": "פמ\"ת א'-17 – אזורים אסורים, מוגבלים ומסוכנים", "en": "AIP (domestic) A-17"},
           "url": "https://www.gov.il/BlobFolder/guide/aip/he/%D7%90'-17.pdf"}
SRC_ENR = {"name": {"he": "AIP ישראל ENR 5.1", "en": "AIP Israel ENR 5.1"},
           "url": "https://www.gov.il/BlobFolder/generalpage/electronic-aip/en/Full%20AIP%201-26.pdf"}

# ---------------------------------------------------------------- eAIP ENR 5.1
def parse_enr51():
    txt = open(PDF + "enr51.txt").read().split("ENR 5.2")[0]
    blocks, cur = {}, None
    for line in txt.split("\n"):
        m = re.match(r"^\s{0,3}(LL[PRD]\d+)\s", line)
        if m:
            cur = m.group(1); blocks[cur] = []
            line = line[m.end():]
        if cur:
            left = line[:62]
            blocks[cur].append(left)
    out = {}
    tok = re.compile(r"(\d{6}N\s*\d{7}E)|(counter-clockwise|clockwise)|(A circle radius\s+[\d.]+\s*(?:KM|NM))|(radius\s+[\d.]+\s*(?:KM|NM))|(centered on)")
    for k, lines in blocks.items():
        s = " ".join(lines)
        s = re.sub(r"\s+", " ", s)
        s = re.sub(r"(\d{6}N)\s+(\d{7}E)", r"\1 \2", s)
        pts, i = [], 0
        events = [(m.start(), m) for m in tok.finditer(s)]
        j = 0; pending_arc = None; circ = None
        while j < len(events):
            _, m = events[j]
            if m.group(1):
                p = parse_latlon_pair(m.group(1))
                if pending_arc and pending_arc.get("center") is None:
                    pending_arc["center"] = p
                elif pending_arc:
                    pts += arc(pending_arc["center"], pts[-1], p, pending_arc["r"], pending_arc["cw"])
                    pending_arc = None
                elif circ is not None and circ.get("center") is None:
                    circ["center"] = p
                else:
                    pts.append(p)
            elif m.group(2):
                pending_arc = {"cw": m.group(2) == "clockwise", "r": None, "center": None}
            elif m.group(3):
                circ = {"r": radius_m(m.group(3)), "center": None}
            elif m.group(4) and pending_arc is not None:
                pending_arc["r"] = radius_m(m.group(4))
            j += 1
        if circ and circ.get("center"):
            out[k] = {"circle": circ}
        elif len(pts) >= 3:
            out[k] = {"ring": pts}
    return out

# ---------------------------------------------------------------- Hebrew annex B (pages 13-25)
def parse_annex_b():
    R_ = rows(PDF + "א-17.pdf", set(range(13, 26)))
    zones, cur = {}, None
    state = {}
    def new(code, cells):
        z = {"code": code, "pts": [], "notes": []}
        # cells: [N, E, min, max, name, code] or [text, min, max, name, code]
        z["raw"] = cells
        zones[code] = z
        return z
    for r in R_:
        c = r["cells"]
        if any(x.startswith("צפון") for x in c) or c[0] in ("מזערי", "מזער") or c == ["מזרח (X)"] or c == ["שם האזור"]:
            continue
        code = None
        last = c[-1].replace("\n", " ")
        m = re.match(r"^(LL[PRD]\d+)", last.replace(" ", ""))
        if m:
            code = m.group(1)
            if "המשך" in last and code in zones:
                cur = zones[code]
            else:
                cur = new(code, c)
            state = {}
            body = c[:-4] if len(c) >= 5 else c[:1]
            cur["min"], cur["max"], cur["name"] = c[-4], c[-3], c[-2].replace("\n", " ")
        else:
            body = c
        if cur is None:
            continue
        text = " ".join(body)
        if "ENR5.1" in text.replace(" ", ""):
            cur["enr"] = True; continue
        if "מעגל" in text and "ומרכזו" in text or "גליל הצנחה שמרכזו" in text:
            cur["circle_r"] = radius_m(text) or (1000 if "1" in text else None)
            p = parse_latlon_pair(text)
            if p: cur["center"] = p
            else: state["await_center"] = True
            continue
        if "קשת" in text and ("ברדיוס" in text or "LLP13" in text):
            if "LLP13" in text:
                state["arc"] = {"center": parse_latlon_pair('31° 47\' 04" N 35° 12\' 34" E'), "r": 6000, "cw": False}
            else:
                p = parse_latlon_pair(text)
                state["arc"] = {"center": p, "r": radius_m(text), "cw": None}
                if not p: state["await_arc_center"] = True
            continue
        if "הקשת מסתיימת" in text or "לאורך הגבול" in text or "קטום" in text or "נתחם" in text or "חצי מעגל" in text:
            cur["notes"].append(text);
            if "חצי מעגל" in text: state["await_center"] = True; cur["half"] = True
            continue
        p = parse_latlon_pair(text)
        if p:
            if state.pop("await_center", False):
                cur["center"] = p; continue
            if state.pop("await_arc_center", False):
                state["arc"]["center"] = p; continue
            if "arc" in state:
                cur["pts"].append({"arc": state.pop("arc"), "to": p})
            else:
                cur["pts"].append(p)
        elif text.strip():
            cur["notes"].append(text)
    return zones

def build_ring(z, enr):
    """Return (ring_latlon or None, circle or None)."""
    code = z["code"]
    has_arc = any(isinstance(p, dict) for p in z["pts"])
    plain = [p for p in z["pts"] if not isinstance(p, dict)]
    # Hebrew A-17 table is the binding source; eAIP only where the Hebrew row refers to ENR 5.1 or contains arcs
    if code in enr and (z.get("enr") or has_arc or (len(plain) < 3 and not z.get("center"))):
        e = enr[code]
        if "circle" in e: return None, e["circle"]
        return e["ring"], None
    if z.get("center") and z.get("circle_r") and not z["pts"]:
        return None, {"center": z["center"], "r": z["circle_r"]}
    ring = []
    for p in z["pts"]:
        if isinstance(p, dict):
            a = p["arc"]; start = ring[-1]
            cw = a["cw"]
            if cw is None:  # unknown: choose the major arc (truncated-circle shapes)
                b0 = bearing(*a["center"], *start); b1 = bearing(*a["center"], *p["to"])
                cw = ((b1 - b0) % 360) > 180
            ring += arc(a["center"], start, p["to"], a["r"], cw)
        else:
            ring.append(p)
    # drop anything after the ring closes back on its first point
    for i in range(3, len(ring)):
        if dist(*ring[i], *ring[0]) < 30:
            ring = ring[: i + 1]; break
    return (ring if len(ring) >= 3 else None), None

def limit(v):
    v = (v or "").replace("\n", "").replace(" ", "").replace(",", "")
    if v in ("GND", "MSL/GND", "MSL", "GND/MSL", "SFC"): return {"ref": "SFC"}
    if v == "UNL": return {"ref": "UNL"}
    m = re.search(r"(-?\d+)", v.replace("(-)", "-"))
    return {"v": int(m.group(1)), "u": "ft", "ref": "AMSL"} if m else None

def descriptions():
    """Pull the paragraph for each code from the A-17 text (rules, contacts)."""
    s = open(PDF + "א-17.txt").read().replace("‫", "").replace("‬", "").replace("‪", "")
    s = s.split("נספח ב'* – קואורדינטות")[0]
    s = re.sub(r".*רשות התעופה האזרחית.*\n", "", s)
    s = re.sub(r".*פמ\"ת פנים ארצי.*\n", "", s)
    flat = re.sub(r"\s*\n\s*", " ", s)
    out = {}
    for m in re.finditer(r"(LL[PRDU]\d+)", flat):
        code = m.group(1)
        if code in out: continue
        seg = flat[max(0, m.start() - 6): m.start() + 700]
        nxt = re.search(r"\s(?:[א-ת]{1,2}\.\s+)?(?:\d+\)\s*)?,?\s*LL[PRDU]\d+|\s\.\d\s|\s\d\.\s", seg[12:])
        if nxt: seg = seg[: nxt.start() + 12]
        out[code] = seg.strip(" ,.")
    return out

PHONE = re.compile(r"0\d{1,2}-\d{7}|05\d-\d{7}")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")

def contacts_from(text):
    c = [{"label": {"he": "תיאום", "en": "Coordination"}, "value": p, "type": "phone"} for p in dict.fromkeys(PHONE.findall(text))]
    c += [{"label": {"he": "דוא\"ל", "en": "Email"}, "value": e.rstrip("."), "type": "email"} for e in dict.fromkeys(EMAIL.findall(text))]
    return c

def main():
    enr = parse_enr51()
    ann = parse_annex_b()
    feats, log = [], []
    # manual fixes for rows whose designator cell is vertically mis-aligned in the PDF table
    fix_41_42()
    for code, z in ann.items():
        if code in MANUAL: z.update(MANUAL[code])
        ring, circ = build_ring(z, enr)
        if code in ("LLD37", "LLD38"): ring = [[0, 0]] * 3
        layer = {"P": "prohibited", "R": "restricted", "D": "danger"}[code[2]]
        name = (z.get("name") or "").strip('"')
        props = {
            "id": code.lower(), "layer": layer, "designator": code,
            "name": {"he": f"{code} – {name}", "en": code},
            "status": "active",
            "lower": limit(z.get("min")), "upper": limit(z.get("max")),
            "valid": {}, "source": SRC_A17, "confidence": "exact",
        }
        if code in REMARKS:
            props["remarks"] = {"he": REMARKS[code][0], "en": REMARKS[code][1]}
        if code in CONTACTS:
            props["contact"] = CONTACTS[code]
        if layer == "restricted" and code in FIRE_AREAS:
            props["valid"]["schedule"] = {"he": "שטחי אש: א' 06:00 עד ה' 21:00 (ערב חג עד 14:00) או לפי NOTAM", "en": "Firing areas: Sun 06:00 – Thu 21:00 (holiday eve until 14:00) or per NOTAM"}
        if code in APPROX:
            props["confidence"] = "approx"; props["approxReason"] = {"he": APPROX[code], "en": "Boundary simplified from the AIP description."}
        if circ:
            geom = {"type": "Point", "coordinates": [round(circ["center"][1], 6), round(circ["center"][0], 6)]}
            props["radius_m"] = round(circ["r"])
        elif ring:
            geom = {"type": "Polygon", "coordinates": [to_geojson_ring(ring)]}
        else:
            log.append(f"NO GEOMETRY {code} {z.get('notes')}"); continue
        if code in ("LLD37", "LLD38"):
            geom = half_disc(code); props.pop("radius_m", None)
        if z.get("half_north") and z.get("center"):
            c = z["center"]; pts = [c] + [dest(*c, b, 3000) for b in range(-90, 91, 6)] + [c]
            geom = {"type": "Polygon", "coordinates": [to_geojson_ring(pts)]}; props.pop("radius_m", None)
        feats.append({"type": "Feature", "geometry": geom, "properties": props})
    feats += llu(None) + balloons()
    feats = apply_official(feats)
    for l in log: print(l, file=sys.stderr)
    return feats

FIRE_AREAS = {"LLR24", "LLR30", "LLR36", "LLR100", "LLR309", "LLR500", "LLR502", "LLR504", "LLR520", "LLR589", "LLR618", "LLR900", "LLR921", "LLR804", "LLR805"}
APPROX = {
    "LLR27": "בפמ\"ת: 'צפונה לאורך הגבול בין ישראל למצרים' – הקטע לאורך הגבול מוצג כקו ישר.",
    "LLD28": "חצי מעגל צפוני ברדיוס 3 ק\"מ, קטום במזרח לאורך כביש 4 ומסילת הרכבת – הקטימה אינה מוצגת.",
    "LLD29": "נ\"צ המרכז בטבלת הפמ\"ת משובש בטקסט; נלקח נ\"צ מנחת באר שבע (31°17'13\"N 34°43'22\"E).",
    "LLD37": "גליל ברדיוס 2.5 ק\"מ, מערבית לקו ציר המסלול 15/33.",
    "LLD38": "גליל ברדיוס 2.5 ק\"מ, מזרחית לקו ציר המסלול 15/33.",
}
def _p(t): return parse_latlon_pair(t)
MANUAL = {
    "LLD29": {"center": [31 + 17/60 + 13/3600, 34 + 43/60 + 22/3600], "circle_r": 5000, "pts": []},
    # PDF table rows for LLP41/LLP42 are mis-aligned: the four points belong to Plugot, the circle to Tsofar
    "LLP41": {"pts": [_p('31° 37\' 45.25" N 34° 45\' 27.49" E'), _p('31° 38\' 32.21" N 34° 45\' 30.20" E'),
                      _p('31° 38\' 49.52" N 34° 44\' 24.08" E'), _p('31° 38\' 13.77" N 34° 44\' 16.36" E')], "max": "1100", "min": "GND", "name": "פלוגות"},
    "LLP42": {"pts": [], "center": _p('30° 33\' 06.00" N 35° 11\' 55.00" E'), "circle_r": 1000, "max": "2000", "min": "GND", "name": "בלון צופר"},
    "LLD28": {"pts": [], "circle_r": 3000, "half_north": True},
    # table text '100 מטר' is garbled in the PDF (parsed as 1 km); CAAI GIS layer confirms 100 m
    "LLP44": {"circle_r": 100},
}
def fix_41_42():
    pass  # handled in post-processing (see fix_rows)

OFFICIAL_GEOM = {"LLD28": "בפמ\"ת: חצי מעגל צפוני קטום לאורך כביש 4 ומסילת הרכבת – הגבול המדויק נלקח משכבת ה-GIS של רת\"א.",
                 "LLR27": "בפמ\"ת: 'צפונה לאורך הגבול' – הקטע לאורך הגבול נלקח משכבת ה-GIS של רת\"א."}
NEW_IN_GIS = {"LLP29", "LLP33", "LLR31"}           # newer than the A-17 text (GIS modified 08/2026)
OLD_IN_GIS = {"LLP31", "LLP32", "LLR107", "LLR120", "LLR601", "LLL1", "LLL2"}   # in GIS layer, not in current A-17
def apply_official(feats):
    import os
    p = "/home/claude/build/gis_official_prd.json"
    if not os.path.exists(p): return feats
    off = json.load(open(p))
    by = {f["properties"]["designator"]: f for f in feats}
    for code, why in OFFICIAL_GEOM.items():
        if code in by and code in off:
            f = by[code]; f["geometry"] = off[code]["geometry"]; f["properties"].pop("radius_m", None)
            f["properties"]["confidence"] = "exact"; f["properties"].pop("approxReason", None)
            f["properties"]["sourceNote"] = {"he": why, "en": "Boundary from the CAAI GIS layer."}
    from shapely.geometry import shape as _sh
    for code, f in by.items():
        if f["geometry"]["type"] == "Polygon" and code in off and not _sh(f["geometry"]).is_valid:
            f["geometry"] = off[code]["geometry"]
            f["properties"]["sourceNote"] = {"he": "סדר הנקודות בטבלת הפמ\"ת יוצר צורה לא תקינה; הגבול נלקח משכבת ה-GIS של רת\"א.", "en": "Invalid ring in the AIP table; CAAI GIS boundary used."}
            print("INVALID -> official", code)
    # conservative: where the AIP table and the CAAI GIS layer disagree noticeably, show the union of both
    from shapely.geometry import mapping as _mp
    from shapely import force_2d as _f2
    from pyproj import Transformer as _T
    from shapely.ops import transform as _tr
    _to = _T.from_crs(4326, 2039, always_xy=True).transform
    _bk = _T.from_crs(2039, 4326, always_xy=True).transform
    for code, f in by.items():
        if code not in off or f["properties"].get("sourceNote"): continue
        gp = f["geometry"]; sh = _sh(gp)
        gm = _tr(_to, sh).buffer(f["properties"].get("radius_m", 0), 64) if sh.geom_type == "Point" else _tr(_to, sh).buffer(0)
        go = _tr(_to, _f2(_sh(off[code]["geometry"]))).buffer(0)
        iou = go.intersection(gm).area / go.union(gm).area
        if iou < 0.9:
            u = _tr(_bk, go.union(gm).buffer(0))
            if u.geom_type == "MultiPolygon": u = max(u.geoms, key=lambda x: x.area)
            f["geometry"] = {"type": "Polygon", "coordinates": [[[round(x, 6), round(y, 6)] for x, y in u.exterior.coords]]}
            f["properties"].pop("radius_m", None)
            f["properties"]["sourceNote"] = {"he": f"טבלת הפמ\"ת ושכבת ה-GIS של רת\"א אינן זהות (חפיפה {round(iou*100)}%). מטעמי זהירות מוצג האיחוד של שתיהן.",
                                             "en": f"AIP table and CAAI GIS layer differ (overlap {round(iou*100)}%); union shown."}
            print("UNION", code, round(iou, 3))
    for code in sorted(NEW_IN_GIS | OLD_IN_GIS):
        if code not in off or code in by: continue
        o = off[code]
        layer = {"P": "prohibited", "R": "restricted", "D": "danger", "L": "prohibited"}.get((o["type"] or "P")[0], "prohibited")
        lo = {"ref": "SFC"} if not o["min"] or str(o["min"]) == "0" else {"v": int(float(o["min"])), "u": "ft", "ref": "AMSL"}
        mx = str(o["max"] or "").split("/")[0].strip()
        up = {"ref": "UNL"} if mx in ("99000", "") else {"v": int(float(mx)), "u": "ft", "ref": "AMSL"}
        note = (f"מופיע בשכבת ה-GIS הרשמית של רת\"א (עודכנה {o['modified']}) ועדיין לא בטבלאות פרק א'-17. יש לבדוק NOTAM/פמ\"ת."
                if code in NEW_IN_GIS else
                f"מופיע בשכבת ה-GIS של רת\"א (עודכן {o['modified']}) אך לא בפרק א'-17 העדכני – ייתכן שאינו בתוקף. מוצג מטעמי זהירות.")
        feats.append({"type": "Feature", "geometry": o["geometry"], "properties": {
            "id": code.lower(), "layer": layer, "designator": code, "name": {"he": f"{code} – {o['name'] or ''}", "en": code},
            "status": "active", "lower": lo, "upper": up, "valid": {}, "confidence": "exact",
            "source": {"name": {"he": "רת\"א – שכבות מידע גאוגרפיות (אזורים אסורים, מוגבלים ומסוכנים)", "en": "CAAI GIS layer"},
                       "url": "https://www.gov.il/he/pages/aip?chapterIndex=11"},
            "sourceNote": {"he": note, "en": "From the CAAI GIS layer; not in the current A-17 tables."}}})
    return feats

def half_disc(code):
    from shapely.geometry import Point, Polygon, LineString
    from shapely.ops import split
    c = [32 + 58/60 + 58/3600, 35 + 34/60 + 32/3600]
    ring = circle(c, 2500, 96)
    poly = Polygon([(p[1], p[0]) for p in ring])
    a = (35 + 35/60 + 8/3600, 32 + 57/60 + 43/3600); b = (35 + 33/60 + 33/3600, 33 + 0/60 + 2/3600)
    # extend the cut line
    dx, dy = b[0] - a[0], b[1] - a[1]
    line = LineString([(a[0] - dx * 3, a[1] - dy * 3), (b[0] + dx * 3, b[1] + dy * 3)])
    parts = sorted(split(poly, line).geoms, key=lambda g: g.centroid.x)
    g = parts[0] if code == "LLD37" else parts[-1]
    return {"type": "Polygon", "coordinates": [[[round(x, 6), round(y, 6)] for x, y in g.exterior.coords]]}

def llu(desc):
    R_ = rows(PDF + "א-17.pdf", {26, 27, 28, 29})
    out = []
    for r in R_:
        c = r["cells"]
        if len(c) < 4 or not re.match(r"LLU\d+", c[-1]): continue
        code = c[-1]; name = c[-2].replace("\n", " ")
        p = parse_latlon_pair(c[0] + " " + c[1])
        rtxt = c[2]
        rad = radius_m(rtxt)
        conf, why = "exact", None
        if not rad:
            rad = 500; conf = "approx"
            why = {"he": f"בפמ\"ת מוגדר '{rtxt}' ללא רדיוס בטבלה – מוצג ברדיוס ברירת המחדל 500 מ'.", "en": "Defined as an airspace without radius in the table; shown with the default 500 m radius."}
        n = int(code[3:])
        upper = {"v": 300, "u": "ft", "ref": "AGL"} if 59 <= n <= 72 else ({"v": 3000, "u": "ft", "ref": "AMSL"} if code == "LLU21" else {"v": 1000, "u": "ft", "ref": "AGL"})
        cts = LLU_CONTACTS.get(code) or (SBS if n <= 58 else [])
        props = {"id": code.lower(), "layer": "uasProhibited", "designator": code,
                 "name": {"he": f"{code} – {name}", "en": code}, "status": "active",
                 "lower": {"ref": "SFC"}, "upper": upper, "valid": {}, "radius_m": round(rad),
                 "source": SRC_A17, "confidence": conf,
                 "remarks": {"he": "אסור לכטב\"ם וטיסן עד 25 ק\"ג בקשר עין, ולתעופה ספורטיבית ומסוקים מחוץ לנתיבים. טיסה בתוך האזור רק באישור בכתב מהגורם האחראי (בדרך כלל שירות בתי הסוהר, אלא אם צוין אחרת).",
                             "en": "No-fly for UAS/model aircraft <25 kg (VLOS), sport aviation and helicopters off published routes. Written approval from the responsible body required."},
                 "contact": cts}
        if why: props["approxReason"] = why
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p[1], 6), round(p[0], 6)]}, "properties": props})
    return out

def balloons():
    R_ = rows(PDF + "א-17.pdf", {30})
    out = []
    for r in R_:
        c = r["cells"]
        if len(c) < 6 or not c[-1].startswith("LLP3"): continue
        p = parse_latlon_pair(c[0] + c[1])
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p[1], 6), round(p[0], 6)]},
                    "properties": {"id": c[-1].lower(), "layer": "prohibited", "designator": c[-1],
                                   "name": {"he": f"{c[-1]} – בלון מעוגן ({c[-3]})", "en": f"{c[-1]} – tethered balloon"},
                                   "status": "active", "lower": {"ref": "SFC"},
                                   "upper": {"v": int(c[-4].replace(",", "")), "u": "ft", "ref": "AMSL"},
                                   "radius_m": round(float(c[2]) * 1852), "valid": {}, "source": SRC_A17, "confidence": "exact",
                                   "remarks": {"he": "מכשול קבוע – בלון מעוגן (נספח ד' לפרק א'-17).", "en": "Permanent obstacle – tethered balloon."}}})
    return out

if __name__ == "__main__":
    feats = main()
    # post-fix: LLP41/LLP42 rows are swapped in the PDF table layout
    by = {f["properties"]["designator"]: f for f in feats}
    json.dump({"type": "FeatureCollection", "features": feats}, open("/home/claude/build/prd.json", "w"), ensure_ascii=False)
    from collections import Counter
    print(len(feats), Counter(f["properties"]["layer"] for f in feats))
    for f in feats:
        p = f["properties"]; g = f["geometry"]
        n = len(g["coordinates"][0]) if g["type"] == "Polygon" else f"r={p.get('radius_m')}"
        print(p["designator"], p["name"]["he"][:40], g["type"], n, p.get("lower"), p.get("upper"), p["confidence"])
