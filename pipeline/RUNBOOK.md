# UAS airspace map – update runbook (GitHub edition)

**Primary site:** https://harelrynar.github.io/drone-map-il/ – repo `harelrynar/drone-map-il`, branch `main` (GitHub Pages serves the repo root).
The claude.ai artifact (444ddce3-…) is a legacy preview and is no longer updated.

## 0. Setup (every run – the session starts empty)
1. Attach and clone the repo: call the add_repo tool (owner `harelrynar`, repo `drone-map-il`, access `push`), then
   `git clone --depth 1 https://github.com/harelrynar/drone-map-il /home/claude/drone-map-il` (generous timeout).
2. `mkdir -p /home/claude/build /home/claude/raw/notam /home/claude/raw/aip/pdf && cp /home/claude/drone-map-il/pipeline/*.py /home/claude/drone-map-il/pipeline/*.json /home/claude/build/ && cp /home/claude/drone-map-il/pipeline/enr51.txt /home/claude/raw/aip/pdf/ && cp /home/claude/drone-map-il/data/notam_ai.json /home/claude/build/`
3. Use `/home/claude/drone-map-il/data` wherever the steps below say `/home/claude/site/data`
   (e.g. `ln -sfn /home/claude/drone-map-il/data /home/claude/site/data` after `mkdir -p /home/claude/site`).
4. `pip install --break-system-packages -q pdfplumber shapely pyproj requests playwright geopandas pyogrio`;
   if `/usr/bin/google-chrome` is missing: `python3 -m playwright install chromium`.
5. Publishing = `cd /home/claude/drone-map-il && git add data pipeline && git commit -m "<what changed>" && git push origin main`
   (if the push is rejected: `git pull --rebase origin main` once, then push). Never push tags (blocked); never touch `versions/`.
   After a NOTAM run also copy `/home/claude/build/notam_ai.json` to `data/notam_ai.json` before committing.

## Versions
Frozen copies live in `versions/<v>/` (index.html, css, js, data) and are listed in `data/versions.json`; each also has a branch `release-<v>`.
Only create a new version when the user asks.

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
5. Publish (see 0.5): commit `data/notams.json`, `data/meta.json`, `data/notam_ai.json`.
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

## C. CAAI GIS layers (chapter 11 "שכבות מידע גאוגרפיות") – run when aip_check reports a change in the zips or chapter 11
These are the official layers of the same data family the DronesIL app shows. They are used to cross-check and fill gaps; the A-17 tables stay the binding source.
1. Files are downloaded by aip_check.py into /home/claude/raw/aip/pdf/: `אסורים_לטיסה_וCTRים.zip`, `RATAG_kmz.zip`.
2. `mkdir -p /home/claude/raw/gis && cd /home/claude/raw/gis && unzip -o ../aip/pdf/אסורים_לטיסה_וCTRים.zip -d prd && unzip -o ../aip/pdf/RATAG_kmz.zip -d ratag && unzip -o ratag/*/*.kmz -d ratag/k && cp ratag/k/doc.kml ratag.kml`
3. `pip install --break-system-packages -q geopandas pyogrio` then
   `python3 -c "import pyogrio,glob;g=glob.glob('/home/claude/raw/gis/prd/*.gdb')[0];[pyogrio.read_dataframe(g,layer=l).to_crs(4326).to_file(f'/home/claude/raw/gis/{o}.geojson',driver='GeoJSON') for l,o in (('CTR','ctr'),('F_Limited','flimited'))]"`
4. annexE.json (A-17 annex E altitudes) is in pipeline/; regenerate only if A-17 changed (see build_gis.py docstring / pdfrows on pages 31-50).
5. `python3 build_gis.py && python3 build_prd.py && python3 build_uas.py && python3 build_ad.py`
6. `python3 assemble.py /home/claude/site/data --aip` and `python3 crosscheck.py /home/claude/site/data/zones.json /home/claude/site/data/crosscheck.json`
7. Publish zones.json, meta.json, crosscheck.json. In the final message mention new/removed areas and any cross-check status that is "differs".

## D. DronesIL sanity check (daily, owner-only alert)
DronesIL (CAAI app, Android `il.gov.rata`) has no public API; it shows the chapter-11 CAAI GIS layers. This run downloads them fresh and
compares them with the live `data/zones.json`. Result goes ONLY to the owner (final message → push). Nothing is written to `data/`.
1. Setup (section 0, steps 1, 2, 4).
2. `cd /home/claude/build && python3 govil.py pdf /home/claude/raw/aip/pdf "https://www.gov.il/BlobFolder/guide/aip/he/%D7%90%D7%A1%D7%95%D7%A8%D7%99%D7%9D%20%D7%9C%D7%98%D7%99%D7%A1%D7%94%20%D7%95CTR%D7%99%D7%9D.zip" "https://www.gov.il/BlobFolder/guide/aip/he/RATAG_kmz.zip"`
3. Section C steps 2–3 (unzip, convert to GeoJSON), then `python3 build_gis.py` (only to produce /home/claude/build/gis.json – do NOT run assemble).
4. `python3 dronesil_check.py /home/claude/drone-map-il/data/zones.json /home/claude/drone-map-il/pipeline/dronesil_state.json /home/claude/build/dronesil_report.json`
   Exit 0 = no new gaps, 10 = new gaps, 2 = bad/missing input (report the error, do not commit).
5. Commit only `pipeline/dronesil_state.json` (message "DronesIL sanity check <date>") and push to main.
6. Final message (Hebrew): if new gaps – one line per gap (layer, id, name, what differs) + "נפתרו" list if any + whether the CAAI files changed;
   recommend whether the map needs a fix (e.g. run section C). If none: "אין פערים חדשים מול DronesIL".
   To accept a gap permanently nothing is needed – each gap is reported once (state keeps it). Delete its key from the state file to re-alert.
