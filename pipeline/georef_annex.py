"""Georeference an AIP annex map PDF using its own graticule lines and warp it to a Web-Mercator image overlay.
usage: georef_annex.py <pdf> <out.png> <out.json> lons(comma) lats(comma) [dpi] [page]"""
import sys, math, json, numpy as np, pdfplumber, subprocess, os
from PIL import Image
pdf, out_png, out_json = sys.argv[1:4]
LONS = [float(v) for v in sys.argv[4].split(",")]; LATS = [float(v) for v in sys.argv[5].split(",")]
DPI = int(sys.argv[6]) if len(sys.argv) > 6 else 300; PAGE = int(sys.argv[7]) if len(sys.argv) > 7 else 1
pg = pdfplumber.open(pdf).pages[PAGE - 1]
cand = []
for l in pg.lines + pg.curves:
    pts = l.get("pts") or []
    if len(pts) < 2: continue
    L = sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
    if L > 200 and l.get("linewidth", 1) < 0.6: cand.append(([tuple(p) for p in pts], l.get("stroking_color"), L))
# graticule = the most common colour among the longest thin lines; keep only near-full-span lines
from collections import Counter
col = Counter(str(c[1]) for c in sorted(cand, key=lambda c: -c[2])[:12]).most_common(1)[0][0]
spanx = max(p[0] for c in cand for p in c[0]) - min(p[0] for c in cand for p in c[0])
spany = max(p[1] for c in cand for p in c[0]) - min(p[1] for c in cand for p in c[0])
cand = [c[0] for c in cand if str(c[1]) == col and (abs(c[0][-1][0]-c[0][0][0]) > 0.75*spanx or abs(c[0][-1][1]-c[0][0][1]) > 0.75*spany)]
mer = sorted([c for c in cand if abs(c[-1][1]-c[0][1]) > abs(c[-1][0]-c[0][0])], key=lambda c: sum(p[0] for p in c)/len(c))
par = sorted([c for c in cand if abs(c[-1][1]-c[0][1]) <= abs(c[-1][0]-c[0][0])], key=lambda c: -sum(p[1] for p in c)/len(c))  # south first (larger y)
assert len(mer) == len(LONS) and len(par) == len(LATS), (len(mer), len(par))
def inter(a, b):
    for i in range(len(a)-1):
        for j in range(len(b)-1):
            (x1,y1),(x2,y2),(x3,y3),(x4,y4) = a[i],a[i+1],b[j],b[j+1]
            d = (x1-x2)*(y3-y4)-(y1-y2)*(x3-x4)
            if abs(d) < 1e-9: continue
            t = ((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/d; u = -((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/d
            if -0.01 <= t <= 1.01 and -0.01 <= u <= 1.01: return (x1+t*(x2-x1), y1+t*(y2-y1))
gcp = []
for lon, m in zip(LONS, mer):
    for lat, p in zip(LATS, par):
        q = inter(m, p)
        if q: gcp.append((lon, lat, q[0], q[1]))
G = np.array(gcp)
def design(lon, lat):
    lon, lat = np.asarray(lon), np.asarray(lat)
    return np.stack([np.ones_like(lon), lon, lat, lon*lat, lon**2, lat**2], -1)
A = design(G[:,0], G[:,1])
cx, *_ = np.linalg.lstsq(A, G[:,2], rcond=None); cy, *_ = np.linalg.lstsq(A, G[:,3], rcond=None)
res = np.hypot(A@cx - G[:,2], A@cy - G[:,3])
pts_per_deg_lat = abs((A@cy)[0] - (A@cy)[1]) / abs(LATS[1]-LATS[0]) if len(LATS) > 1 else 1
print("GCPs", len(gcp), "max residual pt", res.max().round(3), "≈ m", round(res.max() / pts_per_deg_lat * 111000))
# map frame = bbox of all long lines
xs = [p[0] for c in cand for p in c]; ys = [p[1] for c in cand for p in c]
fx0, fx1, fy0, fy1 = min(xs), max(xs), min(ys), max(ys)
# render
tmp = "/tmp/georef_render"
subprocess.run(["pdftoppm", "-f", str(PAGE), "-l", str(PAGE), "-r", str(DPI), "-png", "-singlefile", pdf, tmp], check=True, capture_output=True)
src = np.asarray(Image.open(tmp + ".png").convert("RGB")); s = DPI / 72.0
# inverse fit for bounds: pdf -> lon/lat (for frame corners)
B = np.stack([np.ones(len(G)), G[:,2], G[:,3], G[:,2]*G[:,3], G[:,2]**2, G[:,3]**2], -1)
ilon, *_ = np.linalg.lstsq(B, G[:,0], rcond=None); ilat, *_ = np.linalg.lstsq(B, G[:,1], rcond=None)
def inv(x, y): v = np.array([1, x, y, x*y, x*x, y*y]); return v@ilon, v@ilat
corners = [inv(x, y) for x in (fx0, fx1) for y in (fy0, fy1)]
W_, E_ = min(c[0] for c in corners), max(c[0] for c in corners); S_, N_ = min(c[1] for c in corners), max(c[1] for c in corners)
merc = lambda lat: math.log(math.tan(math.pi/4 + math.radians(lat)/2))
OW = int((fx1 - fx0) * s * 1.05); OH = int((fy1 - fy0) * s * 1.05)
lons = np.linspace(W_, E_, OW); my = np.linspace(merc(N_), merc(S_), OH)
lats = np.degrees(2*np.arctan(np.exp(my)) - math.pi/2)
LO, LA = np.meshgrid(lons, lats)
D = design(LO, LA)
X = (D@cx) * s; Y = (D@cy) * s
inside = (X/s >= fx0) & (X/s <= fx1) & (Y/s >= fy0) & (Y/s <= fy1)
Xi = np.clip(X.round().astype(int), 0, src.shape[1]-1); Yi = np.clip(Y.round().astype(int), 0, src.shape[0]-1)
rgb = src[Yi, Xi]
alpha = np.where(inside, 255, 0).astype(np.uint8)
light = (rgb.min(-1) > 238)                 # paper white -> transparent
alpha[light] = 0
img = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")
img.save(out_png, optimize=True)
json.dump({"bounds": [[S_, W_], [N_, E_]], "gcp_count": len(gcp), "max_residual_m": int(res.max() / pts_per_deg_lat * 111000)}, open(out_json, "w"))
print("bounds", [[round(S_,4), round(W_,4)], [round(N_,4), round(E_,4)]], "size", img.size, os.path.getsize(out_png)//1024, "KB")
