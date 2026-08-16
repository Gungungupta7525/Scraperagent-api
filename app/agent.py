"""Agent orchestrator — thin wrapper around Pipeline."""

from __future__ import annotations

import time

from .config import Settings
from .heuristics import rank_candidates
from .llm import GeminiProvider, GroqProvider, parse_candidates
from .pipeline import Pipeline
from .profiles import profile_source
from .queries import resolve_sources
from .scrape import PageScraper
from .search import SearchClient


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
        adapters.append(LLMAdapter("groq-primary", primary, tool_capable=False))
        if settings.gemini_api_key:
            adapters.append(LLMAdapter("gemini-flash", GeminiProvider(settings.gemini_api_key, settings.gemini_model)))
        adapters.append(LLMAdapter("groq-small", GroqProvider(settings.groq_api_key, settings.groq_fallback_model)))
    elif settings.gemini_api_key:
        adapters.append(LLMAdapter("gemini-flash", GeminiProvider(settings.gemini_api_key, settings.gemini_model)))
    return adapters


class ScrapingAgent:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.pipeline = Pipeline(settings)
        self.pipeline.llm_adapters = build_providers(settings)

    def run(self, job_description: str, sources=None, max_candidates: int = 10, on_status=None):
        emit = on_status or (lambda message: None)
        deadline = time.monotonic() + self.settings.request_timeout
        emit("Connected to the backend")
        allowed = resolve_sources(job_description, sources)
        emit("Analyzing the job description…")

        try:
            candidates, results = self.pipeline.run(job_description, allowed, max_candidates, deadline, emit)
        except Exception as exc:
            raise UpstreamError(f"upstream failure: {exc}") from exc

        if candidates is None:
            raise UpstreamError("upstream failure: no candidates found")

        emit("Ranking best matches…")
        statuses = [
            {"source": s, "status": st["status"], "error": st.get("error"), "candidates_found": st.get("candidates_found", 0)}
            for s, st in self.pipeline.search.status.items()
        ]
        sources_used = [s for s, st in self.pipeline.search.status.items() if st["status"] != "failed"]
        return {
            "job_description": job_description,
            "candidates": candidates,
            "sources_status": statuses,
            "sources_used": sources_used,
            "partial": time.monotonic() >= deadline,
        }


def profile_source(url: str) -> str | None:
    from .profiles import profile_source as _ps
    return _ps(url)
