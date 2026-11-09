# -*- coding: utf-8 -*-
"""Hand-written remarks & contacts, transcribed from AIP א'-17 / א'-07 (Nov 2026 edition).
Kept separate from geometry so a future AIP update only needs a diff here."""

def ph(v, he, en=None): return {"label": {"he": he, "en": en or he}, "value": v, "type": "phone"}
def em(v, he="דוא\"ל", en="Email"): return {"label": {"he": he, "en": en}, "value": v, "type": "email"}

# ATC units (א'-07 §10)
ATC = {
    "בן גוריון מגדל": "03-9758666", "בקרה צפון": "04-6166222", "בקרה דרום": "08-6833212",
    "ראש פינה": "04-6136210", "חיפה": "04-8476120", "הרצליה": "09-9719554", "אילת רמון": "08-9553666",
    "פלוטו מערב": "04-6926211", "פלוטו מזרח": "04-6926239", "חגב": "08-6502307", "קדם": "08-9907913",
    "תל נוף": "073-3636954", "רמת דוד": "04-6092960", "רמון": "08-6505906", "פלמחים": "076-8638322",
    "חצור": "073-3485024", "עובדה": "08-6359966", "נגב": "08-6823080", "נבטים": "08-6501402", "חצרים": "08-9906320",
}

FIRE_HE = ("שטח אש לירי תלול מסלול. אין לטוס בזמן שהאזור פעיל (א' 06:00 / מוצאי חג עד ה' 21:00, ערב חג עד 14:00, "
           "או לפי NOTAM). בקשה לטיסה שלא בשעות המותרות – למתא\"מ הפיקוד: דרום 08-9902926 (באר שבע ודרומה), "
           "מרכז 02-5305042 (באר שבע עד חדרה), צפון 073-3483007 (חדרה וצפונה), מתא\"מ 210 רמת הגולן 04-6977808.")
FIRE_EN = "Firing area. Do not fly while active (Sun 06:00 – Thu 21:00, holiday eve until 14:00, or per NOTAM)."
FIRE_CONTACTS = [ph("08-9902926", "מתא\"מ פיקוד דרום", "Southern Cmd"), ph("02-5305042", "מתא\"מ פיקוד מרכז", "Central Cmd"),
                 ph("073-3483007", "מתא\"מ פיקוד צפון", "Northern Cmd"), em("pakmaz64@gmail.com", "פיקוד צפון", "Northern Cmd"),
                 ph("04-6977808", "מתא\"מ 210 רמה\"ג", "Golan")]
WB_HE = ("איסור זה אינו חל על כטב\"ם וטיסן, בתנאי שתיאמו את הפעילות מול הגורם הצבאי הרלוונטי (פרק א'-11). "
         "התיחום הקרקעי – כ-2 ק\"מ מתוואי גדר ההפרדה. אין מידע מלא על מכשולים.")
WB_EN = "Does not apply to UAS/model aircraft if coordinated with the relevant military authority (AIP A-11)."

