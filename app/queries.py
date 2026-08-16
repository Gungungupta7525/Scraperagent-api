"""Template-based query generation — no LLM dependency."""

from __future__ import annotations

import re
from typing import List

from .sources import SOURCE_TEMPLATES, CATEGORY_SOURCES, CATEGORY_KEYWORDS, MAX_SOURCES_PER_REQUEST

_STOPWORDS = {
    "a", "an", "the", "and", "or", "with", "for", "in", "on", "of", "to", "at", "by", "from",
    "is", "are", "be", "as", "you", "your", "will", "we", "our", "this", "that", "what", "who",
    "using", "used", "based", "someone", "somebody",
}


def extract_keywords(text: str) -> list:
    words = re.findall(r"[a-z][a-z0-9+#.-]{1,}", text.lower())
    return list(dict.fromkeys(w for w in words if len(w) > 2 and w not in _STOPWORDS))[:12]


def _query_terms(job_description: str) -> str:
    terms = extract_keywords(job_description)
    if terms:
        return " ".join(terms[:10])
    return re.sub(r"\s+", " ", job_description).strip()[:150]


def build_default_queries(job_description: str, sources: list) -> list:
    terms = _query_terms(job_description)
    return [{"source": s, "query": SOURCE_TEMPLATES[s].format(terms=terms)} for s in sources]


def _categories_for(job_description: str) -> List[str]:
    text = job_description.lower()
    return [category for category, keywords in CATEGORY_KEYWORDS.items() if any(k in text for k in keywords)]


def resolve_sources(job_description: str, requested: List[str] | None = None) -> List[str]:
    if requested:
        allowed = [s for s in requested if s in SOURCE_TEMPLATES]
        return allowed or ["github", "linkedin", "wellfound"]
    categories = _categories_for(job_description) or ["general"]
    if "general" not in categories:
        categories = ["general"] + categories
    ordered = []
    for category in categories:
        for source in CATEGORY_SOURCES[category]:
            if source not in ordered:
                ordered.append(source)
    return ordered[:MAX_SOURCES_PER_REQUEST]
