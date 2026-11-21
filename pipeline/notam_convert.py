# -*- coding: utf-8 -*-
"""Convert the new IAA AeroInfo NOTAM list (aeroinfo.iaa.gov.il, api/AeroInfo/GetNotams) to the raw
format notam_build.py expects: list of {id, loc, Airfield, FromDate, ToDate, raw}.

usage: python3 notam_convert.py <search1.json> [<search2.json> ...] <out_all.json>   (searches are merged by NOTAM id)

Each search is read in the owner's Chrome with notam_browser.js ("Hours ahead" = 99, the site's maximum):
search 1 from now, search 2 with "Valid from" = today + 4 days, so the map covers about 8 days ahead.
Kept: NOTAMs in force now or starting later. Dropped: cancellations (NOTAMC), NOTAMs replaced or
cancelled by another NOTAM in the list, and NOTAMs whose end time (C) has passed.
"""
import json, re, sys
from datetime import datetime, timezone

*srcs, out = sys.argv[1:]
items, seen = [], set()
for src in srcs:
    for it in json.load(open(src, encoding="utf-8")):
        if it.get("notamID") not in seen: seen.add(it.get("notamID")); items.append(it)
now = datetime.now(timezone.utc)

def yymmddhhmm(s):
    m = re.match(r"(\d{10})", s or "")
    if not m: return None
    s = m.group(1)
    return datetime(2000 + int(s[0:2]), int(s[2:4]), int(s[4:6]), int(s[6:8]), int(s[8:10]), tzinfo=timezone.utc)

def field(raw, k):
    m = re.search(r"(?:^|\s)" + k + r"\)\s*(\S+)", raw or "")
    return m.group(1) if m else ""

# NOTAM ids that another NOTAM in the list replaces (NOTAMR) or cancels (NOTAMC)
killed = set()
for it in items:
    m = re.search(r"NOTAM[RC]\s+([A-Z]\d{4}/\d{2})", it.get("messageText") or "")
    if m: killed.add(m.group(1))

res, stats = [], {"in": len(items), "cancel": 0, "replaced": 0, "expired": 0, "no_text": 0}
for it in items:
    nid, raw = (it.get("notamID") or "").strip(), (it.get("messageText") or "").strip()
    if not nid or not raw: stats["no_text"] += 1; continue
    if (it.get("messageType") or "").upper() == "NOTAMC" or re.search(r"\bNOTAMC\b", raw[:40]): stats["cancel"] += 1; continue
    if nid in killed: stats["replaced"] += 1; continue
    c = field(raw, "C")
    end = None if c.upper().startswith("PERM") else yymmddhhmm(c)
    if end and end < now: stats["expired"] += 1; continue
    loc = (it.get("locationIndicator") or "").strip()
    res.append({"id": nid, "loc": loc, "Airfield": loc, "FromDate": None, "ToDate": None,
                "CreateDate": it.get("createdDate"), "raw": raw})

ids = [r["id"] for r in res]
assert len(ids) == len(set(ids)), "duplicate NOTAM ids"
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
stats["out"] = len(res)
print(json.dumps(stats))
