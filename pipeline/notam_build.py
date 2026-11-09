# -*- coding: utf-8 -*-
"""NOTAM -> map features.
usage: python3 notam_build.py <raw_notams.json> <basemap.json> <prev_notams.json|-> <out_notams.json>
Raw input: list of {id, loc, Airfield, FromDate, ToDate, raw} (see notam_fetch.py).
Each NOTAM becomes: a located feature (exact geometry from the text, or an *approximate* area marked confidence=approx
with a quote of the NOTAM), or an entry in `unlocated` (general / non-geographic / not relevant to the map)."""
import json, re, sys, math, warnings
warnings.filterwarnings("ignore")
from datetime import datetime, timezone
sys.path.insert(0, "/home/claude/build")
from geo_util import parse_latlon_pair, circle, dest, to_geojson_ring
from shapely.geometry import shape, Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union

SRC = {"name": {"he": "נוטאם – רשות שדות התעופה", "en": "NOTAM – IAA"}, "url": "https://brin.iaa.gov.il/aeroinfo/AeroInfo.aspx?msgType=Notam"}

AD = {"LLBG": ([32.0094, 34.8856], "נתב\"ג"), "LLER": ([29.7272, 35.0142], "נמל התעופה רמון"), "LLHA": ([32.8097, 35.0439], "נמל התעופה חיפה"),
      "LLHZ": ([32.1794, 34.8344], "שדה התעופה הרצליה"), "LLIB": ([32.9808, 35.5719], "שדה התעופה ראש פינה"), "LLKS": ([33.2142, 35.5942], "מנחת קרית שמונה"),
      "LLMG": ([32.5972, 35.2347], "מנחת מגידו"), "LLMZ": ([31.3292, 35.3883], "מנחת מצדה"), "LLEY": ([30.6217, 35.2031], "מנחת עין יהב"),
      "LLBS": ([31.2869, 34.7228], "מנחת באר שבע"), "LLFK": ([32.7853, 35.7172], "מנחת פיק"), "LLES": ([32.4414, 35.0033], "מנחת עין שמר"),
      "LLRS": ([31.9675, 34.7536], "מנחת ראשון לציון"), "LLBO": ([32.6542, 34.9339], "מנחת הבונים"), "LLKZ": ([30.8592, 34.4433], "מנחת קציעות"),
      "LLOV": ([29.9403, 34.9358], "עובדה")}
PLACES = {"ASHKELON": "אשקלון", "NES-HARIM": "נס הרים", "GOLAN HEIGHTS": "רמת הגולן", "HACHULA-LAKE": "אגם החולה", "BAT-SHLOMO": "בת שלמה",
          "SHUNRAH": "שונרה", "KELACH": "כלח", "YERUHAM": "ירוחם", "REVIVIM": "רביבים", "RAMAT-BEKA": "רמת בקע", "EL-AL JUNCTION": "צומת אל על",
          "HERTZELIYA": "הרצליה", "NESHER": "נשר", "KFAR-SABA": "כפר סבא", "MACCABIM": "מכבים", "TAANACHIM AND GADISH": "תענכים וגדיש",
          "MAGEN-SHAUL": "מגן שאול", "KESARYA": "קיסריה", "PARK-REEM": "פארק רעים", "EITANIM-HOSPITAL": "בי\"ח איתנים", "GEZER POWER PLANT": "תחנת הכוח גזר",
          "YAHUD/IAI INDUSTRY": "יהוד / התעשייה האווירית", "ASHDOD": "אשדוד", "GOLANI-INTERCHANGE": "מחלף גולני", "MOLEDET-CENTER": "מולדת",
          "NAURA": "נאעורה", "LATRUN": "לטרון", "OR-AKIVA INDUSTRY AREA": "אזה\"ת אור עקיבא", "METZADA": "מצדה", "GAZA-STRIP": "רצועת עזה"}

