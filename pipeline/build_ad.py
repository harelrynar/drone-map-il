# -*- coding: utf-8 -*-
"""Airports (ch. ד'), airstrips (ch. ה'), helipads (ch. ו') + civil CTR/ATZ. Hand-transcribed from AIP text pages."""
import json, sys
sys.path.insert(0, "/home/claude/build")
from geo_util import *
from shapely.geometry import Polygon, LineString
from shapely.ops import split

def P(s):
    a, b = s.split(",")
    return parse_latlon_pair(a.strip() + " " + b.strip())
def ph(v, he, en=None): return {"label": {"he": he, "en": en or he}, "value": v, "type": "phone"}
def fq(v, he, en=None): return {"label": {"he": he, "en": en or he}, "value": v + " MHz", "type": "freq"}
def em(v, he="דוא\"ל"): return {"label": {"he": he, "en": "Email"}, "value": v, "type": "email"}
def ft(v, ref="AMSL"): return {"v": v, "u": "ft", "ref": ref}
B = "https://www.gov.il/BlobFolder/generalpage/"
def src(he, url): return {"name": {"he": he, "en": he}, "url": url}
EAIP = src("AIP ישראל (eAIP 1-26) AD 2", "https://www.gov.il/BlobFolder/generalpage/electronic-aip/en/Full%20AIP%201-26.pdf")
CH7 = "https://www.gov.il/he/pages/aip?chapterIndex=7"; CH8 = "https://www.gov.il/he/pages/aip?chapterIndex=8"; CH9 = "https://www.gov.il/he/pages/aip?chapterIndex=9"

F = []
def point(id_, layer, he, en, code, latlon, contacts, remarks, source, elev=None, extra=None):
    p = {"id": id_, "layer": layer, "designator": code, "name": {"he": he, "en": en}, "status": "active",
         "valid": {}, "source": source, "confidence": "exact", "contact": contacts, "remarks": {"he": remarks, "en": ""}}
    if elev is not None: p["elevation_ft"] = elev
    if extra: p.update(extra)
    F.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(latlon[1], 6), round(latlon[0], 6)]}, "properties": p})

def zone(id_, layer, he, en, code, ring=None, center=None, r=None, lower=None, upper=None, contacts=None, remarks="", source=None, conf="exact", why=None, shapely_poly=None):
    p = {"id": id_, "layer": layer, "designator": code, "name": {"he": he, "en": en}, "status": "active",
         "lower": lower or {"ref": "SFC"}, "upper": upper, "valid": {}, "source": source, "confidence": conf,
         "remarks": {"he": remarks, "en": ""}}
    if contacts: p["contact"] = contacts
    if why: p["approxReason"] = {"he": why, "en": "Boundary approximated from the AIP description."}
    if shapely_poly is not None:
        geom = {"type": "Polygon", "coordinates": [[[round(x, 6), round(y, 6)] for x, y in shapely_poly.exterior.coords]]}
    elif ring:
        geom = {"type": "Polygon", "coordinates": [to_geojson_ring(ring)]}
    else:
        geom = {"type": "Point", "coordinates": [round(center[1], 6), round(center[0], 6)]}; p["radius_m"] = round(r)
    F.append({"type": "Feature", "geometry": geom, "properties": p})

UAS_CTR = "טיסת כטב\"ם בתחום CTR/ATZ אסורה ללא אישור מנהל יחידת הנת\"א או מפעיל המנחת (פמ\"ת ב'-09 §7ד). פטור מסגירה במרחק >2 ק\"מ מהמסלול ועד גובה המכשול הגבוה ביותר."
def P_ICAO(s): return parse_latlon_pair(s)

# ---------------- Airports (chapter ד' + eAIP)
LLBG = P_ICAO("320034N 0345308E")
point("ad-llbg", "airfield", "נמל התעופה בן גוריון", "Ben Gurion Airport", "LLBG", LLBG,
      [ph("03-9758666", "מגדל בן גוריון", "Ben Gurion TWR"), fq("134.600", "מגדל", "TWR"), fq("120.500", "גישה", "APP")], UAS_CTR, EAIP)
