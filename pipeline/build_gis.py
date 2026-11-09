# -*- coding: utf-8 -*-
"""Official CAAI GIS layers (AIP chapter 11 'מידע תעופתי נוסף' – 'שכבות מידע גאוגרפיות'):
  * CTR layer (civil + military CTR/CTA/ATZ)            -> layer 'ctr'
  * F_Limited (P/R/D) – used to fill gaps & for areas whose text geometry is ambiguous
  * RATAG KMZ (nature reserves / national parks / nesting sites flight limits) + A-17 annex E altitudes -> layer 'nature'
Inputs (download with govil.py, unzip):  /home/claude/raw/gis/ctr.geojson, flimited.geojson, ratag.kml ; /home/claude/build/annexE.json
Output: /home/claude/build/gis.json  +  /home/claude/build/gis_official_prd.json (for build_prd.py overrides / comparison)"""
import json, re, sys, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, "/home/claude/build")
from shapely.geometry import shape, mapping
from shapely import force_2d
G = "/home/claude/raw/gis/"
SRC_GIS = {"name": {"he": "רת\"א – שכבות מידע גאוגרפיות (פמ\"ת, מידע תעופתי נוסף)", "en": "CAAI GIS layers"},
           "url": "https://www.gov.il/he/pages/aip?chapterIndex=11"}
SRC_RATAG = {"name": {"he": "רשות הטבע והגנים – מגבלות טיסה (דרך רת\"א) + פמ\"ת א'-17 נספח ה'", "en": "INPA flight limits + AIP A-17 annex E"},
             "url": "https://www.gov.il/BlobFolder/guide/aip/he/RATAG_kmz.zip"}

def geo(g, tol=0.00005):
    g = force_2d(g).buffer(0).simplify(tol, preserve_topology=True)
    m = mapping(g)
    def r(o):
        if isinstance(o, (list, tuple)):
            if o and isinstance(o[0], (int, float)): return [round(o[0], 5), round(o[1], 5)]
            return [r(x) for x in o]
        return o
    return {"type": m["type"], "coordinates": r(m["coordinates"])}

def ft(v, ref="AMSL"):
    try: return {"v": int(float(str(v).split("/")[0])), "u": "ft", "ref": ref}
    except: return None

def ph(v, he): return {"label": {"he": he, "en": he}, "value": v, "type": "phone"}
MIL_PHONE = {"LLNV": ("08-6501402", "נבטים"), "LLRM": ("08-6505906", "רמון"), "LLOV": ("08-6359966", "עובדה"), "LLHB": ("08-9906320", "חצרים"),
             "LLRD": ("04-6092960", "רמת דוד"), "LL59": ("076-8638322", "פלמחים"), "LLEK": ("073-3636954", "תל נוף"), "LLHS": ("073-3485024", "חצור")}
UAS_CTR = "טיסת כטב\"ם בתחום CTR/ATZ אסורה ללא אישור מנהל יחידת הנת\"א או מפעיל המנחת (פמ\"ת ב'-09 §7ד)."

# civil CTR/ATZ that we already have with exact text geometry (keep ours); everything else comes from the GIS layer
KEEP_OURS = {"LLBG", "LLHA", "LLER", "LLKZ", "LLES", "LLFK", "LLMZ", "LLEY", "LLKS"}