def ts(s):
    if not s or not re.match(r"\d{10,12}$", s): return None
    s = s[-10:]
    return datetime(2000 + int(s[0:2]), int(s[2:4]), int(s[4:6]), int(s[6:8]), int(s[8:10]), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

def fields(raw):
    t = raw.replace("\r", "")
    out = {}
    for k in "QABCDEFG":
        m = re.search(r"(?:^|\s|\n)" + k + r"\)\s*(.*?)(?=(?:\s|\n)[A-G]\)\s|\Z)", t, re.S)
        if m: out[k] = m.group(1).strip().rstrip(")").strip()
    return out

def parse_q(q):
    m = re.match(r"(\w+)/(Q\w{4})/(\w*)\s*/(\w*)\s*/(\w*)\s*/(\d{3})/(\d{3})/(\d{4}[NS]\d{5}[EW])(\d{3})", q.replace(" ", "")) if q else None
    if not m: return None
    g8 = m.group(8); c = parse_latlon_pair(g8[:4] + "00" + g8[4] + g8[5:10] + "00" + g8[10])
    return {"code": m.group(2), "lower_ft": int(m.group(6)) * 100, "upper_ft": int(m.group(7)) * 100, "center": c, "radius_nm": int(m.group(9))}

COORD = re.compile(r"(\d{6}(?:\.\d+)?[NS]\s*\d{7}(?:\.\d+)?[EW])|([NS]\d{6}[EW]\d{7})")
def coords(text):
    out = []
    for m in COORD.finditer(text.replace("\n", " ")):
        s = m.group(0).replace(" ", "")
        if s[0] in "NS":  # N314945E0345822 style
            s = s[1:7] + s[0] + s[8:15] + s[7]
        p = parse_latlon_pair(s)
        if p: out.append(p)
    return out

def radius_m(text):
    m = re.search(r"WI\s+(\d+(?:\.\d+)?)\s*(NM|KM|M)\s+RADIUS", text) or re.search(r"(\d+(?:\.\d+)?)\s*(NM|KM|M)\s+RADIUS", text)
    if not m: return None
    v = float(m.group(1)); u = m.group(2)
    return v * 1852 if u == "NM" else v * 1000 if u == "KM" else v

def limits(f, e, q):
    def conv(s):
        s = s.replace(",", "").strip()
        if re.match(r"^(GND|SFC)", s): return {"ref": "SFC"}
        if re.match(r"^UNL", s): return {"ref": "UNL"}
        m = re.match(r"FL\s*(\d+)", s)
        if m: return {"v": int(m.group(1)), "u": "FL", "ref": "FL"}
        m = re.match(r"(\d+)\s*(FT|M)?\s*(AMSL|AGL|MSL)?", s)
        if m: return {"v": int(m.group(1)), "u": "m" if m.group(2) == "M" else "ft", "ref": "AGL" if m.group(3) == "AGL" else "AMSL"}
        return None
    lo = conv(f["F"]) if f.get("F") else None
    up = conv(f["G"]) if f.get("G") else None
    if not up:
        m = re.search(r"UP\s*(?:TO)?\s*([\d,]+)\s*(FT)?\s*(AMSL|AGL)?", e) or re.search(r"UP TO\s+[\d.]+M\s+AGL\s+([\d,]+)\s*FT\s*(AMSL)", e)
        m2 = re.search(r"UP TO\s+[\d.,]+\s*M(?:\s+AGL)?,?\s+([\d,]+)\s*FT\s+AMSL", e) or re.search(r"UP TO\s+([\d,]+)\s*FT\s+AMSL", e)
        if m2: up = {"v": int(m2.group(1).replace(",", "")), "u": "ft", "ref": "AMSL"}
        elif m:
            up = {"v": int(m.group(1).replace(",", "")), "u": "ft", "ref": m.group(3) or "AMSL"}
        elif q:
            up = {"v": q["upper_ft"], "u": "ft", "ref": "AMSL"} if q["upper_ft"] < 99900 else {"ref": "UNL"}
    if not lo:
        if re.search(r"FM (GND|SFC|THE GROUND)", e) or (q and q["lower_ft"] == 0): lo = {"ref": "SFC"}
        elif q: lo = {"v": q["lower_ft"], "u": "ft", "ref": "AMSL"}
    agl = re.search(r"UP TO\s+([\d.,]+)\s*M\s+AGL", e)
    return lo, up, (float(agl.group(1).replace(",", "")) if agl else None)

# ---------------------------------------------------------------- classification
SKIP_PREFIX = ("QKK", "QOA", "QC", "QN", "QP", "QS", "QM", "QFU", "QAN", "QL", "QI", "QG")
def kind(code, e):
    if "UAS" in e and ("PROHIBI" in e or "PROHIBIR" in e) and ("FIR" in e): return "general"
    if code.startswith("QW") and ("FIR" in e and "RADIUS" not in e and "BTN" not in e): return "general"
    if code.startswith("QFA"): return "ad"
    if code.startswith(SKIP_PREFIX): return "other"
    if code.startswith("QAR"): return "other"     # CVFR / ultralight routes – not drawn
    return "area"

def what(e, code):
    E = e.upper()
    head = E.split(" EXC")[0]
    if "BOUNDRAY" in head or "BOUNDARY" in head: return "אזור סמוך לגבול", "Border area"
    if re.search(r"AN AREA .*CLSD", head) and not re.search(r"\bUAS|UAV", head): return "אזור סגור לטיסה", "Area closed to flights"
    E = head
    if "CAPTIVE BALLOON" in E: return "בלון מעוגן", "Captive balloon"
    if "HOT-AIR BALLOON" in E: return "איסור הפעלת כדורים פורחים", "Hot-air balloon ops prohibited"
    if re.search(r"\bUAS|UAV|MODEL ACFT", E):
        if "PROHIBIT" in E: return "איסור הפעלת כטב\"ם וטיסנים", "UAS/model aircraft prohibited"
        return "פעילות כטב\"ם", "UAS activity"
    if "PJE" in E: return "הצנחות", "Parachute jumping"
    if "CRANE" in E: return "עגורן", "Crane"
    if "DRILLING TOWER" in E: return "מגדל קידוח", "Drilling tower"
    if "OBST" in E: return "מכשול", "Obstacle"
    if "FRNG" in E or "FIRING" in E: return "ירי", "Firing"
    if "GAS EMISSION" in E: return "פליטת גז", "Gas emission"
    if "TRG AREA" in E and "CLSD" in E: return "אזור אימון סגור", "Training area closed"
    if "ULTRALIGHT BUBBLE" in E: return "בועת אז\"ם", "Ultralight bubble"
    if "BOUNDRAY" in E or "BOUNDARY" in E: return "אזור סמוך לגבול", "Border area"
    if "CLSD" in E: return "אזור סגור לטיסה", "Area closed to flights"
    if "ACTIVATED" in E: return "הפעלת אזור", "Area activated"
    return "הגבלה זמנית", "Temporary restriction"

def place(e):
    m = re.search(r"\bAT ([A-Z][A-Z\-/ ]+?)(?:[,.]| WI | FM | UP | DRG| BTN | CLSD| AN | CTR|$)", e)
    if not m: return None, None
    p = m.group(1).strip()
    return PLACES.get(p, p.title()), p.title()

def fmt_lim(l):
    if not l: return "?"
    if l["ref"] == "SFC": return "פני הקרקע"
    if l["ref"] == "UNL": return "ללא הגבלה"
    if l["u"] == "FL": return f"FL{l['v']:03d}"
    return f"{l['v']:,} {'מ' if l['u'] == 'm' else 'רגל'} {'מעל הקרקע' if l['ref'] == 'AGL' else 'מעל פני הים'}"

EXCEPT = [("AGRICULTURE", "טיסות חקלאיות"), ("MEDEVAC", "פינוי רפואי"), ("POLICE", "משטרה"), ("FIREFIGHTING", "כיבוי אש"), ("PPR FLT FM IAF", "טיסות באישור חה\"א")]
def summary_he(e, w_he, pl, lo, up, agl):
    s = w_he + (f" ב{pl}" if pl and not pl.startswith("ב") else (f" {pl}" if pl else ""))
    if lo or up:
        s += f" – מ{fmt_lim(lo)} עד {fmt_lim(up)}"
        if agl: s += f" (עד {agl:g} מ' מעל הקרקע)"
    if "TO ALL FLT" in e: s += ". סגור לכל כלי הטיס"
    ex = [h for k, h in EXCEPT if k in e and ("EXC" in e or "AVBL" in e)]
    if ex: s += " (למעט " + ", ".join(ex) + ")"
    if "CTN ADZ" in e: s += ". יש לנקוט זהירות"
    return s + "."

# ---------------------------------------------------------------- approximate geometries
def border_strip(basemap, other, km, side_note):
    """Area inside Israel (+West Bank/Golan) within km of the border with `other` (ISO3). Approximate (1 km basemap)."""
    from pyproj import Transformer
    from shapely.ops import transform
    C = {f["properties"]["id"]: shape(f["geometry"]) for f in basemap["countries"]["features"]}
    isr = unary_union([C["ISR"], C.get("PSE", Polygon())]).buffer(0)
    oth = C[other].buffer(0)
    to = Transformer.from_crs(4326, 2039, always_xy=True).transform
    back = Transformer.from_crs(2039, 4326, always_xy=True).transform
    i2, o2 = transform(to, isr), transform(to, oth)
    line = i2.buffer(50).intersection(o2.buffer(50))
    if other == "SYR":  # Golan is part of the ISR polygon in the basemap only partly – use the eastern Golan edge
        pass
    strip = line.buffer(km * 1000).intersection(i2)
    g = transform(back, strip)
    if g.geom_type == "MultiPolygon": g = max(g.geoms, key=lambda x: x.area)
    return g

def north_of_roads(basemap):
    """'N OF ROAD NR 85 AND ROAD NR 91' – approximated by a line Acre–Karmiel–Rosh Pina–Mahanayim–Golan."""
    C = {f["properties"]["id"]: shape(f["geometry"]) for f in basemap["countries"]["features"]}
    isr = C["ISR"].buffer(0)
    road = [(35.07, 32.925), (35.30, 32.915), (35.50, 32.925), (35.565, 32.975), (35.63, 33.01), (35.75, 33.03), (35.90, 33.05)]
    north = Polygon(road + [(35.90, 33.40), (35.07, 33.40)])
    g = north.intersection(isr)
    if g.geom_type == "MultiPolygon": g = max(g.geoms, key=lambda x: x.area)
    return g

def semicircle(center, r, frm, to):
    pts = [center] + [dest(*center, b, r) for b in range(frm, to + 1, 5)] + [center]
    return Polygon([(p[1], p[0]) for p in pts])

def geom_of(g):
    if g.geom_type == "Polygon":
        return {"type": "Polygon", "coordinates": [[[round(x, 5), round(y, 5)] for x, y in g.exterior.coords]]}
    return {"type": "MultiPolygon", "coordinates": [[[[round(x, 5), round(y, 5)] for x, y in p.exterior.coords]] for p in g.geoms]}

# ---------------------------------------------------------------- main
def build(raw_list, basemap, ai=None):
    ai = ai or {}
    located, unlocated = [], []
    for n in raw_list:
        raw = n.get("raw") or n.get("preview", "")
        f = fields(raw)
        e = re.sub(r"\s+", " ", f.get("E", n.get("preview", "")))
        q = parse_q(f.get("Q", ""))
        code = q["code"] if q else "Q????"
        nid = n["id"]
        valid = {"from": ts(n.get("FromDate")) or ts((f.get("B") or "").strip()), "to": ts(n.get("ToDate")) or ts((f.get("C") or "").strip().split()[0] if f.get("C") else "")}
        if f.get("C", "").startswith("PERM"): valid["to"] = None
        if f.get("D"): valid["schedule"] = {"he": "שעות פעילות (UTC): " + f["D"], "en": "Schedule (UTC): " + f["D"]}
        k = kind(code, e)
        w_he, w_en = what(e, code)
        pl_he, pl_en = place(e)
        lo, up, agl = limits(f, e, q)
        base = {"id": "notam-" + nid.replace("/", "-").lower(), "layer": "notam", "designator": nid,
                "status": "active", "valid": valid, "source": SRC, "lower": lo, "upper": up,
                "notam": {"id": nid, "raw": raw.strip(), "q": f.get("Q"), "loc": n.get("loc")}}
        name_he = f"{w_he}{' – ' + pl_he if pl_he else ''}"
        name_en = f"{w_en}{' – ' + pl_en if pl_en else ''}"
        summ = summary_he(e, w_he, pl_he, lo, up, agl)

        if k in ("general", "other"):
            o = ai.get(nid, {})
            unlocated.append({"id": nid, "kind": o.get("kind", k), "summary": {"he": o.get("summary_he", summ if k == "general" else name_he), "en": name_en},
                              "valid": valid, "raw": raw.strip(), "code": code})
            continue
        if k == "ad":
            loc = (f.get("A") or n.get("loc") or "").split()[0]
            adname = AD.get(loc, (None, loc))[1]
            unlocated.append({"id": nid, "kind": "ad", "summary": {"he": f"{adname} ({loc}) סגור" + (" – " + valid["schedule"]["he"] if valid.get("schedule") else ""), "en": e},
                              "valid": valid, "raw": raw.strip(), "code": code})
            continue
        if False:
            loc = (f.get("A") or n.get("loc") or "").split()[0]
            if loc in AD:
                ll, adname = AD[loc]
                p = dict(base, name={"he": f"{adname} סגור", "en": f"{loc} closed"}, remarks={"he": summary_he(e, adname + " סגור", None, None, None, None), "en": e},
                         confidence="exact", radius_m=3000, designator=f"{nid} ({loc})")
                p["lower"], p["upper"] = {"ref": "SFC"}, None
                located.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [ll[1], ll[0]]}, "properties": p})
            else:
                unlocated.append({"id": nid, "kind": "other", "summary": {"he": "סגירת שדה/מנחת " + loc, "en": e}, "valid": valid, "raw": raw.strip(), "code": code})
            continue

        pts = coords(e)
        rad = radius_m(e)
        geom, conf, why = None, "exact", None
        if rad and pts:
            c = pts[0]
            if "SEMI-CIRCLE TO EAST" in e:
                geom = geom_of(semicircle(c, rad, 0, 180))
            else:
                geom = {"type": "Point", "coordinates": [round(c[1], 6), round(c[0], 6)]}; base["radius_m"] = round(rad)
        elif len(pts) >= 3:
            g = Polygon([(p[1], p[0]) for p in pts])
            if not g.is_valid: g = g.buffer(0); conf, why = "approx", "סדר הנקודות בנוטאם יוצר צורה לא תקינה – מוצגת צורה מתוקנת."
            if g.geom_type == "MultiPolygon": g = max(g.geoms, key=lambda x: x.area)
            geom = geom_of(g)
        elif re.search(r"LEBANON BOUNDRAY TO (\d+)KM", e):
            km = int(re.search(r"LEBANON BOUNDRAY TO (\d+)KM", e).group(1))
            geom = geom_of(border_strip(basemap, "LBN", km, "S")); conf = "approx"
            why = f"רצועה ברוחב {km} ק\"מ לאורך גבול לבנון, מחושבת ממפת בסיס בדיוק של כ-1 ק\"מ."
        elif re.search(r"SYRIA BOUNDRAY TO (\d+)KM", e):
            km = int(re.search(r"SYRIA BOUNDRAY TO (\d+)KM", e).group(1))
            geom = geom_of(border_strip(basemap, "SYR", km, "W")); conf = "approx"
            why = f"רצועה ברוחב {km} ק\"מ לאורך גבול סוריה, מחושבת ממפת בסיס בדיוק של כ-1 ק\"מ."
        elif re.search(r"(JORDAN|EGYPT) BOUNDRAY TO (\d+)KM", e):
            mm = re.search(r"(JORDAN|EGYPT) BOUNDRAY TO (\d+)KM", e)
            geom = geom_of(border_strip(basemap, "JOR" if mm.group(1) == "JORDAN" else "EGY", int(mm.group(2)), "W")); conf = "approx"
            why = f"רצועה ברוחב {mm.group(2)} ק\"מ לאורך הגבול, מחושבת ממפת בסיס בדיוק של כ-1 ק\"מ."
        elif "N OF ROAD NR 85" in e:
            geom = geom_of(north_of_roads(basemap)); conf = "approx"
            why = "השטח שמצפון לכבישים 85 ו-91 מוצג לפי קו משוער (עכו–כרמיאל–ראש פינה–מחניים–רמת הגולן)."
        elif len(pts) == 1 and re.search(r"OBST|CRANE|ANTENNA|MAST", e):
            c = pts[0]; geom = {"type": "Point", "coordinates": [round(c[1], 6), round(c[0], 6)]}; base["radius_m"] = 150
        elif len(pts) in (1, 2) and q:
            c = pts[0]; geom = {"type": "Point", "coordinates": [round(c[1], 6), round(c[0], 6)]}
            base["radius_m"] = max(300, round(q["radius_nm"] * 1852)); conf = "approx"
            why = "לנוטאם נ\"צ בודדת ללא רדיוס – מוצג רדיוס מתוך שורת Q."
        elif q and q["radius_nm"] <= 5 and not re.search(r"ULTRALIGHT|GLD|AEROBATIC|CIRCUIT|TRG AREA", e):
            c = q["center"]; geom = {"type": "Point", "coordinates": [round(c[1], 5), round(c[0], 5)]}
            base["radius_m"] = round(q["radius_nm"] * 1852); conf = "approx"
            why = "הנוטאם אינו מגדיר גבולות מדויקים; מוצג המעגל הכללי משורת Q (מרכז ורדיוס בדיוק של דקה)."
        if not geom and not ai.get(nid, {}).get("geometry"):
            o = ai.get(nid, {})
            unlocated.append({"id": nid, "kind": o.get("kind") or ("other" if re.search(r"ULTRALIGHT|GLD|AEROBATIC|CIRCUIT|TRG AREA|ACTIVATED", e) else "unplaced"), "summary": {"he": o.get("summary_he", summ), "en": name_en}, "valid": valid, "raw": raw.strip(), "code": code})
            continue
        o = ai.get(nid, {})
        if o.get("geometry"): geom = o["geometry"]; base.pop("radius_m", None); base.update({"radius_m": o["radius_m"]} if o.get("radius_m") else {})
        if o.get("confidence"): conf = o["confidence"]
        if o.get("approxReason"): why = o["approxReason"]
        p = dict(base, name={"he": o.get("name_he", name_he), "en": o.get("name_en", name_en)}, remarks={"he": o.get("summary_he", summ), "en": e}, confidence=conf, interpreted=bool(o))
        if why: p["approxReason"] = {"he": why, "en": "Approximate area derived from the NOTAM text."}
        located.append({"type": "Feature", "geometry": geom, "properties": p})
    return located, unlocated