zone("ctr-llbg", "ctr", "CTR בן גוריון", "Ben Gurion CTR", "LLBG CTR",
     ring=[P_ICAO(x) for x in ["320622N 0344626E", "320600N 0345051E", "320618N 0345332E", "320453N 0350008E", "315510N 0345912E", "314953N 0350147E", "315459N 0345257E", "315601N 0344201E"]],
     upper=ft(2000), contacts=[ph("03-9758666", "מגדל בן גוריון", "Ben Gurion TWR")], remarks=UAS_CTR, source=EAIP)
LLER = P_ICAO("294338N 0350051E")
point("ad-ller", "airfield", "נמל התעופה רמון (אילת)", "Ramon Airport (Eilat)", "LLER", LLER,
      [ph("08-9553666", "בקרת אילת", "Eilat Control"), fq("119.000", "אילת", "Eilat Control")], UAS_CTR, EAIP)
zone("ctr-ller-n", "ctr", "CTR אילת רמון – צפון", "Eilat Ramon CTR North", "LLER CTR N",
     ring=[P_ICAO(x) for x in ["295855N 0350540E", "295335N 0350503E", "295335N 0345819E", "295835N 0345921E", "295835N 0350221E", "300032N 0350247E"]],
     upper=ft(4000), contacts=[ph("08-9553666", "בקרת אילת")], remarks=UAS_CTR, source=EAIP, conf="approx", why="הקטע לאורך גבול ירדן מוצג כקו ישר.")
zone("ctr-ller-s", "ctr", "CTR אילת רמון – דרום", "Eilat Ramon CTR South", "LLER CTR S",
     ring=[P_ICAO(x) for x in ["295335N 0350503E", "293233N 0345841E", "293109N 0345759E", "292800N 0345601E", "292800N 0345400E", "292931N 0345415E", "294212N 0345114E", "294335N 0345445E", "294559N 0345606E", "295002N 0345736E", "295334N 0345819E"]],
     upper=ft(6000), contacts=[ph("08-9553666", "בקרת אילת")], remarks=UAS_CTR, source=EAIP, conf="approx", why="הקטעים לאורך גבולות ירדן ומצרים מוצגים כקווים ישרים.")
LLHA = P_ICAO("324835N 0350238E")
point("ad-llha", "airfield", "נמל התעופה חיפה", "Haifa Airport", "LLHA", LLHA,
      [ph("04-8476120", "מגדל חיפה", "Haifa TWR"), fq("133.000", "מגדל", "TWR")], UAS_CTR, src("פמ\"ת ד' – חיפה", B + "haifa-airport/he/%D7%97%D7%99%D7%A4%D7%94.pdf"))
zone("ctr-llha", "ctr", "CTR חיפה", "Haifa CTR", "LLHA CTR",
     ring=[P_ICAO(x) for x in ["324511N 0350418E", "325025N 0350740E", "325039N 0350602E", "325515N 0350550E", "325525N 0350455E", "325640N 0350454E", "325644N 0350421E", "324933N 0345631E", "324740N 0345631E", "324459N 0350151E"]],
     upper=ft(3000), contacts=[ph("04-8476120", "מגדל חיפה")], remarks="עד 3,000 רגל (3,500 בסופי שבוע). " + UAS_CTR, source=EAIP)
LLHZ = P("32°10'46\"N,034°50'04\"E")
point("ad-llhz", "airfield", "שדה התעופה הרצליה", "Herzliya Airfield", "LLHZ", LLHZ,
      [ph("09-9719554", "מגדל הרצליה", "Herzliya TWR"), fq("122.200", "מגדל", "TWR")], UAS_CTR, src("פמ\"ת ד' – הרצליה", B + "herzelia-airport/he/%D7%94%D7%A8%D7%A6%D7%9C%D7%99%D7%94.pdf"), 121)
zone("ctr-llhz", "ctr", "CTR הרצליה", "Herzliya CTR", "LLHZ CTR", center=LLHZ, r=3000, upper=ft(2000),
     contacts=[ph("09-9719554", "מגדל הרצליה")], remarks=UAS_CTR, source=src("פמ\"ת ד' – הרצליה", B + "herzelia-airport/he/%D7%94%D7%A8%D7%A6%D7%9C%D7%99%D7%94.pdf"),
     conf="approx", why="מוצג רדיוס 3 ק\"מ בלבד; ה-CTR כולל גם גזרות לנקודות הדיווח 'בצרה' ו'גני עם' (נספח ג').")
