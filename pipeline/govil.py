"""Headless-Chrome helper for gov.il (Cloudflare).
usage: govil.py links <outjson> <url> [<url>...]   -> page text + all links
       govil.py pdf <outdir> <url> [<url>...]       -> download files"""
import asyncio, sys, json, os, re, urllib.parse
from playwright.async_api import async_playwright
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
async def main():
    mode, out, urls = sys.argv[1], sys.argv[2], sys.argv[3:]
    async with async_playwright() as p:
        b = await p.chromium.launch(**({"executable_path": "/usr/bin/google-chrome"} if __import__("os").path.exists("/usr/bin/google-chrome") else {}), headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        ctx = await b.new_context(locale="he-IL", user_agent=UA, accept_downloads=True)
        pg = await ctx.new_page()
        await pg.goto("https://www.gov.il/he/pages/aip", wait_until="domcontentloaded", timeout=90000)
        await pg.wait_for_timeout(1500)
        res = {}
        for u in urls:
            if mode == "links":
                try:
                    await pg.goto(u, wait_until="networkidle", timeout=90000); await pg.wait_for_timeout(1500)
                    text = await pg.inner_text("main") if await pg.query_selector("main") else await pg.inner_text("body")
                    links = await pg.eval_on_selector_all("main a, a[href*='BlobFolder']", "els=>els.map(e=>[e.innerText.trim(),e.href])")
                    res[u] = {"text": text, "links": links}; print("ok", u, len(links))
                except Exception as e:
                    print("ERR", u, e); res[u] = {"error": str(e)}
            else:
                os.makedirs(out, exist_ok=True)
                name = urllib.parse.unquote(u.split("/")[-1]).replace("'", "").replace(" ", "_")
                try:
                    b64 = await pg.evaluate("""async (u) => { const r = await fetch(u, {credentials:'include'}); if (!r.ok) return 'ERR' + r.status;
                        const buf = new Uint8Array(await r.arrayBuffer()); let s=''; for (let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null, buf.subarray(i,i+32768)); return btoa(s); }""", u)
                    if b64.startswith("ERR"): print(b64, name); continue
                    import base64; body = base64.b64decode(b64)
                    open(os.path.join(out, name), "wb").write(body)
                    print("ok", len(body), name, body[:4])
                except Exception as e:
                    print("ERR", u, str(e)[:200])
        if mode == "links":
            json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
        await b.close()
asyncio.run(main())