def diff(prev, located, unlocated, now_iso):
    old = {f["properties"]["designator"]: f for f in (prev.get("located", {}).get("features", []) if prev else [])}
    oldu = {u["id"]: u for u in (prev.get("unlocated", []) if prev else [])}
    new = {f["properties"]["designator"]: f for f in located}
    newu = {u["id"]: u for u in unlocated}
    ch = []
    if not prev: return ch
    for k, f in new.items():
        if k not in old and k.split(" ")[0] not in oldu:
            ch.append({"at": now_iso, "source": "notam", "kind": "added", "id": f["properties"]["id"], "text": {"he": "נוטאם חדש " + k + ": " + f["properties"]["name"]["he"], "en": "New NOTAM " + k}})
        elif k in old and old[k]["geometry"] != f["geometry"]:
            ch.append({"at": now_iso, "source": "notam", "kind": "changed", "id": f["properties"]["id"], "text": {"he": "עודכן " + k + ": " + f["properties"]["name"]["he"], "en": "Updated " + k}})
    for k, f in old.items():
        if k not in new:
            ch.append({"at": now_iso, "source": "notam", "kind": "removed", "id": f["properties"]["id"], "text": {"he": "בוטל/פג תוקף " + k + ": " + f["properties"]["name"]["he"], "en": "Removed " + k}})
    for k, u in newu.items():
        if k not in oldu and u["kind"] == "general":
            ch.append({"at": now_iso, "source": "notam", "kind": "added", "id": k, "text": {"he": "נוטאם כללי חדש " + k + ": " + u["summary"]["he"], "en": "New general NOTAM " + k}})
    return ch

if __name__ == "__main__":
    raw = json.load(open(sys.argv[1])); basemap = json.load(open(sys.argv[2]))
    import os
    aip = sys.argv[5] if len(sys.argv) > 5 else "/home/claude/build/notam_ai.json"
    ai = json.load(open(aip)) if os.path.exists(aip) else {}
    prev = json.load(open(sys.argv[3])) if sys.argv[3] != "-" else None
    loc, unl = build(raw, basemap, ai)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    changes = diff(prev, loc, unl, now)
    out = {"generatedAt": now, "located": {"type": "FeatureCollection", "features": loc}, "unlocated": unl, "changes": changes}
    json.dump(out, open(sys.argv[4], "w"), ensure_ascii=False)
    from collections import Counter
    print("located", len(loc), Counter(f["properties"]["confidence"] for f in loc), "unlocated", Counter(u["kind"] for u in unl), "changes", len(changes))
