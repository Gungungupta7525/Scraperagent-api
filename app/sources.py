from typing import List


SOURCE_TEMPLATES = {
    "github": "site:github.com {terms}",
    "gitlab": "site:gitlab.com {terms}",
    "bitbucket": "site:bitbucket.org {terms}",
    "linkedin": "site:linkedin.com/in {terms}",
    "indeed": "site:indeed.com/resumes {terms}",
    "wellfound": "site:wellfound.com/profile {terms}",
    "stackoverflow": "site:stackoverflow.com/users {terms}",
    "kaggle": "site:kaggle.com {terms}",
    "behance": "site:behance.net {terms}",
    "dribbble": "site:dribbble.com {terms}",
}

SOURCE_LABELS = {
    "github": "GitHub",
    "gitlab": "GitLab",
    "bitbucket": "Bitbucket",
    "linkedin": "LinkedIn",
    "indeed": "Indeed",
    "wellfound": "Wellfound",
    "stackoverflow": "Stack Overflow",
    "kaggle": "Kaggle",
    "behance": "Behance",
    "dribbble": "Dribbble",
}

DEFAULT_SOURCES = ["github", "gitlab", "bitbucket", "linkedin", "wellfound"]

ROLE_ADAPTIVE = {
    "stackoverflow": ("developer", "backend", "software", "frontend", "engineer", "full-stack"),
    "kaggle": ("data", "ml", "machine learning", "ai", "analyst", "scientist", "deep learning"),
    "behance": ("design", "ui", "ux", "creative", "graphic", "illustrator"),
    "dribbble": ("design", "ui", "ux", "creative", "graphic", "illustrator"),
}


def role_adaptive_sources(job_description: str) -> List[str]:
    text = job_description.lower()
    return [source for source, keywords in ROLE_ADAPTIVE.items() if any(k in text for k in keywords)]


def resolve_sources(job_description: str, requested: List[str] | None = None) -> List[str]:
    if requested:
        allowed = [s for s in requested if s in SOURCE_TEMPLATES]
        return allowed or list(DEFAULT_SOURCES)
    return list(DEFAULT_SOURCES) + role_adaptive_sources(job_description)
