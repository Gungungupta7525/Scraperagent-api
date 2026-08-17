"""Heuristic scoring, name extraction, and candidate building."""

from __future__ import annotations

import re

from .profiles import profile_source

_ROLE_TERMS = [
    "backend", "back-end", "back end",
    "frontend", "front-end", "front end",
    "fullstack", "full-stack", "full stack",
    "devops", "data engineer", "data scientist", "data analyst",
    "machine learning engineer", "ml engineer", "ai engineer",
    "software engineer", "software developer",
    "architect", "sre", "platform engineer",
    "product manager", "product designer", "ux designer", "ui designer",
    "mobile developer", "ios developer", "android developer",
    "security engineer", "cloud engineer",
    "consultant", "tech lead", "engineering manager",
    "qa engineer", "test engineer", "developer",
]

_TECH_SKILLS = [
    "python", "javascript", "typescript", "java", "go", "golang", "rust", "c++", "c#",
    "ruby", "php", "swift", "kotlin", "scala", "perl",
    "fastapi", "django", "flask", "spring", "spring boot", "rails", "laravel", "express",
    "react", "vue", "vuejs", "angular", "svelte", "nextjs", "next.js", "nuxt",
    "node", "nodejs", "node.js",
    "aws", "gcp", "google cloud", "azure", "docker", "kubernetes", "k8s",
    "terraform", "ansible", "jenkins", "ci/cd", "github actions",
    "nginx", "apache", "linux",
    "sql", "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch",
    "kafka", "spark", "hadoop", "airflow", "dbt", "snowflake", "bigquery",
    "tableau", "power bi",
    "machine learning", "deep learning", "nlp", "natural language processing",
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn", "pandas", "numpy",
    "llm", "large language model", "transformer", "bert", "gpt", "rag",
    "computer vision", "opencv",
    "sap", "abap", "hana", "s/4hana", "fiori", "bapi", "idoc",
    "odata", "rap", "cds view", "cds views",
    "graphql", "rest api", "rest", "microservices", "agile", "scrum",
    "git", "github", "gitlab", "bitbucket",
    "css", "html", "sass", "tailwind",
    "xcode", "swiftui", "jetpack compose",
    "c", "elixir", "erlang", "haskell", "clojure",
]


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


def _skill_in_text(skill: str, text: str) -> bool:
    if re.search(r"[^a-z0-9]", skill):
        pat = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"
    else:
        pat = r"\b" + re.escape(skill) + r"\b"
    return bool(re.search(pat, text))


def _extract_skills(text: str) -> list[str]:
    text_lower = text.lower()
    return [s for s in _TECH_SKILLS if _skill_in_text(s, text_lower)]


def _extract_roles(text: str) -> list[str]:
    text_lower = text.lower()
    return [r for r in _ROLE_TERMS if _skill_in_text(r, text_lower)]


def _extract_seniority(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(principal|staff|distinguished|fellow)\b", t):
        return "principal"
    if re.search(r"\b(senior|sr\.?|lead)\b", t):
        return "senior"
    if re.search(r"\b(junior|jr\.?|entry|associate|intern)\b", t):
        return "junior"
    return "mid"


def _extract_years(text: str) -> int | None:
    m = re.search(r"(\d+)\+?\s*(?:years?|yrs?)", text.lower())
    return int(m.group(1)) if m else None


def score_candidate(job_description: str, title: str, snippet: str) -> float:
    jd_skills = _extract_skills(job_description)
    jd_roles = _extract_roles(job_description)

    if not jd_skills and not jd_roles:
        from .queries import extract_keywords
        keywords = extract_keywords(job_description)
        if not keywords:
            return 0.5
        haystack = f"{title} {snippet}".lower()
        hits = sum(1 for kw in keywords if kw in haystack)
        return round(min(0.95, 0.2 + 0.6 * (hits / len(keywords))), 2)

    haystack = f"{title} {snippet}".lower()
    title_lower = title.lower()
    snippet_lower = snippet.lower()

    skill_hits = sum(1 for s in jd_skills if _skill_in_text(s, haystack))
    skill_ratio = skill_hits / max(len(jd_skills), 1)

    role_hits = sum(1 for r in jd_roles if _skill_in_text(r, title_lower))
    skill_title_hits = sum(1 for s in jd_skills if _skill_in_text(s, title_lower))
    total_title_hits = role_hits + skill_title_hits
    role_ratio = min(1.0, total_title_hits / max(min(len(jd_roles) + len(jd_skills), 3), 1))

    seniority = 0.0
    jd_senior = _extract_seniority(job_description)
    title_senior = _extract_seniority(title)
    if jd_senior == title_senior:
        seniority = 1.0
    elif jd_senior == "mid":
        seniority = 0.5

    snippet_hits = sum(1 for s in jd_skills if _skill_in_text(s, snippet_lower))
    density = snippet_hits / max(len(jd_skills), 1)

    raw = skill_ratio * 0.50 + role_ratio * 0.30 + seniority * 0.10 + density * 0.10

    if skill_hits == 0:
        raw = min(raw, 0.08)
    elif len(jd_skills) > 3 and skill_hits == 1:
        raw = min(raw, 0.30)

    if skill_hits >= 3:
        raw += 0.05
    if total_title_hits >= 2:
        raw += 0.05

    return round(min(0.95, max(0.05, raw)), 2)


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
            score = score_candidate(job_description, title, snippet)

            if score < 0.15:
                continue

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
                    "relevance_score": score,
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
