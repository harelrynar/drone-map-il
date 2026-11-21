# -*- coding: utf-8 -*-
"""Record a successful check that found nothing to publish: sets meta[<src>].checkedAt = now.
usage: python3 mark_checked.py <site_data_dir> aip|notam
Only call this after a check that really succeeded (source read OK, data identical / no real change).
Never call it after a failed fetch or when a change is waiting for the owner's approval."""
import json, sys, os
from datetime import datetime, timezone
d, src = sys.argv[1], sys.argv[2]
assert src in ("aip", "notam"), "src must be aip or notam"
p = os.path.join(d, "meta.json")
meta = json.load(open(p))
now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
meta.setdefault(src, {})["checkedAt"] = now
json.dump(meta, open(p, "w"), ensure_ascii=False, indent=1)
print(src, "checkedAt", now)
