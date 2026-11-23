"""Polite, resumable APD UAM collector.

Use a dedicated persistent browser profile; log in manually in the opened
browser. Only public thesis records accessible to that account are collected.
Do not bypass access controls. Run slowly and stop if the site returns 429/403.
"""
from __future__ import annotations
import argparse, asyncio, json, re
from pathlib import Path
from urllib.parse import urljoin

BASE = "https://apd.amu.edu.pl"
ADVISOR_ARCHIVE = BASE + "/users/theses/2164/diploma/supervisor/?exam_year=all&deliver_cycle=all&type=all"

def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()

async def main():
    try:
        from playwright.async_api import async_playwright
    except ImportError as e:
        raise SystemExit("Install playwright and its Chromium browser: pip install playwright && playwright install chromium") from e
    p = argparse.ArgumentParser()
    p.add_argument("--profile", default="./apd-browser-profile")
    p.add_argument("--out", default="./data/apd_theses.jsonl")
    p.add_argument("--delay", type=float, default=8.0, help="seconds between page requests (minimum 5)")
    p.add_argument("--limit", type=int, default=0, help="0 means no limit")
    args = p.parse_args()
    delay = max(5.0, args.delay)
    output = Path(args.out); output.parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    if output.exists():
        for line in output.read_text(encoding="utf-8").splitlines():
            try: seen.add(json.loads(line).get("url"))
            except json.JSONDecodeError: pass

    async with async_playwright() as pw:
        context = await pw.chromium.launch_persistent_context(args.profile, headless=False)
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(ADVISOR_ARCHIVE, wait_until="domcontentloaded")
        print("Log in manually if prompted; wait until the thesis archive is visible.")
        input("Press Enter here after login/archive loads...")
        await page.goto(ADVISOR_ARCHIVE, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        links = await page.locator('a[href*="/diplomas/"]').evaluate_all(
            "(els) => [...new Set(els.map(a => a.href))]"
        )
        if not links:
            await context.close()
            raise SystemExit("No thesis links found. Archive markup may have changed; no records written.")
        count = 0
        for url in links:
            if url in seen: continue
            await page.wait_for_timeout(int(delay * 1000))
            response = await page.goto(url, wait_until="domcontentloaded")
            if response and response.status in (403, 429):
                print(f"Stopping on HTTP {response.status}; wait and check site rules.")
                break
            # Preserve page text as source evidence; labels may change, so avoid
            # pretending that unverified selectors identify fields reliably.
            title = clean(await page.title())
            body = clean(await page.locator("body").inner_text())
            record = {"url": url, "page_title": title, "page_text": body,
                      "collection_source": ADVISOR_ARCHIVE}
            with output.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
            seen.add(url); count += 1
            if args.limit and count >= args.limit: break
        await context.close()
        print(f"Appended {count} records to {output}")

if __name__ == "__main__":
    asyncio.run(main())
