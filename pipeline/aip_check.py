# -*- coding: utf-8 -*-
"""Daily AIP check: fetch chapter pages (via headless Chrome), list their documents, download the key PDFs,
and compare with the previous state.  usage: python3 aip_check.py <prev_state.json|-> <out_state.json>
Prints a JSON report: {"changed_chapters": [...], "changed_docs": [...], "new_docs": [...], "removed_docs": [...]}"""
import json, sys, os, re, html, hashlib, subprocess
B = "/home/claude/build/"; RAW = "/home/claude/raw/aip/"
os.makedirs(RAW + "pdf", exist_ok=True)
CHAPTERS = ["4", "5", "7", "8", "9"]
# documents whose geometry/text the map is built from (re-parse / re-review if they change)
KEY_DOCS = {
    "א'-17.pdf": "P/R/D + LLU (build_prd.py – automatic)",
    "א'-17 - נספח א'.pdf": "P/R/D map",
    "ב'-09.pdf": "UAS zones (build_uas.py – hand transcription, review!)",
    "aip_Bet 09 - Nispah A.pdf": "UAS map",
    "א'-07.pdf": "ATC phone numbers (curated.py)",
}
SUBPAGES = ["herzelia-airport", "haifa-airport", "roashpina-airport", "beersheva-landing-ground", "landing-ground-habonim", "megido-landing-ground",
            "masada-landing-ground", "einyahav-landing-ground", "einshemer-landing-ground", "pik-landing-ground", "kziot", "kiryatshmona-landing-ground",
            "rishonlezion-landing-ground", "others-landing-ground"]

def run(args):
    return subprocess.run([sys.executable] + args, capture_output=True, text=True, timeout=1500)

prev = json.load(open(sys.argv[1])) if sys.argv[1] != "-" and os.path.exists(sys.argv[1]) else {}
run([B + "aip_api.py", RAW] + CHAPTERS)
state = {"chapters": {}, "docs": {}}
urls = []
for ch in CHAPTERS:
    p = RAW + f"chapter{ch}.json"
    if not os.path.exists(p): continue
    d = json.load(open(p)) or {}
    upd = ((d.get("contentHead") or {}).get("metaData") or {}).get("תאריך עדכון", [{}])[0].get("title")
    s = html.unescape(json.dumps(d, ensure_ascii=False))
    links = sorted(set(re.findall(r'(?:https://www\.gov\.il)?/BlobFolder/[^"\'<>\\]+?\.pdf', s, re.I)))
    state["chapters"][ch] = {"updated": upd, "links": links}
    urls += [("https://www.gov.il" + u) if u.startswith("/") else u for u in links]
# key docs
key_urls = [u for u in urls if any(u.endswith(k.replace(" ", "%20")) or u.endswith(k) for k in KEY_DOCS)]
key_urls += ["https://www.gov.il/BlobFolder/guide/aip/he/%D7%90'-17.pdf", "https://www.gov.il/BlobFolder/guide/aip/he/%D7%90'-17%20-%20%D7%A0%D7%A1%D7%A4%D7%97%20%D7%90'.pdf",
             "https://www.gov.il/BlobFolder/guide/aip/he/%D7%91'-09.pdf", "https://www.gov.il/BlobFolder/guide/aip/he/%D7%90'-07.pdf"]
run([B + "govil.py", "pdf", RAW + "pdf"] + sorted(set(key_urls)))
import urllib.parse
key_names = {urllib.parse.unquote(u.split("/")[-1]).replace("'", "").replace(" ", "_") for u in key_urls}
for f in os.listdir(RAW + "pdf"):
    if f in key_names:
        state["docs"][f] = hashlib.sha256(open(RAW + "pdf/" + f, "rb").read()).hexdigest()
# airport/airstrip pages: their 'last updated' line
r = run([B + "govil.py", "links", RAW + "sub.json"] + [f"https://www.gov.il/he/Departments/General/{p}" if "landing" in p or p == "kziot" else f"https://www.gov.il/he/pages/{p}" for p in SUBPAGES])
if os.path.exists(RAW + "sub.json"):
    for u, v in json.load(open(RAW + "sub.json")).items():
        m = re.search(r"תאריך עדכון:\s*([\d.]+)", v.get("text", ""))
        state["chapters"]["page:" + u.rsplit("/", 1)[-1]] = {"updated": m.group(1) if m else None, "links": sorted(set(h for t, h in v.get("links", []) if h.lower().endswith(".pdf")))}
report = {"changed_chapters": [], "changed_docs": [], "new_docs": [], "removed_docs": []}
if prev:
    for k, v in state["chapters"].items():
        pv = prev.get("chapters", {}).get(k)
        if not pv or pv.get("updated") != v.get("updated") or pv.get("links") != v.get("links"):
            report["changed_chapters"].append({"chapter": k, "was": pv and pv.get("updated"), "now": v.get("updated"),
                                               "added": sorted(set(v["links"]) - set(pv["links"] if pv else [])), "removed": sorted(set(pv["links"] if pv else []) - set(v["links"]))})
    for k, h in state["docs"].items():
        if k not in prev.get("docs", {}): report["new_docs"].append(k)
        elif prev["docs"][k] != h: report["changed_docs"].append(k)
    report["removed_docs"] = [k for k in prev.get("docs", {}) if k not in state["docs"]]
json.dump(state, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False, indent=1))
