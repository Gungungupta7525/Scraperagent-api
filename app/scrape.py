import asyncio

import httpx
import trafilatura
from bs4 import BeautifulSoup

from .config import Settings

USER_AGENT = "Mozilla/5.0 (compatible; ScraperAgent/0.1; recruiting research; +http://localhost)"

MAX_TEXT_CHARS = 10000


class PageScraper:
    """Scrapes public pages only. trafilatura primary, BeautifulSoup fallback,
    optional Crawl4AI for JS-heavy pages. Per-scrape timeout; failures are raised
    to the caller, which logs and skips rather than blocking the request."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def fetch_html(self, url: str, timeout: float | None = None) -> str:
        timeout = timeout if timeout is not None else self.settings.scrape_timeout
        with httpx.Client(follow_redirects=True, headers={"User-Agent": USER_AGENT}, timeout=timeout) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.text

    @staticmethod
    def _bs4_text(html: str) -> str:
        soup = BeautifulSoup(html, "lxml")
        for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)

    def scrape(self, url: str) -> str:
        html = self.fetch_html(url)
        try:
            text = trafilatura.extract(html, include_comments=False, include_tables=False)
        except Exception:  # noqa: BLE001
            text = None
        if not text:
            text = self._bs4_text(html)
        if not text and self.settings.crawl4ai_enabled:
            text = self._crawl4ai(url)
        return (text or "")[:MAX_TEXT_CHARS]

    def _crawl4ai(self, url: str) -> str:
        try:
            from crawl4ai import AsyncWebCrawler
        except ImportError:
            return ""

        async def run() -> str:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(url)
                return getattr(result, "markdown", "") or getattr(result, "html", "") or ""

        try:
            return asyncio.run(run())[:MAX_TEXT_CHARS]
        except Exception:  # noqa: BLE001
            return ""
