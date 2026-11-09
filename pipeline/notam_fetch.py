"""Fetch IAA NOTAM list + full details via ASP.NET postback. Output JSON to argv[1]."""
import re, sys, json, html, time, requests
URL = "https://brin.iaa.gov.il/aeroinfo/AeroInfo.aspx?msgType=Notam"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}

def form_fields(s):
    f = {}
    for m in re.finditer(r'<input[^>]*>', s):
        tag = m.group(0)
        name = re.search(r'name="([^"]+)"', tag)
        if not name: continue
        typ = (re.search(r'type="([^"]+)"', tag) or [None, "text"])[1]
        if typ in ("submit", "image", "button"): continue
        if typ == "checkbox" and 'checked' not in tag: continue
        if 'disabled="disabled"' in tag: continue
        val = re.search(r'value="([^"]*)"', tag)
        f[name.group(1)] = html.unescape(val.group(1)) if val else ("on" if typ == "checkbox" else "")
    for m in re.finditer(r'<select name="([^"]+)".*?</select>', s, re.S):
        sel = re.search(r'<option[^>]*selected[^>]*value="([^"]*)"', m.group(0)) or re.search(r'<option[^>]*value="([^"]*)"', m.group(0))
        f[m.group(1)] = sel.group(1) if sel else ""
    return f

def clean(t):
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'[ \t\xa0]+', ' ', t).strip()

def parse_list(s):
    out = []
    for m in re.finditer(r'id="divMainInfo_(\d+)"(.*?)id="divMoreInfo_\1"', s, re.S):
        blk = m.group(2)
        nid = clean((re.search(r'class="NotamID">(.*?)</td>', blk, re.S) or [0, ""])[1])
        loc = clean((re.search(r'class="Location">(.*?)</td>', blk, re.S) or [0, ""])[1])
        lines = [clean(x) for x in re.findall(r'class="MsgText">(.*?)</td>', blk, re.S)]
        out.append({"key": m.group(1), "id": nid, "loc": loc, "preview": "\n".join(l for l in lines if l)})
    return out

def parse_more(s, key):
    a = re.search(r'id="tblMoreInfo1_%s"(.*?)</table>' % key, s, re.S)
    b = re.search(r'id="tblMoreInfo2_%s"(.*?)</table>' % key, s, re.S)
    rows = lambda x: [clean(r) for r in re.findall(r'<tr[^>]*>(.*?)</tr>', x.group(1), re.S)] if x else []
    return rows(a), rows(b)

def main(out):
    ses = requests.Session(); ses.headers.update(UA)
    r = ses.get(URL, timeout=40); s = r.text
    items = parse_list(s)
    print("list:", len(items), file=sys.stderr)
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10**9
    for i, it in enumerate(items[:limit]):
        f = form_fields(s)
        f.update({"hidMsgNum": it["key"], "hidMode": "more", "hidCurOrHist": "Current", "btnMoreInfo": ""})
        for att in range(3):
            try:
                rr = ses.post(URL, data=f, timeout=40, headers={"Referer": URL})
                if "Unauthorized" in rr.text[:2000]: raise RuntimeError("WAF")
                break
            except Exception as e:
                print("retry", it["id"], e, file=sys.stderr); time.sleep(3 + att * 5)
        else:
            continue
        s2 = rr.text
        m = re.search(r"f_buildMoreMsgInfo\('(<Msg .*?</Msg>)'", s2, re.S)
        if m:
            x = m.group(1)
            attrs = dict(re.findall(r'(\w+)="([^"]*)"', re.search(r'<Msg ([^>]*)>', x).group(1)))
            it.update({k: attrs.get(k) for k in ("Airfield", "FromDate", "ToDate", "CreateDate")})
            it["raw"] = "\n".join(html.unescape(t).rstrip() for t in re.findall(r"<MsgText>(.*?)</MsgText>", x, re.S))
        else:
            print("no detail", it["id"], file=sys.stderr)
        # keep the newest page state for the next postback
        if "__VIEWSTATE" in s2: s = s2
        time.sleep(0.8)
    json.dump(items, open(out, "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main(sys.argv[1])
