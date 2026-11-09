"""Load gov.il AIP chapter pages in headless Chrome and save the content-page API JSON. usage: aip_api.py outdir 5 7 8"""
import asyncio, sys, json, os
from playwright.async_api import async_playwright
async def main():
    out = sys.argv[1]; chapters = sys.argv[2:]
    async with async_playwright() as p:
        b = await p.chromium.launch(**({"executable_path": "/usr/bin/google-chrome"} if __import__("os").path.exists("/usr/bin/google-chrome") else {}), headless=True, args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
        ctx = await b.new_context(locale="he-IL", user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
        pg = await ctx.new_page()
        for ch in chapters:
            got = {}
            async def on_resp(r):
                if "content-pages/aip" in r.url and "chapterIndex=%s" % ch in r.url:
                    try: got["json"] = await r.json()
                    except Exception as e: got["err"] = str(e)
            pg.on("response", on_resp)
            await pg.goto("https://www.gov.il/he/pages/aip?chapterIndex=%s" % ch, wait_until="networkidle", timeout=90000)
            await pg.wait_for_timeout(2000)
            pg.remove_listener("response", on_resp)
            json.dump(got.get("json"), open(os.path.join(out, "chapter%s.json" % ch), "w"), ensure_ascii=False, indent=1)
            print(ch, "ok" if got.get("json") else got)
        await b.close()
asyncio.run(main())
