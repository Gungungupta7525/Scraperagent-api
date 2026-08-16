"""URL validation and profile detection for candidate sourcing."""

from __future__ import annotations

import re

_PROFILE_SOURCES = (
    "github", "gitlab", "bitbucket", "stackoverflow", "leetcode", "hackerrank", "codepen", "devto", "hashnode",
    "kaggle", "scholar", "researchgate", "huggingface",
    "linkedin", "wellfound", "cutshort",
    "behance", "dribbble", "artstation",
    "orcid",
    "producthunt", "indiehackers",
)

_PROFILE_URL_PATTERNS = [
    re.compile(r"^https?://(?:www\.)?github\.com/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?gitlab\.com/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?bitbucket\.org/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?stackoverflow\.com/users/\d+/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?leetcode\.com/(?:u/)?[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?hackerrank\.com/(?:profile/)?[^/]+/?$", re.I),
    re.compile(r"^https?://codepen\.io/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?dev\.to/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?hashnode\.com/@[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?kaggle\.com/[\w-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?scholar\.google\.\w[\w.]*/citations\?[^#]*\buser=[^&#]+", re.I),
    re.compile(r"^https?://(?:www\.)?researchgate\.net/profile/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?huggingface\.co/[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.|in\.)?linkedin\.com/in/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?wellfound\.com/(?:profile|u)/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?cutshort\.io/@[^/]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?behance\.net/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?dribbble\.com/[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?artstation\.com/(?:artists/)?[\w.-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?orcid\.org/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/?$", re.I),
    re.compile(r"^https?://(?:www\.)?producthunt\.com/@[\w-]+/?$", re.I),
    re.compile(r"^https?://(?:www\.)?indiehackers\.com/[\w-]+/?$", re.I),
]

_RESERVED_PATHS = {
    "github": ("about", "features", "pricing", "topics", "marketplace", "explore", "sponsors", "settings",
               "notifications", "login", "signup", "signin", "jobs", "events", "collections", "trending",
               "contact", "security", "enterprise", "team", "new", "organizations", "apps", "pulls", "issues"),
    "gitlab": ("about", "explore", "help", "users", "sign_in", "sign_up", "projects", "directory", "-"),
    "bitbucket": ("account", "features", "about", "product", "plans", "pricing", "blog", "help", "api",
                  "enterprise", "integrations", "addon"),
    "leetcode": ("problems", "contest", "contests", "discussion", "study-plan", "interview", "explore",
                 "play", "company", "mock", "api", "assessment", "jobs", "subscribe"),
    "hackerrank": ("domains", "challenges", "contests", "dashboard", "skills", "hiring", "about", "contact",
                   "certificates", "tests", "work", "login", "signup", "jobs"),
    "codepen": ("pens", "projects", "collection", "collections", "topics", "search", "jobs", "login", "signup",
                "about", "settings", "videos", "podcasts", "license", "privacy", "terms"),
    "devto": ("search", "api", "dashboard", "notifications", "tags", "top", "latest", "signup", "login",
              "about", "contact", "new", "settings", "admin", "privacy", "terms", "pod", "video"),
    "hashnode": ("team", "about", "pages", "new", "dashboard", "settings", "login", "signup", "search", "tags"),
    "kaggle": ("competitions", "datasets", "models", "docs", "learn", "search", "account", "settings",
               "about", "contact", "me", "code", "discussions", "notebooks"),
    "huggingface": ("models", "datasets", "spaces", "docs", "tasks", "chat", "login", "signup", "settings",
                    "about", "pricing", "enterprise", "organizations", "blog", "search", "papers"),
    "researchgate": ("search", "publication", "publications", "questions", "topics", "members", "about",
                     "login", "signup", "jobs", "network", "labs", "meetings"),
    "scholar": (),
    "linkedin": (),
    "wellfound": ("companies", "jobs", "talent", "sessions", "blog", "about", "login", "signup", "products",
                  "articles", "events", "guides", "newsletter"),
    "cutshort": (),
    "behance": ("search", "galleries", "moodboards", "joblist", "featured", "adobe", "about", "login",
                "signup", "terms", "privacy", "api", "collections"),
    "dribbble": ("shots", "search", "collections", "tags", "jobs", "stories", "meetups", "goals", "about",
                 "login", "signup", "hire", "talent", "terms", "privacy"),
    "artstation": ("search", "jobs", "about", "login", "signup", "marketplace", "contests", "blog", "careers",
                   "community", "learn", "news", "terms", "privacy"),
    "orcid": (),
    "producthunt": ("categories", "topics", "posts", "products", "discussions", "search", "about", "login",
                    "signup", "newsletter", "faq", "pricing", "tools", "collections", "makers"),
    "indiehackers": ("browse", "learn", "forum", "interviews", "about", "signup", "login", "jobs", "products",
                     "podcast", "newsletter", "start", "top"),
    "stackoverflow": (),
}


def profile_source(url: str) -> str | None:
    stripped = url.strip()
    for pattern, source in zip(_PROFILE_URL_PATTERNS, _PROFILE_SOURCES):
        if pattern.match(stripped):
            path = stripped.split("://", 1)[-1]
            path = path.split("/", 1)[1] if "/" in path else ""
            path = path.split("?", 1)[0].split("#", 1)[0]
            first = path.split("/", 1)[0].lower()
            if first in _RESERVED_PATHS.get(source, ()):
                return None
            return source
    return None