REMARKS = {
    "LLP01": ("שמורת הטבע החולה.", "Hula nature reserve."),
    "LLP02": ("שמורת הטבע גמלא.", "Gamla nature reserve."),
    "LLP03": ("לתיאום טיסה: מב\"ט אבטחה מכון דוד.", "Coordination: security officer."),
    "LLP04": ("בתי הזיקוק בחיפה.", "Haifa refineries."),
    "LLP07": ("תחנת הכוח חדרה, מגובה פני הקרקע/הים.", "Hadera power station."),
    "LLP09": ("המכון למחקר ביולוגי, נס ציונה.", "Biological research institute, Ness Ziona."),
    "LLP10": ("אין לבצע המתנה מעל האזור.", "No holding above the area."),
    "LLP11": ("בכל גובה לכל כלי הטיס, למעט טיסות מסחריות בנתיבי BEN GURION TMA (עבורן עד 8,000 רגל).",
              "All altitudes for all aircraft, except commercial flights on BEN GURION TMA routes (SFC–8,000 ft)."),
    "LLP13": ("בחלק החופף ל-LLP11 חלה ההגבלה של LLP11. לטיסות רב-להב בקשר עין יש לאשר תכנית טיסה מול אחראית מידע ותעופה במשרד התחבורה (אביטל שלס). "
              "טיסה פרטית/מסחרית שלא המריאה משדה של רש\"ת – מרכז המבצעים לאבטחת התעופה.",
              "Multirotor VLOS flights require an approved flight plan from the Ministry of Transport. Overlap with LLP11 – LLP11 applies."),
    "LLP14": ("לפני הגשת בקשה לטיסת מרחב יש לתאם לפי סדר העדיפות עם אנשי הקשר.", "Coordinate with the listed contacts before filing."),
    "LLP15": ("בכל גובה.", "All altitudes."),
    "LLP16": ("שמורת הטבע עין עבדת.", "Ein Avdat nature reserve."),
    "LLP171": (WB_HE, WB_EN), "LLP172": (WB_HE + " מרחב זה משמש את BEN-GURION TMA.", WB_EN), "LLP173": (WB_HE, WB_EN),
    "LLP18": ("למובילים אוויריים עד 6,000 רגל; לשאר כלי הטיס עד 4,000 רגל. " + WB_HE.split(".")[0] + ".",
              "Airlines up to 6,000 ft, others up to 4,000 ft. " + WB_EN),
    "LLP19": ("רצועת עזה – בכל גובה. בנוסף אין לטוס במרחק של פחות מ-6 ק\"מ מגבול הרצועה.", "Gaza Strip – all altitudes; keep 6 km from the border."),
    "LLP22": ("לתיאום: קב\"ט המתקן.", "Coordination: facility security officer."),
    "LLP24": ("מגובה פני הים.", "From MSL."),
    "LLP25": ("אסדת תמר / ים טטיס.", "Tamar / Yam Tethys platform."),
    "LLP26": ("אסדת גט\"ן.", "Platform."), "LLP28": ("אסדת לוויתן.", "Leviathan platform."),
    "LLR20": ("גליל ההצנחה הבונים. בסופי שבוע וחגים ייתכנו הצנחות עד 16,000 רגל. לתיאום – לפי הסדר.",
              "Habonim parachuting area; weekends/holidays up to 16,000 ft."),
    "LLR27": ("מופעל באמצעות NOTAM בלבד.", "Activated by NOTAM only."),
    "LLR90": ("בקשה לתכנית טיסה דורשת פנייה לחה\"א לפחות 7 ימי עבודה מראש.", "Requests to IAF at least 7 working days in advance."),
    "LLR801": ("בקשה לתכנית טיסה דורשת פנייה לחה\"א לפחות 7 ימי עבודה מראש.", "Requests to IAF at least 7 working days in advance."),
    "LLR802": ("בקשה לתכנית טיסה דורשת פנייה לחה\"א לפחות 7 ימי עבודה מראש.", "Requests to IAF at least 7 working days in advance."),
    "LLR803": ("בקשה לתכנית טיסה דורשת פנייה לחה\"א לפחות 7 ימי עבודה מראש.", "Requests to IAF at least 7 working days in advance."),
    "LLR83": ("בקשה לתכנית טיסה דורשת פנייה לחה\"א לפחות 7 ימי עבודה מראש.", "Requests to IAF at least 7 working days in advance."),
    "LLD28": ("גליל הצנחה חוף התמרים.", "Parachuting area."),
    "LLD29": ("גליל הצנחה באר שבע.", "Beersheba parachuting area."),
    "LLD30": ("טורבינות רוח בעמק הבכא.", "Wind turbines."),
    "LLD31": ("הטסת כטב\"ם בהתאם להנחיות ניתוח מרחב אווירי, תוך שמירה של 500 רגל מכל תשתית אחרת.", "UAS per airspace analysis, keep 500 ft from other infrastructure."),
    "LLD34": ("מנחתי טיסנים.", "Model aircraft fields."),
    "LLD35": ("לתיאום: מנהל חמ\"ל אינטל.", "Coordination: Intel ops room."),
    "LLD37": ("גליל הצנחה מחניים מערב (בתוך CTR ראש פינה).", "Mahanayim West parachuting area."),
    "LLD38": ("גליל הצנחה מחניים מזרח (בתוך CTR ראש פינה).", "Mahanayim East parachuting area."),
    "LLD39": ("אזור הטסת רחפנים.", "Drone flying area."), "LLD40": ("אזור הטסת רחפנים.", "Drone flying area."),
    "LLD41": ("לתיאום: מגדל רמת דוד.", "Coordination: Ramat David tower."),
    "LLD42": ("הטסת רחפנים כי\"ל ים המלח. גבול עליון 530 רגל מתחת לפני הים.", "Upper limit −530 ft (below MSL)."),
    "LLD43": ("אזור הטסת רחפנים.", "Drone flying area."),
    "LLD44": ("לתיאום: מגדל רמת דוד.", "Coordination: Ramat David tower."),
    "LLD47": ("מנחת טיסנים נגבה.", "Model aircraft field."),
    "LLD48": ("הכטב\"ם טס במרחב הסגירה עד 50 מטר מעל פני השטח.", "UAS operate up to 50 m AGL."),
    "LLD49": ("הכטב\"ם טס בנ\"צ המרכזי עד 20 מטר מעל פני השטח.", "UAS at the centre point up to 20 m AGL."),
    "LLD50": ("פעיל בין 18:00 ל-06:00.", "Active 18:00–06:00."),
    "LLD51": ("לתיאום: מגדל רמת דוד.", "Coordination: Ramat David tower."),
    "LLD52": ("לתיאום: מגדל רמת דוד.", "Coordination: Ramat David tower."),
}
for c in ("LLR24", "LLR30", "LLR36", "LLR100", "LLR309", "LLR500", "LLR502", "LLR504", "LLR520", "LLR589", "LLR618", "LLR804", "LLR805", "LLR900", "LLR921", "LLR82"):
    REMARKS.setdefault(c, (FIRE_HE, FIRE_EN))

