# גרסאות צד (beta)

תיקייה לגרסאות ניסיוניות. הן לא משנות את האתר הראשי (`/`) ולא את `versions/`,
והמשימות המתוזמנות לא כותבות לכאן. הנתונים (פמ"ת/נוטאם) נקראים מ-`/data` של האתר הראשי.

| תיקייה | מה יש בה | קישור |
|---|---|---|
| `gnss/` | שכבת שיבושי GNSS (חסימה / שיבוש / חשד להונאה) ב-15 הדקות האחרונות, מתוך ADS-B חי. קוד: `js/gnss.js`, הגדרות: `APP_CONFIG.gnss` ב-`js/config.js` | https://harelrynar.github.io/drone-map-il/beta/gnss/ |
| `1.8/` | גרסת בדיקה ל-1.8: גובה קרקע ותקרה אמיתית (`js/terrain.js`), מכשולים / שטח בנוי / ריכוזי קהל מ-OpenStreetMap (`js/osm.js`, נתונים ב-`data/osm/`, נבנים ב-`tools/osm_build.py` דרך ה-workflow `osm-layers`), תנועה אווירית נמוכה (`js/traffic.js`, מאותו קובץ ADS-B של בטא ה-GNSS) ו"למי מתקשרים?" (`js/whocall.js`). הגדרות: `APP_CONFIG.terrain / osm / traffic` ודגלי `features` ב-`js/config.js` | https://harelrynar.github.io/drone-map-il/beta/1.8/ |

שילוב בגרסה הראשית: להעתיק את `js/gnss.js`, את בלוק `gnss` מ-`config.js`, את קטע ה-CSS "GNSS layer" ואת
עשר נקודות החיבור ב-`app.js` (חיפוש `GNSS`), בלי `dataBase`.

שילוב 1.8 בגרסה הראשית: להעתיק את ארבעת קובצי ה-JS, את בלוקי `terrain` / `osm` / `traffic` ודגלי ה-`features` מ-`config.js`,
את קטע ה-CSS "1.8", את `#tfcPill` ואת תגי ה-`<script>` מ-`index.html`, את נקודות החיבור ב-`app.js` (חיפוש `1.8` ו-`X.`),
ואת `data/osm/` לתיקיית `data/` הראשית – בלי `dataBase` ובלי `.beta-tag`.