def build():
    out = []
    # ---------------- CTR layer
    for f in json.load(open(G + "ctr.geojson"))["features"]:
        p = f["properties"]; code = p["Code"]; mil = p["Civ_Mil"] == "צבאי"
        if not mil and code in KEEP_OURS: continue
        name = p["Name"]; typ = p["TYPE"]
        lo = {"ref": "SFC"} if not p["Min_Alt"] else ft(p["Min_Alt"])
        up = ft(p["Max_Alt"])
        rem = UAS_CTR
        if mil: rem = f"מרחב פיקוח של בסיס חיל האוויר ({name}). " + rem + " התיאום מול מגדל הבסיס."
        if "/" in str(p["Max_Alt"]): rem += f" גובה עליון: {p['Max_Alt']} רגל (משתנה)."
        if p.get("Comment"): rem += " " + str(p["Comment"])
        props = {"id": f"gis-{typ.lower()}-{code.lower()}-{abs(hash(name)) % 10000}", "layer": "ctr", "designator": f"{code} {typ}",
                 "name": {"he": f"{typ} {name}" + (" (צבאי)" if mil else ""), "en": f"{code} {typ}"}, "status": "active",
                 "lower": lo, "upper": up, "valid": {}, "source": SRC_GIS, "confidence": "exact", "remarks": {"he": rem, "en": ""},
                 "military": mil}
        if code in MIL_PHONE: props["contact"] = [ph(MIL_PHONE[code][0], "מגדל " + MIL_PHONE[code][1])]
        out.append({"type": "Feature", "geometry": geo(shape(f["geometry"])), "properties": props})
    # ---------------- RATAG nature closures
    kml = open(G + "ratag.kml", encoding="utf-8").read()
    annexE = json.load(open("/home/claude/build/annexE.json"))
    import pyogrio
    gdf = pyogrio.read_dataframe(G + "ratag.kml")
    descs = re.findall(r"<Placemark.*?</Placemark>", kml, re.S)
    assert len(descs) == len(gdf), (len(descs), len(gdf))
    for i, pm in enumerate(descs):
        kv = dict(re.findall(r"<td>([A-Za-z0-9]+)</td>\s*<td>(.*?)</td>", pm, re.S))
        code = kv.get("Code", "").strip(); place = kv.get("Place", "").strip(); reason = kv.get("reasoning", "").strip()
        a = annexE.get(code)
        alt = a["alt"] if a else int(float(kv.get("maxAlt") or 0) or 0)
        g = gdf.geometry.iloc[i]
        if g is None or g.is_empty or not alt: continue
        note = "" if a else " (גובה לפי קובץ רט\"ג 2020; לא נמצא בנספח ה' העדכני)"
        props = {"id": f"nature-{code.lower()}-{i}", "layer": "nature", "designator": code,
                 "name": {"he": f"{(a or {}).get('name') or place} – {(a or {}).get('type') or reason}", "en": code},
                 "status": "active", "lower": {"ref": "SFC"}, "upper": {"v": alt, "u": "ft", "ref": "AGL"}, "valid": {},
                 "source": SRC_RATAG, "confidence": "exact",
                 "remarks": {"he": f"אין לטוס מתחת ל-{alt} רגל מעל פני השטח ({round(alt*0.3048)} מ'), אלא באישור רט\"ג (אישור רט\"ג נחשב גם כאישור רת\"א). "
                                   f"חל גם על כטב\"ם. גבולות הסגירה האווירית אינם בהכרח זהים לגבולות השמורה בקרקע.{note}",
                             "en": f"No flight below {alt} ft AGL without INPA approval."},
                 "contact": [{"label": {"he": "רט\"ג – אישורי טיסה", "en": "INPA"}, "value": "https://www.parks.org.il/new/tisa/", "type": "url"}]}
        out.append({"type": "Feature", "geometry": geo(g, 0.0002), "properties": props})
    # ---------------- official P/R/D (for build_prd)
    off = {}
    for f in json.load(open(G + "flimited.geojson"))["features"]:
        d = (f["properties"]["designator"] or "").strip()
        off.setdefault(d, []).append(f)
    offd = {}
    for d, fs in off.items():
        g = shape(fs[0]["geometry"])
        for f in fs[1:]: g = g.union(shape(f["geometry"]))
        p = fs[0]["properties"]
        offd[d] = {"geometry": geo(g), "type": p["Type"], "name": p["HebrewName"] or p.get("name"), "min": p["AltMin"], "max": p["AltMax"],
                   "modified": str(p["Modified"])[:10], "a17": p.get("A17"), "comment": p.get("Comment")}
    json.dump(offd, open("/home/claude/build/gis_official_prd.json", "w"), ensure_ascii=False)
    return out

if __name__ == "__main__":
    f = build()
    json.dump({"type": "FeatureCollection", "features": f}, open("/home/claude/build/gis.json", "w"), ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    print(len(f), Counter(x["properties"]["layer"] for x in f))
