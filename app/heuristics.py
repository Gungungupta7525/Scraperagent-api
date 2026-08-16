"""Heuristic scoring, name extraction, and candidate building."""

from __future__ import annotations

import re

from .profiles import profile_source
from .queries import extract_keywords


def name_from_url(url: str) -> str | None:
    if "scholar.google.com/" in url.lower():
        return None
    match = re.search(
        r"(?:github|gitlab|bitbucket|stackoverflow|leetcode|hackerrank|codepen|dev|hashnode|kaggle|researchgate|"
        r"huggingface|linkedin|wellfound|cutshort|behance|dribbble|artstation|orcid|producthunt|indiehackers)"
        r"\.(?:com|io|to|co|org|net)/",
        url.lower(),
    )
    if not match:
        return None
    slug = url[match.end():].split("?", 1)[0].rstrip("/")
    parts = [p for p in slug.split("/") if p]
    if parts and parts[0] in ("in", "profile", "users", "artists"):
        parts = parts[1:]
    if parts and parts[0].isdigit() and len(parts) > 1:
        parts = parts[1:]
    if not parts:
        return None
    name_part = parts[0].lstrip("@")
    if not re.search(r"[a-z0-9]", name_part):
        return None
    if re.fullmatch(r"[0-9X][0-9X-]*", name_part):
        return None
    return re.sub(r"[-_+]+", " ", name_part).title()


def score_candidate(job_description: str, title: str, snippet: str) -> float:
    keywords = extract_keywords(job_description)
    if not keywords:
        return 0.6
    haystack = f"{title} {snippet}".lower()
    hits = sum(1 for kw in keywords if kw in haystack)
    score = 0.5 + 0.45 * (hits / len(keywords))
    return round(min(0.95, score), 2)


def extract_heuristic_candidates(job_description: str, results_by_source: dict) -> list:
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
            name = name_from_url(url) or re.sub(r"\s*[|]\s*.*$", "", title).strip() or None
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
                    "relevance_score": score_candidate(job_description, title, snippet),
                    "summary": snippet[:200] or None,
                }
            )
    return candidates


def rank_candidates(candidates: list, max_candidates: int) -> list:
    ranked = sorted(
        candidates,
        key=lambda c: (c.get("relevance_score") is not None, c.get("relevance_score") or 0.0),
        reverse=True,
    )[:max_candidates]
    for index, candidate in enumerate(ranked, start=1):
        candidate["rank"] = index
    return ranked
