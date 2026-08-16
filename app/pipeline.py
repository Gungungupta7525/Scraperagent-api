"""Pipeline orchestrator — step-by-step candidate sourcing with timeouts."""

from __future__ import annotations

import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from .heuristics import extract_heuristic_candidates, rank_candidates
from .queries import build_default_queries
from .scrape import PageScraper
from .search import SearchClient
from .profiles import profile_source

if TYPE_CHECKING:
    pass


class Pipeline:
    def __init__(self, settings):
        self.settings = settings
        self.search = SearchClient(settings)
        self.scraper = PageScraper(settings)
        self.llm_adapters = []

    def run(self, job_description: str, sources: list, max_candidates: int, deadline: float, emit=None):
        emit = emit or (lambda message: None)
        self.search.reset()

        # Step 1: Build queries (template-based, instant — no LLM).
        queries = build_default_queries(job_description, sources)

        # Step 2: Search all sources in parallel.
        results = self._run_searches(queries, deadline, emit)

        # Step 3: Extract candidates via heuristic (instant).
        candidates = extract_heuristic_candidates(job_description, results)

        # Step 4: If LLM available and heuristic found few, try LLM extraction.
        if len(candidates) < 10 and self.llm_adapters:
            candidates = self._llm_fallback(job_description, results, deadline, emit, candidates)

        # Step 5: Rank and cap.
        return rank_candidates(candidates, max_candidates), results

    def _run_searches(self, queries: list, deadline: float, emit):
        out = {}
        seen = set()
        todo = []
        for item in queries:
            if self._remaining(deadline) <= 0:
                break
            source = item["source"]
            if source in seen:
                continue
            seen.add(source)
            todo.append((source, item["query"]))
        if not todo:
            return out
        emit(f"Looking for candidates across {len(todo)} sources…")

        def _search(pair):
            source, query = pair
            return source, self.search.search_source(query, source, self.settings.max_results_per_source)

        with ThreadPoolExecutor(max_workers=min(10, len(todo))) as executor:
            for source, results in executor.map(_search, todo):
                out[source] = results
        return out

    def _llm_fallback(self, job_description, results, deadline, emit, existing):
        """Try LLM extraction only when heuristic found few candidates."""
        for adapter in self.llm_adapters:
            if self._remaining(deadline) <= 5:
                break
            try:
                emit(f"Enhancing with {adapter.name}…")
                scraped = self._run_scrapes(results, deadline, emit)
                evidence = _format_evidence(results, scraped)
                system = (
                    "You are a recruiting agent. Extract candidate profiles from the search results below "
                    "and rank them best-first. Return JSON array of candidates with name, role, headline, "
                    "source, url, location, skills, experience, relevance_score (0-1), summary."
                )
                user = f"JOB DESCRIPTION:\n{job_description[:8000]}\n\nSEARCH RESULTS:\n{evidence}"
                content = adapter.provider.complete(
                    [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    json_mode=True,
                    timeout=min(30.0, self._remaining(deadline)),
                )
                data = _parse_json(content)
                if isinstance(data, dict):
                    raw = data.get("candidates") or []
                elif isinstance(data, list):
                    raw = data
                else:
                    raw = []
                llm_candidates = [_parse_candidate(c) for c in raw if isinstance(c, dict)]
                llm_candidates = [c for c in llm_candidates if c]
                if llm_candidates:
                    merged = list(existing)
                    seen = {c["url"] for c in merged if c.get("url")}
                    for c in llm_candidates:
                        if c["url"] not in seen:
                            seen.add(c["url"])
                            merged.append(c)
                    return merged
            except Exception:  # noqa: BLE001
                continue
        return existing

    def _run_scrapes(self, results_by_source, deadline, emit):
        urls = []
        for results in results_by_source.values():
            for row in results:
                url = row.get("url")
                if url and url not in urls:
                    urls.append(url)
        scraped = {}
        targets = urls[: self.settings.max_scrapes]
        if targets:
            emit(f"Retrieving profile details ({len(targets)} pages)…")
        for idx, url in enumerate(targets, start=1):
            if self._remaining(deadline) <= 0:
                break
            try:
                emit(f"Retrieving profile details ({idx}/{len(targets)})…")
                scraped[url] = self.scraper.scrape(url)
            except Exception:  # noqa: BLE001
                continue
        return scraped

    def _remaining(self, deadline: float) -> float:
        return deadline - time.monotonic()


def _format_evidence(results_by_source: dict, scraped: dict) -> str:
    lines = []
    for source, results in results_by_source.items():
        lines.append(f"[{source}]")
        for row in results:
            lines.append(f"- {row.get('title', '')}\n  URL: {row.get('url', '')}\n  {row.get('snippet', '')[:250]}")
    lines.append("\n[SCRAPED TEXT]")
    for url, text in list(scraped.items())[:10]:
        lines.append(f"\n--- {url} ---\n{text[:1500]}")
    return "\n".join(lines)[:15000]


def _parse_json(text: str):
    import json
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, TypeError):
        pass
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
    start = text.find("[")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
    return None


def _parse_candidate(raw: dict) -> dict | None:
    from .profiles import profile_source as _ps
    score = raw.get("relevance_score")
    try:
        score = float(score)
    except (TypeError, ValueError):
        score = None
    if score is not None:
        score = max(0.0, min(1.0, score))
    skills = raw.get("skills") or []
    if isinstance(skills, str):
        skills = [s.strip() for s in skills.split(",") if s.strip()]
    url = (raw.get("url") or "").strip()
    source = _ps(url)
    if not source:
        return None
    return {
        "name": raw.get("name") or None,
        "role": raw.get("role") or None,
        "headline": raw.get("headline") or None,
        "source": source,
        "url": url,
        "location": raw.get("location") or None,
        "skills": [str(s) for s in skills][:20],
        "experience": raw.get("experience") or None,
        "relevance_score": score,
        "summary": raw.get("summary") or None,
    }