LLIB = P("32°58'51\"N,035°34'19\"E")
point("ad-llib", "airfield", "שדה התעופה ראש פינה", "Rosh Pina Airfield", "LLIB", LLIB,
      [ph("04-6136210", "מגדל ראש פינה", "Rosh Pina TWR")], UAS_CTR + " בתחום ה-CTR גלילי הצנחה מחניים מזרח/מערב.", src("פמ\"ת ד' – ראש פינה", B + "roashpina-airport/he/%D7%A8%D7%90%D7%A9%20%D7%A4%D7%99%D7%A0%D7%94.pdf"), 884)
zone("ctr-llib", "ctr", "CTR ראש פינה", "Rosh Pina CTR", "LLIB CTR", center=LLIB, r=5 * 1852, upper=ft(6000),
     contacts=[ph("04-6136210", "מגדל ראש פינה")], remarks=UAS_CTR, source=src("פמ\"ת ד' – ראש פינה", B + "roashpina-airport/he/%D7%A8%D7%90%D7%A9%20%D7%A4%D7%99%D7%A0%D7%94.pdf"),
     conf="approx", why="מעגל 5 מייל ימי; בפמ\"ת המעגל מוגבל במזרח לאורך כביש 888 (צומת בית המכס – צומת בית צידה) – הקטימה אינה מוצגת.")

# ---------------- Airstrips (chapter ה')
def strip(id_, code, he, en, arp, contacts, atz_r, atz_top, rem, url, conf="exact", why=None, uas=None):
    point("ad-" + id_, "airfield", he, en, code, arp, contacts, rem, src("פמ\"ת ה' – " + he, url))
    if atz_r:
        zone("atz-" + id_, "ctr", "ATZ " + he, "ATZ " + en, code + " ATZ", center=arp, r=atz_r, upper=ft(atz_top), contacts=contacts,
             remarks=UAS_CTR, source=src("פמ\"ת ה' – " + he, url), conf=conf, why=why)

strip("llmg", "LLMG", "מנחת מגידו", "Megiddo airstrip", P("32°35'50\"N,035°14'05\"E"),
      [ph("04-6528847", "מנחת מגידו"), fq("124.40", "מגידו"), ph("04-6092960", "מגדל רמת דוד"), ph("04-6926239", "פלוטו מזרח")], None, None,
      "באזור המנחת פעילות כטב\"ם: כל פעילות מחייבת אישור מראש של מפעיל המנחת. מרחב הפעילות מגובה הקרקע ועד 1,200 רגל (QNH). "
      "זמני פעילות כטב\"ם: 07:00-07:15, 10:00-10:30, 14:00-14:30, 18:00-18:30, 21:15-21:30 או לפי NOTAM. "
      "הודעה טלפונית למגדל רמת דוד ול'פלוטו' 10 דקות לפני המראה. אין פעילות כטב\"ם בו-זמנית עם כלי טיס מאוישים.",
      B + "megido-landing-ground/he/aip_LLMG%20-%20%D7%9E%D7%92%D7%99%D7%93%D7%95.pdf")
# Megiddo ATZ: north of runways 1.8 km / 1,000 ft, south 3 km / 1,200 ft
mg = P("32°35'50\"N,035°14'05\"E")
north = Polygon([(p[1], p[0]) for p in [mg] + [dest(*mg, b, 1800) for b in range(-90, 91, 5)] + [mg]])
south = Polygon([(p[1], p[0]) for p in [mg] + [dest(*mg, b, 3000) for b in range(90, 271, 5)] + [mg]])
zone("atz-llmg-n", "ctr", "ATZ מנחת מגידו (צפון)", "Megiddo ATZ (north)", "LLMG ATZ", shapely_poly=north, upper=ft(1000),
     remarks=UAS_CTR + " מנחת מגידו בתוך אזור הפיקוח של בסיס רמת דוד.", source=src("פמ\"ת ה' – מגידו", CH8), conf="approx", why="חלוקה צפון/דרום לפי ציר מזרח-מערב (קירוב לכיוון המסלולים).")
zone("atz-llmg-s", "ctr", "ATZ מנחת מגידו (דרום)", "Megiddo ATZ (south)", "LLMG ATZ", shapely_poly=south, upper=ft(1200),
     remarks=UAS_CTR + " מנחת מגידו בתוך אזור הפיקוח של בסיס רמת דוד.", source=src("פמ\"ת ה' – מגידו", CH8), conf="approx", why="חלוקה צפון/דרום לפי ציר מזרח-מערב (קירוב לכיוון המסלולים).")
