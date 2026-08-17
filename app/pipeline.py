"""Pipeline orchestrator — step-by-step candidate sourcing with timeouts."""

from __future__ import annotations

import concurrent.futures
import time

from .heuristics import extract_heuristic_candidates, rank_candidates
from .queries import build_default_queries
from .profiles import profile_source

_SEARCH_WORKERS = concurrent.futures.ThreadPoolExecutor(max_workers=6, thread_name_prefix="search")
_SEARCH_PHASE_TIMEOUT = 25.0


class Pipeline:
    def __init__(self, settings):
        self.settings = settings
        from .search import SearchClient
        self.search = SearchClient(settings)
        self.llm_adapters = []

    def run(self, job_description: str, sources: list, max_candidates: int, deadline: float, emit=None):
        emit = emit or (lambda message: None)
        self.search.reset()

        queries = build_default_queries(job_description, sources)

        results = self._run_searches(queries, deadline, emit)

        candidates = extract_heuristic_candidates(job_description, results)

        if len(candidates) < 10 and self.llm_adapters:
            candidates = self._llm_fallback(job_description, results, deadline, emit, candidates)

        return rank_candidates(candidates, max_candidates), results

    def _run_searches(self, queries: list, deadline: float, emit):
        out = {}
        seen = set()
        todo = []
        for item in queries:
            source = item["source"]
            if source in seen:
                continue
            seen.add(source)
            todo.append((source, item["query"]))
        if not todo:
            return out

        emit(f"Searching {len(todo)} sources…")

        search_deadline = min(deadline, time.monotonic() + _SEARCH_PHASE_TIMEOUT)
        futures = {}
        for source, query in todo:
            futures[_SEARCH_WORKERS.submit(self.search.search_source, query, source, self.settings.max_results_per_source)] = source

        done, _ = concurrent.futures.wait(futures, timeout=max(1.0, search_deadline - time.monotonic()))

        for future in done:
            source = futures[future]
            try:
                out[source] = future.result(timeout=0)
            except Exception:
                out[source] = []

        remaining = [f for f, s in futures.items() if f not in done]
        for f in remaining:
            f.cancel()

        done_count = len(out)
        total_count = len(todo)
        emit(f"Searched {done_count}/{total_count} sources, found {sum(len(r) for r in out.values())} results")

        return out

    def _llm_fallback(self, job_description, results, deadline, emit, existing):
        for adapter in self.llm_adapters:
            if self._remaining(deadline) <= 5:
                break
            try:
                emit(f"Enhancing with {adapter.name}…")
                evidence = _format_evidence(results, {})
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
            except Exception:
                continue
        return existing

    def _remaining(self, deadline: float) -> float:
        return deadline - time.monotonic()


def _format_evidence(results_by_source: dict, scraped: dict) -> str:
    lines = []
    for source, results in results_by_source.items():
        lines.append(f"[{source}]")
        for row in results:
            lines.append(f"- {row.get('title', '')}\n  URL: {row.get('url', '')}\n  {row.get('snippet', '')[:250]}")
    if scraped:
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
    source = profile_source(url)
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
