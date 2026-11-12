#!/usr/bin/env python3
"""GNSS beta – ADS-B collector (runs in GitHub Actions).

The ADS-B community APIs do not allow direct calls from a browser (no CORS headers),
so this job samples them once a minute and publishes the last 16 minutes of samples
as gnss.json on the `gnss-data` branch. The site reads that file and does the
classification itself (beta/gnss/js/gnss.js) – there is no second copy of the logic here.

usage: collect.py <out_dir> <run_seconds>
"""
import json, os, subprocess, sys, time, urllib.request

LAT, LON, NM = 31.4, 35.05, 160
BBOX = (28.9, 33.6, 33.9, 36.5)          # S, W, N, E – a margin around the map grid
KEEP_SEC = 16 * 60
INTERVAL = 60
PROVIDERS = [
    ("adsb.fi", f"https://opendata.adsb.fi/api/v2/lat/{LAT}/lon/{LON}/dist/{NM}"),
    ("adsb.lol", f"https://api.adsb.lol/v2/point/{LAT}/{LON}/{NM}"),   # 500 requests/day – fallback only
]
FIELDS = ("hex", "flight", "r", "type", "lat", "lon", "alt_baro", "alt_geom", "gs", "nic", "nac_p",
          "version", "seen_pos", "gpsOkBefore", "gpsOkLat", "gpsOkLon")


def fetch():
    err = None
    for name, url in PROVIDERS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "drone-map-il gnss beta (github.com/harelrynar/drone-map-il)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                j = json.load(r)
            ac = j.get("ac") or j.get("aircraft")
            if not isinstance(ac, list):
                raise ValueError("bad payload")
            return name, ac
        except Exception as e:           # noqa: BLE001
            err = f"{name}: {e}"
    raise RuntimeError(err or "no provider")


def slim(a):
    def inside(la, lo):
        return isinstance(la, (int, float)) and isinstance(lo, (int, float)) and BBOX[0] <= la <= BBOX[2] and BBOX[1] <= lo <= BBOX[3]
    if not (inside(a.get("lat"), a.get("lon")) or inside(a.get("gpsOkLat"), a.get("gpsOkLon"))):
        return None
    return {k: a[k] for k in FIELDS if a.get(k) is not None}


def git(out, *args):
    return subprocess.run(["git", "-C", out, *args], check=False, capture_output=True, text=True)


def main():
    out, run_sec = sys.argv[1], int(sys.argv[2])
    path = os.path.join(out, "gnss.json")
    try:
        feed = json.load(open(path))
    except Exception:                    # noqa: BLE001
        feed = {}
    snaps = feed.get("snaps") or []
    end = time.time() + run_sec
    while True:
        t0 = time.time()
        now = int(t0 * 1000)
        try:
            provider, ac = fetch()
            rows = [s for s in (slim(a) for a in ac) if s]
            snaps.append({"t": now, "ac": rows})
            feed.update(updated=now, provider=provider, error=None)
            print(time.strftime("%H:%M:%S"), provider, len(rows), "aircraft", flush=True)
        except Exception as e:           # noqa: BLE001
            feed["error"] = str(e)
            print("fetch failed:", e, flush=True)
        snaps = [s for s in snaps if s["t"] >= now - KEEP_SEC * 1000]
        feed.update(v=1, checked=now, intervalSec=INTERVAL, windowSec=KEEP_SEC, snaps=snaps)
        with open(path, "w") as f:
            json.dump(feed, f, separators=(",", ":"))
        git(out, "add", "gnss.json")
        git(out, "commit", "-q", "--amend", "-m", "GNSS feed (single rolling commit)")
        p = git(out, "push", "-q", "-f", "origin", "HEAD:gnss-data")
        if p.returncode:
            print("push failed:", p.stderr.strip()[:300], flush=True)
        if time.time() >= end:
            break
        time.sleep(max(5, INTERVAL - (time.time() - t0)))


if __name__ == "__main__":
    main()
