# UAS airspace map – update runbook

Artifact slug: `444ddce3-fdd5-4268-9eaa-dca6666d25f4` (https://claude.ai/artifact/9SCco6f5kuN1kmbpBb5eTV)
Pipeline files are stored in the artifact under `pipeline/` (each `*.py.txt` → save as `/home/claude/build/<name>.py`).

## 0. Setup (every run – the session starts empty)
1. `mkdir -p /home/claude/build /home/claude/site/data /home/claude/raw/notam /home/claude/raw/aip/pdf`
2. Artifact `read_file` with `paths` = all `pipeline/*` files + `data/meta.json`, `data/notams.json`, `data/notam_ai.json`, `data/basemap.json`
   (+ `data/zones.json` and `data/aip_state.json` for the AIP run). Copy each saved resource to:
   - `pipeline/X.py.txt` → `/home/claude/build/X.py`, `pipeline/X.json` → `/home/claude/build/X.json`
   - `pipeline/enr51.txt` → `/home/claude/raw/aip/pdf/enr51.txt` (eAIP ENR 5.1 text, used by build_prd.py)
   - `data/*` → `/home/claude/site/data/*`  (and copy `data/notam_ai.json` also to `/home/claude/build/notam_ai.json`)
3. `pip install --break-system-packages -q pdfplumber shapely pyproj requests playwright`;
   if `/usr/bin/google-chrome` is missing: `python3 -m playwright install chromium`.
4. Network: needs brin.iaa.gov.il, *.gov.il, openapi-gc.digital.gov.il (gov.il pages need headless Chrome – Cloudflare).

## A. NOTAM run (every 6 hours)
1. `cd /home/claude/build && python3 -I notam_fetch.py /home/claude/raw/notam/all.json` (≈3 min, 0.8 s between requests – do not speed up; the site has a WAF).
2. `python3 notam_build.py /home/claude/raw/notam/all.json /home/claude/site/data/basemap.json /home/claude/site/data/notams.json /home/claude/build/notams.json /home/claude/build/notam_ai.json`
3. **Interpretation review (this is the AI step).** For every NOTAM id that is NEW compared to the previous `data/notams.json`:
   - read its raw text; if the auto `name`/`remarks` is unclear, the kind is wrong, or the geometry is `approx`/`unplaced`,
     add an entry to `notam_ai.json` (`name_he`, `summary_he`, optional `kind` = general|other|ad, `geometry` (GeoJSON), `radius_m`,
     `confidence` exact|approx, `approxReason` (Hebrew – why it is an estimate)). Keep Hebrew clear for drone pilots.
   - FIR-wide restrictions that affect drones → `kind: "general"`.
   - Never invent a precise shape: if location/size is uncertain mark `confidence: "approx"`, explain in `approxReason`; the raw NOTAM is always shown as a quote.
   - Remove entries for NOTAM ids that no longer exist. Re-run step 2.
4. `python3 assemble.py /home/claude/site/data --notam`
5. Publish (artifact `get_artifact` → version; `publish_files` mode patch): `data/notams.json`, `data/meta.json`, `data/notam_ai.json` (from build dir).
6. If there are new NOTAMs relevant to drones (UAS activity, closures/obstacles up to ~1,500 ft AGL, new general notices), finish with a short
   Hebrew summary (what/where/when) – it is sent to the owner as a push notification. Otherwise end with "אין שינויים מהותיים".

## B. AIP run (daily)
1. `python3 aip_check.py /home/claude/site/data/aip_state.json /home/claude/build/aip_state.json` → JSON report.
2. If nothing changed: only set `meta.aip.checkedAt` = now (edit `data/meta.json`), publish `data/meta.json`, `data/aip_state.json`. Done.
3. If `א'-17*.pdf` changed: `python3 build_prd.py` (automatic parse). Check the log for `NO GEOMETRY` and review curated.py remarks/contacts against the new text.
4. If `ב'-09.pdf`, airport/airstrip pages, or `א'-07.pdf` changed: extract text (`pdftotext -layout`), compare with the transcriptions in
   `build_uas.py` / `build_ad.py` / `curated.py`, edit them, run them.
5. `python3 build_uas.py && python3 build_ad.py` (always – they are cheap), then
   `python3 assemble.py /home/claude/site/data --aip --aip-edition "<edition text from the chapter page / update notes>"`
   (assemble diffs against the previous zones.json and writes change entries → the site banner shows them).
6. Publish `data/zones.json`, `data/meta.json`, `data/aip_state.json`, and any edited `pipeline/*.py.txt`.
7. End with a Hebrew summary of AIP changes (or "אין שינויים בפמ\"ת").

## Annex map overlays (data/overlays/*.png + data/overlays.json)
If `aip_Bet 09 - Nispah A.pdf` or `א'-17 - נספח א'.pdf` changed (aip_check report), re-georeference:
`python3 georef_annex.py <pdf> out.png out.json 34.5,35.0,35.5 31.0,31.5,32.0,32.5,33.0 250` (UAS map) /
`... 34.0,34.5,35.0,35.5,36.0 29.5,30.0,30.5,31.0,31.5,32.0,32.5,33.0 300` (P/R/D map) – the lon/lat lists must match the chart graticule.
Quantize to 96 colours (PIL `quantize`), update `bounds`/`err_m`/`edition` in overlays.json, publish both.
Localities (basemap.json `cities`) come from CBS via data.gov.il datastore resource d47a54ff-87f0-44b3-b33a-f284c0c38e5a (ITM → WGS84).

## Adding features
- New layer → `js/config.js` (`layers`, `drawOrder`), texts in `js/i18n.js`. Bump `version` and add an `appChangelog` entry in `data/meta.json`.