strip("llfk", "LLFK", "מנחת פיק", "Pik airstrip", P("32°47'07\"N,035°43'02\"E"),
      [ph("050-9254449", "מפעיל המנחת – הראל זעירה"), ph("04-6763353", "טלפון במנחת"), ph("04-6969777", "מ.א. רמת הגולן"), fq("122.55", "פיק"), ph("04-6926211", "פלוטו מזרח")],
      3000, 3000, "באזור המנחת טיסות כטב\"ם, מרוכזות בגליל ברדיוס 2 מייל ימי סביב 32°47'18\"N 35°43'05\"E מגובה הקרקע עד 3,000 רגל (QNH). "
      "מפעילי כטב\"ם מחויבים בהודעה ל'פלוטו מזרח' עד 30 דקות לפני הפעלת המנחת. הקפה לכטב\"ם מותרת משני צידי המסלול.",
      B + "pik-landing-ground/he/%D7%9E%D7%A0%D7%97%D7%AA%20%D7%A4%D7%99%D7%A7.pdf")
zone("uas-pik", "uas", "גליל פעילות כטב\"ם – מנחת פיק", "Pik UAS cylinder", None, center=P("32°47'18\"N,035°43'05\"E"), r=2 * 1852, upper=ft(3000),
     contacts=[ph("04-6926211", "פלוטו מזרח"), ph("050-9254449", "מפעיל המנחת")], remarks="אזור ריכוז טיסות כטב\"ם של מנחת פיק. הודעה ל'פלוטו מזרח' עד 30 דקות לפני הפעלה.",
     source=src("פמ\"ת ה' – פיק", CH8))
strip("lles", "LLES", "מנחת עין שמר", "Ein Shemer airstrip", P("32°26'29\"N,035°00'12\"E"),
      [ph("03-6977946", "משרד הביטחון – אישור"), ph("03-9356362", "מבצעי אוויר תע\"א"), ph("050-4245652", "מפעיל המנחת – טל ציזנר")],
      2 * 1852, 2000, "המנחת מורשה לכטב\"ם של התעשייה האווירית בלבד; כל שימוש אחר מחייב אישור רת\"א. איסור טיסה מעל בי\"ח שער מנשה מתחת ל-1,000 רגל.",
      B + "einshemer-landing-ground/he/aip_%D7%A2%D7%99%D7%9F%20%D7%A9%D7%9E%D7%A8%20-%20LLES.pdf")
strip("llkz", "LLKZ", "מנחת קציעות", "Ketziot airstrip", P("30°51'33\"N,034°26'36\"E"), [],
      2 * 1852, 2000, "המנחת משמש לכטב\"ם ולמערכת הביטחון בלבד. כל פעילות בתיאום מראש עם מפעיל המנחת ומשרד הביטחון; תכנית טיסה דרך מודיעין טיס.",
      B + "kziot/he/aip_LLKZ%20-%20%D7%A7%D7%A6%D7%99%D7%A2%D7%95%D7%AA.pdf")
strip("llmz", "LLMZ", "מנחת מצדה", "Masada airstrip", P("31°19'45\"N,035°23'18\"E"),
      [ph("050-5969324", "מפעיל המנחת – אבי בנישו"), ph("08-6688811", "החברה הכלכלית חבל ים המלח"), fq("122.55", "מצדה")],
      3000, 300, "מנחת לפעילות כטב\"מ. שעות פעילות 08:00-17:00. בקשה לפעילות מוגשת למודיעין טיס ביום ראשון עבור השבוע שלאחריו; תקשורת טלפונית מול יב\"א 509 בעת פעילות.",
      B + "masada-landing-ground/he/%D7%9E%D7%A6%D7%93%D7%94.pdf")
strip("llbo", "LLBO", "מנחת הבונים", "Habonim airstrip", P("32°39'15\"N,034°56'02\"E"),
      [ph("04-6391068", "אייר פרדייב"), fq("129.150", "הבונים")], None, None,
      "מנחת הצנחה. ATZ ברדיוס 3 ק\"מ עד 11,000 רגל (למעט מזרחית לכביש 4) – ראו גם גליל ההצנחה LLR20.",
      B + "landing-ground-habonim/he/%D7%9E%D7%A0%D7%97%D7%AA%20%D7%94%D7%91%D7%95%D7%A0%D7%99%D7%9D.pdf")
