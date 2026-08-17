from __future__ import annotations

import concurrent.futures
import time

import httpx

from .config import Settings

_SEARCH_WORKERS = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="ddg")
_DDG_TIMEOUT = 8.0


class CircuitBreaker:
    def __init__(self, threshold: int = 2):
        self.threshold = max(1, threshold)
        self._failures = 0
        self._open = False

    @property
    def is_open(self) -> bool:
        return self._open

    def success(self) -> None:
        self._failures = 0
        self._open = False

    def failure(self) -> None:
        self._failures += 1
        if self._failures >= self.threshold:
            self._open = True


class DuckDuckGoSearch:
    def __init__(self, timeout: float = _DDG_TIMEOUT):
        self.timeout = timeout
        self._backend = None

    def _load(self):
        if self._backend is None:
            try:
                from ddgs import DDGS
            except ImportError:
                from duckduckgo_search import DDGS
            self._backend = DDGS
        return self._backend

    def search(self, query: str, max_results: int = 5):
        DDGS = self._load()

        def _call():
            return list(DDGS().text(query, max_results=max_results))

        future = _SEARCH_WORKERS.submit(_call)
        try:
            rows = future.result(timeout=self.timeout)
        except concurrent.futures.TimeoutError:
            future.cancel()
            return []
        return self._normalize(rows)

    @staticmethod
    def _normalize(rows):
        out = []
        for row in rows or []:
            url = row.get("href") or row.get("url")
            if not url:
                continue
            out.append(
                {
                    "title": row.get("title") or "",
                    "url": url,
                    "snippet": row.get("body") or row.get("snippet") or "",
                }
            )
        return out


class TavilySearch:
    def __init__(self, api_key: str, timeout: float = 10.0):
        self.api_key = api_key
        self.timeout = timeout

    def search(self, query: str, max_results: int = 5):
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={"api_key": self.api_key, "query": query, "max_results": max_results},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        out = []
        for row in data.get("results", []):
            out.append(
                {
                    "title": row.get("title") or "",
                    "url": row.get("url") or "",
                    "snippet": row.get("content") or row.get("raw_content") or "",
                }
            )
        return out


class SearchClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.tavily = TavilySearch(settings.tavily_api_key, timeout=settings.search_timeout) if settings.tavily_api_key else None
        self.ddg = DuckDuckGoSearch(timeout=min(_DDG_TIMEOUT, settings.search_timeout))
        self.breakers = {}
        self.status = {}

    def reset(self) -> None:
        self.breakers.clear()
        self.status.clear()

    def _breaker(self, source: str) -> CircuitBreaker:
        if source not in self.breakers:
            self.breakers[source] = CircuitBreaker()
        return self.breakers[source]

    def _record(self, source: str, status: str, error: str | None = None, candidates: int = 0) -> None:
        self.status[source] = {"status": status, "error": error, "candidates_found": candidates}

    def search_source(self, query: str, source: str, max_results: int = 5):
        source = source or "generic"
        breaker = self._breaker(source)
        if breaker.is_open:
            self._record(source, "skipped", error="circuit breaker open (repeated failures within this request)")
            return []

        error = None
        attempts = [(self.tavily, 0), (self.ddg, 0)] if self.tavily is not None else [(self.ddg, 0)]
        for backend, sleep_secs in attempts:
            if backend is None:
                continue
            if sleep_secs:
                time.sleep(sleep_secs)
            try:
                results = backend.search(query, max_results)
                if results:
                    breaker.success()
                    self._record(source, "ok", candidates=len(results))
                    return results
                error = RuntimeError(f"{type(backend).__name__} returned no results")
            except Exception as exc:
                error = exc

        breaker.failure()
        self._record(source, "failed", error=(str(error)[:300] if error else None))
        return []