CONTACTS = {
    "LLP03": [ph("050-3384198", "מב\"ט אבטחה", "Security")],
    "LLP13": [ph("050-6212003", "משרד התחבורה – אביטל שלס", "Ministry of Transport"), ph("09-9599800", "מרכז מבצעים לאבטחת התעופה", "Aviation security ops"), em("asoc@int.gov.il")],
    "LLP14": [ph("054-3390262", "משה ישראל"), ph("052-5773105", "יוסי שמש"), ph("052-8686406", "ניר כהן"), ph("052-3678550", "אריה גלוטמן")],
    "LLP22": [ph("054-9992044", "קב\"ט"), ph("052-3678155", "קב\"ט")],
    "LLR20": [ph("054-2518700", "עינב ליברמן"), em("einavlib@gmail.com"), ph("052-5365141", "אור אלרון – מפעיל מנחת"), ph("054-2519100", "דן מוקדי"), em("danm@parardive.co.il")],
    "LLD31": [ph("054-2479323", "יוסי מעוז (קב\"ט)")],
    "LLD35": [ph("08-6121111", "חמ\"ל אינטל")],
    "LLD39": [ph("052-3792937", "חמ\"ל 9950")], "LLD40": [ph("052-3792937", "חמ\"ל 9950")],
    "LLD41": [ph(ATC["רמת דוד"], "מגדל רמת דוד", "Ramat David TWR")], "LLD44": [ph(ATC["רמת דוד"], "מגדל רמת דוד", "Ramat David TWR")],
    "LLD51": [ph(ATC["רמת דוד"], "מגדל רמת דוד", "Ramat David TWR")], "LLD52": [ph(ATC["רמת דוד"], "מגדל רמת דוד", "Ramat David TWR")],
    "LLD42": [ph("08-9977741", "שי חן"), ph("054-7302309", "שי חן")],
    "LLD48": [ph("054-2021535", "בועז צרפתי (קנדו)"), ph("052-6909123", "גיל שטיבלמן")],
    "LLD49": [ph("050-7058511", "פרספטו"), ph("050-5805050", "פרספטו")],
    "LLD50": [ph("054-2021535", "בועז צרפתי (קנדו)")],
}
for c in ("LLR24", "LLR30", "LLR36", "LLR100", "LLR309", "LLR500", "LLR502", "LLR504", "LLR520", "LLR589", "LLR618", "LLR804", "LLR805", "LLR900", "LLR921", "LLR82"):
    CONTACTS.setdefault(c, FIRE_CONTACTS)

SBS = [ph("074-7833333", "שב\"ס – מטה ארצי", "Prison Service HQ"), ph("074-7834080", "שב\"ס – מחוז צפון", "IPS North"),
       ph("074-7836000", "שב\"ס – מחוז מרכז", "IPS Centre"), ph("074-7839000", "שב\"ס – מחוז דרום", "IPS South")]
LLU_CONTACTS = {
    "LLU21": [ph("03-5038875", "תיאום", "Coordination")],
    "LLU55": [em("itzik.Sardinas@chevron.com", "שברון"), em("tal.lapidot@chevron.com", "שברון")],
    "LLU59": [ph("04-6975253", "תיאום")], "LLU60": [ph("073-3142501", "תיאום"), ph("052-9289403", "תיאום")],
    "LLU61": [ph("052-3410054", "חמ\"ל"), ph("02-5917531", "חמ\"ל")], "LLU62": [ph("03-5487211", "תיאום")],
    "LLU73": [ph("04-9096525", "ביטחון תחנה (24/7)"), ph("052-5222789", "יריב שלם")],
}
for n in range(63, 73):
    LLU_CONTACTS[f"LLU{n}"] = [ph("052-9265944", "תיאום", "Coordination")]