strip("llbs", "LLBS", "מנחת באר שבע (תימן)", "Beersheba (Teyman) airstrip", P("31°17'13\"N,034°43'22\"E"),
      [ph("08-6104488", "עיט שירותי תעופה"), ph("050-4780097", "אלי פרץ – דחוף"), ph("08-9907913", "מגדל קדם")], None, None,
      "פעילות דאייה והצנחה (גליל הצנחה LLD29). ATZ: חצי מעגל לכיוון צפון-מזרח ברדיוס 3 ק\"מ מה-VOR. ליד CTR קדם.",
      B + "beersheva-landing-ground/he/aip_%D7%91%D7%90%D7%A8%20%D7%A9%D7%91%D7%A2-LLBS.pdf")
bs = P_ICAO("311710N 0344318E")
zone("atz-llbs", "ctr", "ATZ מנחת באר שבע", "Beersheba airstrip ATZ", "LLBS ATZ",
     shapely_poly=Polygon([(p[1], p[0]) for p in [bs] + [dest(*bs, b, 3000) for b in range(-45, 136, 5)] + [bs]]), upper=None,
     remarks=UAS_CTR, source=src("פמ\"ת ה' – באר שבע", CH8), conf="approx", why="חצי מעגל צפון-מזרחי ברדיוס 3 ק\"מ; נקודות הקטימה המדויקות (נספח ג') לא שורטטו.")
strip("lley", "LLEY", "מנחת עין יהב", "Ein Yahav airstrip", P("30°37'18\"N,035°12'11\"E"),
      [ph("052-3666418", "מפעיל המנחת – יונתן נריסנה"), ph("08-6592242", "החברה לפיתוח הערבה")], 3000, 1000, "",
      B + "einyahav-landing-ground/he/%D7%A2%D7%99%D7%9F%20%D7%99%D7%94%D7%91.pdf")
strip("llks", "LLKS", "מנחת קרית שמונה", "Kiryat Shmona airstrip", P("33°12'51\"N,035°35'39\"E"),
      [ph("053-3584999", "מפעיל – יהושע אוחנה"), ph("04-6902539", "החברה הכלכלית ק\"ש"), ph("04-6926239", "פלוטו מזרח")], 3000, 1200, "",
      B + "kiryatshmona-landing-ground/he/%D7%A7%D7%A8%D7%99%D7%AA%20%D7%A9%D7%9E%D7%95%D7%A0%D7%94.pdf")
strip("llrs", "LLRS", "מנחת ראשון לציון", "Rishon LeZion airstrip", P("31°58'03\"N,034°45'13\"E"),
      [ph("052-5040014", "מחזיק הרישיון – עודד רייסמן"), ph("076-8638322", "מגדל פלמחים")], None, None,
      "בתוך CTR פלמחים. ATZ בימי חול: שד' משה דיין (צפון), שטח אש 24 (מערב), נחל שורק (דרום), כביש 20 (מזרח). "
      "בסופי שבוע וחגים פעילות טיסנים ב'מסלול' 12/30 מצפון למנחת; גובה מרבי במרחב 'ראשון' 400 רגל.",
      B + "rishonlezion-landing-ground/he/aip_%D7%A8%D7%90%D7%A9%D7%95%D7%9F%20%D7%9C%D7%A6%D7%99%D7%95%D7%9F.pdf")
# agricultural airstrips ('מנחתים נוספים')
AGRI = [("אליעז (חפציבה)", "323208/0352618", "ops@chimnir.co.il"), ("גבולות (אשכול)", "311339/0342737", "ops@chimnir.co.il"),
        ("טל שחר", "314724/0345359", "ops@chimnir.co.il"), ("לב הנגב (אורים)", "311604/0343215", "etzionia@gmail.com"),
        ("נען", "315305/0345310", "ops@chimnir.co.il"), ("סן-ג'ין (שומרת)", "325640/0350615", "etzionia@gmail.com"),
        ("סעד", "312817/0343333", "ops@chimnir.co.il"), ("קדמה", "314152/0344610", "tomer.dahari@elbitsystems.com"),
        ("רוחמה", "312742/0344310", "ops@chimnir.co.il"), ("רשות החולה", "330652/0353452", "ops@chimnir.co.il")]
