from __future__ import annotations

import re
import time
from typing import TYPE_CHECKING, List

from .config import Settings
from .llm import GeminiProvider, GroqProvider, extract_json_object, parse_candidates
from .scrape import PageScraper
from .search import SearchClient
from .sources import SOURCE_TEMPLATES, resolve_sources

if TYPE_CHECKING:
    from groq.types.chat import ChatCompletionMessageParam


_PROFILE_SOURCES = ("github", "linkedin", "wellfound", "stackoverflow", "kaggle", "behance", "dribbble")

# Strict patterns: a valid candidate URL is a single public profile, not a job
# page, search listing, org/company page, or anything else.
_PROFILE_URL_PATTERNS = [
    re.compile(r"^https?://(?:www\.)?github\.com/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.|in\.)?linkedin\.com/in/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?wellfound\.com/(?:profile|u)/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?stackoverflow\.com/users/\d+/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?kaggle\.com/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?behance\.net/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?dribbble\.com/[\w.-]+/?$", re.I),
]


def profile_source(url: str) -> str | None:
    for pattern, source in zip(_PROFILE_URL_PATTERNS, _PROFILE_SOURCES):
        if pattern.match(url.strip()):
            return source
    return None


class UpstreamError(Exception):
    """Raised when no LLM provider could be reached at all (upstream failure -> 503)."""


class LLMAdapter:
    def __init__(self, name: str, provider, tool_capable: bool = False):
        self.name = name
        self.provider = provider
        self.tool_capable = tool_capable


def build_providers(settings: Settings):
    adapters = []
    if settings.groq_api_key:
        primary = GroqProvider(settings.groq_api_key, settings.groq_model)
        adapters.append(LLMAdapter("groq-primary", primary, tool_capable=True))
        if settings.gemini_api_key:
            adapters.append(LLMAdapter("gemini-flash", GeminiProvider(settings.gemini_api_key, settings.gemini_model)))
        adapters.append(LLMAdapter("groq-small", GroqProvider(settings.groq_api_key, settings.groq_fallback_model)))
    elif settings.gemini_api_key:
        adapters.append(LLMAdapter("gemini-flash", GeminiProvider(settings.gemini_api_key, settings.gemini_model)))
    return adapters


