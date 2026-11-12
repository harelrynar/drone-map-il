# מפת מרחב אווירי לכטב"ם – ישראל

**האתר: https://harelrynar.github.io/drone-map-il/** · [English below](#uas-airspace-map--israel)

מפה אינטראקטיבית של אזורי טיסה, אזורים אסורים, מנחתים וסגירות זמניות (נוטאם), למטיסי כטב"ם.
**כלי עזר בלבד – המקור המחייב הוא הפמ"ת והנוטאם הרשמיים של רשות התעופה האזרחית.**

- `index.html`, `css/`, `js/` – האתר (Leaflet, ללא שלב build)
- `data/` – נתונים: `zones.json` (פמ"ת), `notams.json`, `meta.json` (עדכונים ויומן גרסאות)
- `pipeline/` – סקריפטי העדכון ו-`RUNBOOK.md`

עדכון אוטומטי: משימות מתוזמנות של Claude (נוטאם כל 6 שעות, פמ"ת יומי) מבצעות commit לתיקיית `data/`.
## קישורים
- **אתר חי (מתעדכן):** https://harelrynar.github.io/drone-map-il/
- **גרסאות מוקפאות:** כל גרסה נשמרת בתיקייה `versions/<גרסה>/` ומקבלת קישור קבוע, למשל https://harelrynar.github.io/drone-map-il/versions/1.1/ .
  רשימת הגרסאות: `data/versions.json` (מוצגת גם בחלון "אודות" באתר).
- **שחזור גרסה:** להעתיק את תוכן `versions/<גרסה>/` חזרה לשורש (או לבקש מ-Claude "חזור לגרסה X").

---

# UAS airspace map – Israel

**Live site: https://harelrynar.github.io/drone-map-il/** (Hebrew and English, works on a phone)

An interactive map for drone / UAS pilots in Israel. Tap any point to see what applies there:

- **Airspace from the Israeli AIP** – prohibited, restricted and danger areas (P/R/D), UAS no-fly areas (LLU), UAS flight areas, CTR/ATZ, airports, airstrips, heliports and nature-reserve flight limits. Checked daily.
- **NOTAMs** – temporary closures drawn on the map, refreshed every 6 hours. When a NOTAM's location or size is uncertain it is shown as an approximate area together with the original text.
- **Point weather** – wind, gusts, wind at 100 m, rain, visibility, estimated cloud base (Open-Meteo).
- **Ground elevation** – zone limits converted to metres above the ground at the point.
- **Obstacles, built-up areas and crowd places** – power lines, masts, chimneys, turbines, tall structures, schools, stadiums (OpenStreetMap).
- **Low-level traffic** – aircraft broadcasting ADS-B below 5,000 ft, delayed by one to two minutes.
- **Who do I call?** – the coordination contacts published for the zones at the point, with tap-to-dial.

**This is an aid only.** The binding sources are the official AIP and NOTAM publications of the Civil Aviation Authority of Israel. The remote pilot is responsible for checking permits and restrictions.

Built with Leaflet, no build step. Data sources: Israel AIP and NOTAM (CAAI / IAA), Open-Meteo, © OpenStreetMap contributors (ODbL), community ADS-B (adsb.fi).