for i, (n, c, e) in enumerate(AGRI):
    a, b = c.split("/")
    ll = P_ICAO(a + "N" + b + "E")
    point(f"ad-agri-{i}", "airfield", "מנחת חקלאי " + n, "Agricultural airstrip " + n, None, ll, [em(e, "מפעיל")],
          "מנחת חקלאי – פעילות מטוסי ריסוס בגובה נמוך. יש לתאם פעילות אווירית עם המפעיל.",
          src("פמ\"ת ה' – מנחתים נוספים", B + "others-landing-ground/he/aip_%D7%9E%D7%A0%D7%97%D7%AA%D7%99%D7%9D%20%D7%A0%D7%95%D7%A1%D7%A4%D7%99%D7%9D.pdf"))

# ---------------- Helipads (chapter ו')
HELI = [("llic", "LLIC", "מנחת מסוקים איכילוב", "32°04'48\"N,034°47'23\"E", ["03-6974742", "03-6973875"]),
        ("llaa", "LLAA", "מנחת מסוקים אסותא אשדוד", "31°46'43\"N,034°39'18\"E", ["072-3398889"]),
        ("llbl", "LLBL", "מנחת מסוקים בלינסון", "32°05'13\"N,034°51'54\"E", ["03-9377546", "03-9376900"]),
        ("llhd", "LLHD", "מנחת מסוקים הדסה עין כרם", "31°45'52\"N,035°08'50\"E", ["02-6776666"]),
        ("llhy", "LLHY", "מנחת מסוקים הלל יפה", "32°27'11\"N,034°53'42\"E", ["04-7744900", "04-7744374"]),
        ("llys", "LLYS", "מנחת מסוקים יוספטל (אילת)", "29°33'13\"N,034°56'29\"E", ["08-6351605"]),
        ("llsr", "LLSR", "מנחת מסוקים סורוקה", "31°15'33\"N,034°47'58\"E", ["08-6400222", "08-6400299"]),
        ("llpo", "LLPO", "מנחת מסוקים פוריה", "32°45'15\"N,035°32'33\"E", ["04-6652206", "04-6652666"]),
        ("llrb", "LLRB", "מנחת מסוקים רמב\"ם", "32°50'07\"N,034°59'09\"E", ["04-7772525"]),
        ("llsm", "LLSM", "מנחת מסוקים תל השומר", "32°02'36\"N,034°50'31\"E", ["03-5302534", "03-5303171"]),
        ("llis", "LLIS", "מנחת מסוקים תפן (ישקר)", "32°58'45\"N,035°15'56\"E", ["04-9970442", "04-9970456", "050-5203303"])]
for id_, code, he, ll, phones in HELI:
    point("hp-" + id_, "heliport", he, code + " heliport", code, P(ll), [ph(x, "מפעיל המנחת / מוקד ביטחון") for x in phones],
          "מנחת מסוקים (כולל פינוי רפואי) – פעילות מסוקים בגובה נמוך בכל שעות היממה. יש להימנע מהטסת כטב\"ם בנתיבי הגישה.",
          src("פמ\"ת ו' – " + he, CH9))
point("hp-llhd2", "heliport", "מנחת מסוקים הדסה עין כרם (גג)", "LLHD rooftop heliport", "LLHD", P("31°45'08\"N,035°08'57\"E"),
      [ph("02-6776666", "מוקד")], "משטח נחיתה מוגבה על גג בניין.", src("פמ\"ת ו' – הדסה עין כרם", CH9))

# replaced by the official CAAI CTR layer (build_gis.py), which has the exact shapes
REPLACED_BY_GIS = {"ctr-llhz", "ctr-llib", "atz-llmg-n", "atz-llmg-s", "atz-llbs"}
F[:] = [f for f in F if f["properties"]["id"] not in REPLACED_BY_GIS]

if __name__ == "__main__":
    json.dump({"type": "FeatureCollection", "features": F}, open("/home/claude/build/ad.json", "w"), ensure_ascii=False)
    from collections import Counter
    print(len(F), Counter(f["properties"]["layer"] for f in F))
