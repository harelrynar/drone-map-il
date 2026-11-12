/* =========================================================
 * הגדרות האפליקציה – כאן מוסיפים שכבות, צבעים ופיצ'רים.
 * App configuration – add layers, colors and feature flags here.
 * ========================================================= */
window.APP_CONFIG = {
  version: "1.7-beta (GNSS)",

  // גרסת צד: הנתונים (פמ"ת/נוטאם) נקראים מהתיקייה של האתר הראשי, כך שהם תמיד עדכניים
  dataBase: "../../",

  /* שכבת GNSS – שיבושים/חסימות/הונאות ב-15 הדקות האחרונות, מתוך ADS-B חי.
   * providers: מנסים לפי הסדר; כולם מחזירים את פורמט ADSBExchange v2. */
  gnss: {
    on: true,
    windowMin: 15,          // חלון הזמן בדקות
    pollSec: 60,            // תדירות דגימה
    cellDeg: 0.2,           // גודל תא (מעלות רוחב, כ-22 ק"מ)
    bbox: [29.4, 34.15, 33.4, 35.95],   // דרום, מערב, צפון, מזרח
    query: { lat: 31.4, lon: 35.05, radiusNm: 160 },
    maxPosAgeSec: 60,
    nacDegraded: 7,         // NACp ≤ 7  (דיוק גרוע מ-0.05 מייל ימי)
    nicDegraded: 6,         // NIC ≤ 6
    degradedShare: 0.3,     // חלק המטוסים הפגועים בתא שמעליו התא "משובש"
    spoofJumpKt: 1500,      // קפיצת מיקום מהירה מזה = חשד להונאה
    spoofJumpMinKm: 15,
    spoofAltDiffFt: 4000,   // פער בין גובה GNSS לגובה ברומטרי
    paneZ: 312, paneTopZ: 372,
    colors: { ok: "#12a37a", nodata: "#7d8a97", degraded: "#f5a700", jam: "#1f1f1f", spoof: "#b5179e" },
    providers: [
      { id: "airplanes.live", name: "airplanes.live", site: "https://airplanes.live", url: "https://api.airplanes.live/v2/point/{lat}/{lon}/{nm}" },
      { id: "adsb.lol", name: "adsb.lol", site: "https://www.adsb.lol", url: "https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}" },
      { id: "adsb.fi", name: "adsb.fi", site: "https://adsb.fi", url: "https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}" }
    ]
  },

  map: {
    center: [31.45, 34.95],
    zoom: 8,
    minZoom: 7,
    maxZoom: 15,
    bounds: [[28.8, 33.0], [34.2, 37.2]]
  },

  /* מדידת שימוש – Umami Cloud. להפעלה: להדביק כאן את ה-Website ID מ-cloud.umami.is.
   * ריק = כבוי. Usage analytics – paste the Umami Website ID to enable; empty = off. */
  analytics: {
    websiteId: "",   // כבוי בגרסת הצד, כדי לא לערבב עם נתוני האתר הראשי
    domains: ["harelrynar.github.io"]
  },

  // רדיוס (ק"מ) שבו מנחת/שדה תעופה נחשב "קרוב" לנקודה שנבדקה
  nearbyAirfieldKm: 5,

  // ציר גובה – ערכים במטרים מעל פני הקרקע לבחירה בסינון
  altitudeStepsM: [30, 50, 60, 100, 120, 150, 300, 600],

  // פיצ'רים – אפשר לכבות/להדליק בלי לגעת בקוד אחר
  features: {
    pointCheck: true,        // "אפשר לטוס כאן?"
    altitudeFilter: true,
    dateFilter: true,
    languages: ["he", "en"],
    updateBanner: true,
    watchPoints: true,       // נקודות מעקב והתראות על שינויים לידן
    search: true
  },

  /* שכבות. severity קובע את הצבע של תשובת "אפשר לטוס כאן?":
   * 3 = אסור/דורש אישור, 2 = זהירות/תיאום, 1 = מידע */
  layers: {
    uasProhibited: { color: "#8a0a2e", fill: 0.35, dash: null, severity: 3, on: true, he: "אסור לכטב\"ם (LLU)", en: "UAS no-fly (LLU)" },
    prohibited: { color: "#d7263d", fill: 0.28, dash: null,    severity: 3, on: true,  he: "אזור אסור (P)",          en: "Prohibited (P)" },
    restricted: { color: "#f46036", fill: 0.22, dash: null,    severity: 3, on: true,  he: "אזור מוגבל (R)",         en: "Restricted (R)" },
    danger:     { color: "#e2a400", fill: 0.18, dash: "6 4",   severity: 3, on: true,  he: "אזור מסוכן (D)",         en: "Danger (D)" },
    uas:        { color: "#2e86ab", fill: 0.20, dash: null,    severity: 2, on: true,  he: "אזור טיסה לכטב\"ם", en: "UAS flight area" },
    notam:      { color: "#9b5de5", fill: 0.22, dash: null,    severity: 3, on: true,  he: "סגירה זמנית (נוטאם)",     en: "Temporary closure (NOTAM)" },
    notamApprox:{ color: "#ff00a8", fill: 0.12, dash: "2 6",   severity: 3, on: true,  he: "נוטאם – מיקום משוער",     en: "NOTAM – approximate area" },
    nature:     { color: "#2d6a4f", fill: 0.16, dash: "4 3",   severity: 3, on: true,  he: "שמורות, גנים וקינון (רט\"ג)", en: "Nature closures (INPA)" },
    ctr:        { color: "#3a86ff", fill: 0.06, dash: "10 5",  severity: 2, on: true,  he: "מרחב פיקוח CTR / ATZ", en: "Control zone (CTR/ATZ)" },
    airfield:   { color: "#111111", fill: 0.9,  dash: null,    severity: 2, on: true,  he: "שדה תעופה / מנחת",       en: "Airport / airstrip" },
    heliport:   { color: "#2b9348", fill: 0.9,  dash: null,    severity: 2, on: true,  he: "מנחת מסוקים",            en: "Heliport" }
  },

  // סדר ציור (התחתון ראשון)
  drawOrder: ["ctr", "nature", "uas", "danger", "restricted", "prohibited", "uasProhibited", "notam", "notamApprox", "airfield", "heliport"],

  sources: {
    aip: [
      { he: "פמ\"ת – פרק ב' (טיסות)", url: "https://www.gov.il/he/pages/aip?chapterIndex=5" },
      { he: "פמ\"ת – פרק ד' (שדות תעופה)", url: "https://www.gov.il/he/pages/aip?chapterIndex=7" },
      { he: "פמ\"ת – פרק ה' (מנחתים)", url: "https://www.gov.il/he/pages/aip?chapterIndex=8" },
      { he: "פמ\"ת א'-17 – אזורים אסורים, מוגבלים ומסוכנים", url: "https://www.gov.il/BlobFolder/guide/aip/he/%D7%90'-17.pdf" },
      { he: "פמ\"ת ב'-09 – טיסות כטב\"ם", url: "https://www.gov.il/BlobFolder/guide/aip/he/%D7%91'-09.pdf" },
      { he: "AIP ישראל (eAIP) – ENR 5.1, AD 2", url: "https://www.gov.il/en/Departments/General/electronic-aip" }
    ],
    notam: { he: "נוטאם – רת\"א", url: "https://brin.iaa.gov.il/aeroinfo/AeroInfo.aspx?msgType=Notam" },
    gnss: [{ he: "GNSS – נתוני ADS-B חיים: airplanes.live", url: "https://airplanes.live" }, { he: "GNSS – adsb.lol", url: "https://www.adsb.lol" }]
  }
};
