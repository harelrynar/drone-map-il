# -*- coding: utf-8 -*-
"""Merge built layers into site/data/*.json and maintain meta.json (update times + change log).
usage: python3 assemble.py <site_data_dir> [--aip] [--notam] [--aip-edition "..."]"""
import json, sys, os
from datetime import datetime, timezone
B = "/home/claude/build/"
out = sys.argv[1]
now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
meta_p = os.path.join(out, "meta.json")
meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
if meta.get("demo"):
    meta = {"appChangelog": meta.get("appChangelog", [])}
meta.setdefault("changes", []); meta["demo"] = False

def fid(f): return f["properties"]["id"]

if "--aip" in sys.argv:
    feats = []
    for n in ("prd.json", "uas.json", "ad.json"):
        feats += json.load(open(B + n))["features"]
    zp = os.path.join(out, "zones.json")
    old = json.load(open(zp))["features"] if os.path.exists(zp) else []
    oldm = {fid(f): f for f in old if not fid(f).startswith("demo")}
    newm = {fid(f): f for f in feats}
    ch = []
    if oldm:
        for k, f in newm.items():
            if k not in oldm: ch.append(("added", f))
            elif json.dumps(oldm[k], sort_keys=True) != json.dumps(f, sort_keys=True): ch.append(("changed", f))
        for k, f in oldm.items():
            if k not in newm: ch.append(("removed", f))
    lbl = {"added": "נוסף", "changed": "עודכן", "removed": "הוסר"}
    for kind, f in ch:
        meta["changes"].append({"at": now, "source": "aip", "kind": kind, "id": fid(f),
                                "text": {"he": f"פמ\"ת – {lbl[kind]}: {f['properties']['name']['he']}", "en": f"AIP {kind}: {f['properties']['name'].get('en', '')}"}})
    json.dump({"type": "FeatureCollection", "features": feats}, open(zp, "w"), ensure_ascii=False, separators=(",", ":"))
    ed = sys.argv[sys.argv.index("--aip-edition") + 1] if "--aip-edition" in sys.argv else meta.get("aip", {}).get("edition")
    meta["aip"] = {"updatedAt": now, "edition": ed, "count": len(feats),
                   "summary": {"he": (f"{len(ch)} שינויים בפמ\"ת" if oldm else f"טעינה ראשונה: {len(feats)} אזורים ונקודות") + (f" · {ed}" if ed else ""),
                               "en": f"{len(ch)} AIP changes" if oldm else f"Initial load: {len(feats)} features"}}
    print("AIP features", len(feats), "changes", len(ch))

if "--notam" in sys.argv:
    n = json.load(open(B + "notams.json"))
    json.dump({"located": n["located"], "unlocated": n["unlocated"]}, open(os.path.join(out, "notams.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    meta["changes"] += n.get("changes", [])
    loc = n["located"]["features"]
    nap = sum(1 for f in loc if f["properties"]["confidence"] == "approx")
    gen = [u for u in n["unlocated"] if u["kind"] == "general"]
    meta["notam"] = {"updatedAt": now, "count": len(loc) + len(n["unlocated"]),
                     "summary": {"he": f"{len(loc)} נוטאמים על המפה ({nap} במיקום משוער), {len(gen)} הודעות כלליות, {len(n['unlocated']) - len(gen)} נוספים ברשימה" + (f" · {len(n.get('changes', []))} שינויים" if n.get("changes") else ""),
                                 "en": f"{len(loc)} on map ({nap} approximate), {len(gen)} general"}}
    print("NOTAM located", len(loc), "changes", len(n.get("changes", [])))

# keep the change log bounded (last 400 entries / 30 days)
meta["changes"] = sorted(meta["changes"], key=lambda c: c["at"], reverse=True)[:400]
meta["generatedAt"] = now
json.dump(meta, open(meta_p, "w"), ensure_ascii=False, indent=1)
