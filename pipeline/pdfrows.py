"""Extract table rows from Hebrew AIP PDFs with logical-order Hebrew text."""
import pdfplumber, re, sys, json
HEB = re.compile(r'[֐-׿]')
def fix_line(l):
    l = l.strip()
    if not HEB.search(l): return l
    r = l[::-1]
    # re-reverse runs that must stay LTR (numbers, latin, coords)
    r = re.sub(r"[0-9A-Za-z°'\"’.,:/\-()%]+(?: [0-9A-Za-z°'\"’.,:/\-%]+)*", lambda m: m.group(0)[::-1], r)
    r = r.replace('(', '\x00').replace(')', '(').replace('\x00', ')')
    return r
def fix(c):
    return '\n'.join(fix_line(x) for x in (c or '').split('\n')).strip()
def rows(path, pages=None):
    pdf = pdfplumber.open(path); out = []
    for i, p in enumerate(pdf.pages):
        if pages and (i + 1) not in pages: continue
        for t in p.extract_tables():
            for r in t:
                cells = [fix(c) for c in r if c and c.strip()]
                if cells: out.append({"page": i + 1, "cells": cells})
    return out
if __name__ == "__main__":
    a, b = map(int, sys.argv[2].split('-'))
    json.dump(rows(sys.argv[1], set(range(a, b + 1))), open(sys.argv[3], 'w'), ensure_ascii=False, indent=0)