class ScrapingAgent:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.search = SearchClient(settings)
        self.scraper = PageScraper(settings)
        self.providers = build_providers(settings)

    def run(self, job_description: str, sources=None, max_candidates: int = 10, on_status=None):
        emit = on_status or (lambda message: None)
        deadline = time.monotonic() + self.settings.request_timeout
        self.search.reset()
        emit("Connected to the backend")
        allowed = resolve_sources(job_description, sources)
        emit("Analyzing the job description and planning searches…")

        primary_error = None
        tool_provider = next((p for p in self.providers if p.tool_capable), None)
        if tool_provider is not None:
            emit("Searching candidate sources with the AI agent…")
            try:
                content = tool_provider.provider.tool_loop(
                    job_description,
                    lambda name, args: self._execute_tool(name, args, deadline),
                    self.settings.max_llm_turns,
                    timeout=max(1.0, self._remaining(deadline)),
                )
                candidates = self._parse_candidate_list(content)
                if candidates:
                    emit("Ranking best matches…")
                    return self._build_response(job_description, candidates, max_candidates, partial=False)
                primary_error = "tool loop returned no candidates"
            except Exception as exc:  # noqa: BLE001
                primary_error = str(exc)[:300]

        candidates, provider_error = self._plan_and_execute(job_description, allowed, deadline, emit)
        if candidates is None:
            raise UpstreamError(f"upstream failure: {primary_error or 'no tool-calling provider'}; {provider_error or 'no fallback provider'}")
        return self._build_response(job_description, candidates, max_candidates, partial=time.monotonic() >= deadline)

    def _remaining(self, deadline: float) -> float:
        return deadline - time.monotonic()

    def _execute_tool(self, name: str, args: dict, deadline: float):
        if name == "web_search":
            query = (args.get("query") or "").strip()
            source = (args.get("source") or "generic").strip()
            if not query:
                return {"error": "empty query"}
            results = self.search.search_source(query, source, self.settings.max_results_per_source)
            return {
                "source": source,
                "count": len(results),
                "results": [
                    {"title": r["title"], "url": r["url"], "snippet": (r.get("snippet") or "")[:300]}
                    for r in results
                ],
            }
        if name == "scrape_page":
            url = (args.get("url") or "").strip()
            if not url.startswith(("http://", "https://")):
                return {"error": "invalid url"}
            try:
                text = self.scraper.scrape(url)
                return {"url": url, "text": text[:4000]}
            except Exception as exc:  # noqa: BLE001
                return {"url": url, "error": str(exc)[:200]}
        return {"error": f"unknown tool: {name}"}

    def _plan_and_execute(self, job_description: str, sources: list, deadline: float, emit=None):
        emit = emit or (lambda message: None)
        last_error = None
        last_results = {}
        llm_ok = False
        for adapter in self.providers:
            if self._remaining(deadline) <= 0:
                last_error = "request timeout before fallback ran"
                break
            try:
                emit(f"Planning searches with {adapter.name}…")
                queries = self._generate_queries(adapter, job_description, sources, deadline)
                query_list = queries.get("queries", []) if isinstance(queries, dict) else queries
                if not query_list:
                    query_list = self._default_queries(job_description, sources)
                results_by_source = self._run_searches(query_list, deadline, emit)
                last_results = results_by_source
                scraped = self._run_scrapes(results_by_source, deadline, emit)
                emit("Generating ranked candidate profiles…")
                candidates = self._extract_candidates(adapter, job_description, results_by_source, scraped, deadline)
                llm_ok = True
                if candidates:
                    return candidates, None
                last_error = f"{adapter.name}: no candidates parsed"
            except Exception as exc:  # noqa: BLE001
                last_error = f"{adapter.name}: {str(exc)[:200]}"
        if llm_ok:
            emit("Ranking best matches…")
            heuristic = self._heuristic_candidates(job_description, last_results)
            if heuristic:
                return heuristic, None
            return [], None
        return None, last_error

    def _generate_queries(self, adapter: LLMAdapter, job_description: str, sources: list, deadline: float):
        allowed = ", ".join(sources)
        system = (
            "You plan web searches to source candidate profiles for a job description. "
            f"Allowed sources: {allowed}. Build 3-8 targeted queries across the relevant sources, using the "
            "site: operator per source (site:github.com, site:linkedin.com/in, site:indeed.com/resumes, "
            "site:wellfound.com/profile, site:stackoverflow.com/users, site:kaggle.com, site:behance.net, "
            "site:dribbble.com). Combine role, seniority, and key skills.\n"
            'Respond with ONLY JSON: {"queries":[{"source":"github","query":"site:github.com senior python backend"}]}'
        )
        messages: List[ChatCompletionMessageParam] = [
            {"role": "system", "content": system},
            {"role": "user", "content": job_description[:8000]},
        ]
        content = adapter.provider.complete(messages, json_mode=True, timeout=max(1.0, min(30.0, self._remaining(deadline))))
        data = extract_json_object(content)
        if not isinstance(data, dict):
            return {}
        query_list = []
        for item in data.get("queries", []) or []:
            if not isinstance(item, dict) or not item.get("query"):
                continue
            source = item.get("source") or "github"
            if source not in sources:
                continue
            terms = re.sub(r"(?i)\bsite:\S+", "", str(item["query"])).strip()
            if not terms:
                continue
            query_list.append({"source": source, "query": SOURCE_TEMPLATES[source].format(terms=terms)})
        return {"queries": query_list[:12]}

    def _default_queries(self, job_description: str, sources: list):
        text = re.sub(r"\s+", " ", job_description).strip()
        terms = text[:150]
        return [{"source": s, "query": SOURCE_TEMPLATES[s].format(terms=terms)} for s in sources]

    def _run_searches(self, queries: list, deadline: float, emit=None):
        emit = emit or (lambda message: None)
        out = {}
        for item in queries:
            if self._remaining(deadline) <= 0:
                break
            source = item["source"]
            if source in out:
                continue
            emit(f"Looking for candidates on {source}…")
            out[source] = self.search.search_source(item["query"], source, self.settings.max_results_per_source)
        return out

    def _run_scrapes(self, results_by_source: dict, deadline: float, emit=None):
        emit = emit or (lambda message: None)
        urls = []
        for results in results_by_source.values():
            for row in results:
                url = row.get("url")
                if url and url not in urls:
                    urls.append(url)
        scraped = {}
        if urls:
            emit("Retrieving profile details…")
        for url in urls[: self.settings.max_scrapes]:
            if self._remaining(deadline) <= 0:
                break
            try:
                scraped[url] = self.scraper.scrape(url)
            except Exception:  # noqa: BLE001 - skip and log on failure rather than blocking
                continue
        return scraped

    def _extract_candidates(self, adapter: LLMAdapter, job_description: str, results_by_source: dict, scraped: dict, deadline: float):
        system = (
            "You are a recruiting agent. Extract candidate profiles from the search results and scraped text below "
            "and rank them best-first for the job description.\n"
            "- Treat every search result whose URL is a public profile (github.com/..., linkedin.com/in/..., "
            "wellfound.com/profile/..., stackoverflow.com/users/..., kaggle.com/..., behance.net/..., dribbble.com/...) as a candidate.\n"
            "- Derive name, role and skills from the title, URL slug and snippet. Do not invent people who do not appear in the evidence.\n"
            "- If any public profile URL exists in the evidence, you MUST return it as a candidate. An empty list is only "
            "acceptable when the evidence contains no public profile URLs at all.\n"
            'Respond with ONLY JSON: {"candidates":[{"name":"...","role":"...","headline":"...","source":"...",'
            '"url":"...","location":"...","skills":["..."],"experience":"...","relevance_score":0.9,"summary":"..."}]}. '
            "relevance_score is 0-1 fit for the job."
        )
        evidence = self._format_evidence(results_by_source, scraped)
        user = f"JOB DESCRIPTION:\n{job_description[:8000]}\n\nSEARCH RESULTS AND SCRAPED TEXT:\n{evidence}"
        messages: List[ChatCompletionMessageParam] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        content = adapter.provider.complete(messages, json_mode=True, timeout=max(1.0, min(40.0, self._remaining(deadline))))
        data = extract_json_object(content)
        if not isinstance(data, dict):
            return None
        raw = data.get("candidates") or []
        if not isinstance(raw, list):
            return None
        return [c for c in (self._parse_candidate(item) for item in raw) if c]

    @staticmethod
    def _format_evidence(results_by_source: dict, scraped: dict) -> str:
        lines = []
        for source, results in results_by_source.items():
            lines.append(f"[{source}]")
            for row in results:
                lines.append(f"- {row.get('title', '')}\n  URL: {row.get('url', '')}\n  {row.get('snippet', '')[:250]}")
        lines.append("\n[SCRAPED PROFILE TEXT]")
        for url, text in list(scraped.items())[:10]:
            lines.append(f"\n--- {url} ---\n{text[:1500]}")
        return "\n".join(lines)[:15000]

    @staticmethod
    def _parse_candidate(raw) -> dict:
        if not isinstance(raw, dict):
            raw = {}
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

    @staticmethod
    def _parse_candidate_list(content: str) -> list:
        return [c for c in (ScrapingAgent._parse_candidate(item) for item in parse_candidates(content)) if c]

    # -- rule-based safety net: guarantees candidates whenever searches found
    # -- public profile URLs, even if the LLM returned an empty list.

    _STOPWORDS = {
        "a", "an", "the", "and", "or", "with", "for", "in", "on", "of", "to", "at", "by", "from",
        "is", "are", "be", "as", "you", "your", "will", "we", "our", "this", "that", "what", "who",
        "using", "used", "based", "someone", "somebody",
    }

    @classmethod
    def _name_from_url(cls, url: str) -> str | None:
        match = re.search(r"(?:github|wellfound|linkedin|stackoverflow|kaggle|behance|dribbble)\.com/", url.lower())
        if not match:
            return None
        slug = url[match.end():].split("?", 1)[0].rstrip("/")
        parts = [p for p in slug.split("/") if p]
        if parts and parts[0] in ("in", "profile", "users"):
            parts = parts[1:]
        if parts and parts[0].isdigit() and len(parts) > 1:
            parts = parts[1:]
        if not parts:
            return None
        return re.sub(r"[-_+]+", " ", parts[0]).title()

    @classmethod
    def _keywords(cls, text: str) -> list:
        words = re.findall(r"[a-z][a-z0-9+#.-]{1,}", text.lower())
        return list(dict.fromkeys(w for w in words if len(w) > 2 and w not in cls._STOPWORDS))[:12]

    @classmethod
    def _heuristic_score(cls, job_description: str, title: str, snippet: str) -> float:
        keywords = cls._keywords(job_description)
        if not keywords:
            return 0.6
        haystack = f"{title} {snippet}".lower()
        hits = sum(1 for kw in keywords if kw in haystack)
        score = 0.5 + 0.45 * (hits / len(keywords))
        return round(min(0.95, score), 2)

    def _heuristic_candidates(self, job_description: str, results_by_source: dict) -> list:
        candidates = []
        seen = set()
        for source, results in results_by_source.items():
            for row in results or []:
                url = (row.get("url") or "").strip()
                if url in seen:
                    continue
                src = profile_source(url)
                if not src:
                    continue
                seen.add(url)
                title = (row.get("title") or "").strip()
                snippet = (row.get("snippet") or "").strip()
                name = self._name_from_url(url) or re.sub(r"\s*[|]\s*.*$", "", title).strip() or None
                candidates.append(
                    {
                        "name": name,
                        "role": None,
                        "headline": title or None,
                        "source": src,
                        "url": url,
                        "location": None,
                        "skills": [],
                        "experience": None,
                        "relevance_score": self._heuristic_score(job_description, title, snippet),
                        "summary": snippet[:200] or None,
                    }
                )
        return candidates

    def _build_response(self, job_description: str, candidates: list, max_candidates: int, partial: bool) -> dict:
        ranked = sorted(
            candidates,
            key=lambda c: (c.get("relevance_score") is not None, c.get("relevance_score") or 0.0),
            reverse=True,
        )[:max_candidates]
        for index, candidate in enumerate(ranked, start=1):
            candidate["rank"] = index
        statuses = [
            {"source": s, "status": st["status"], "error": st.get("error"), "candidates_found": st.get("candidates_found", 0)}
            for s, st in self.search.status.items()
        ]
        sources_used = [s for s, st in self.search.status.items() if st["status"] != "failed"]
        return {
            "job_description": job_description,
            "candidates": ranked,
            "sources_status": statuses,
            "sources_used": sources_used,
            "partial": partial,
        }
