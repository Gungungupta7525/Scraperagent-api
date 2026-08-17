"""Source definitions — data only. Logic lives in queries.py and profiles.py."""


SOURCE_TEMPLATES = {
    "github": "site:github.com {terms}",
    "gitlab": "site:gitlab.com {terms}",
    "bitbucket": "site:bitbucket.org {terms}",
    "stackoverflow": "site:stackoverflow.com/users {terms}",
    "leetcode": "site:leetcode.com {terms}",
    "hackerrank": "site:hackerrank.com {terms}",
    "codepen": "site:codepen.io {terms}",
    "devto": "site:dev.to {terms}",
    "hashnode": "site:hashnode.com {terms}",
    "kaggle": "site:kaggle.com {terms}",
    "scholar": "site:scholar.google.com {terms}",
    "researchgate": "site:researchgate.net {terms}",
    "huggingface": "site:huggingface.co {terms}",
    "linkedin": "site:linkedin.com/in {terms}",
    "indeed": "site:indeed.com/resumes {terms}",
    "naukri": "site:naukri.com {terms}",
    "wellfound": "site:wellfound.com/profile {terms}",
    "instahyre": "site:instahyre.com {terms}",
    "cutshort": "site:cutshort.io {terms}",
    "behance": "site:behance.net {terms}",
    "dribbble": "site:dribbble.com {terms}",
    "artstation": "site:artstation.com {terms}",
    "orcid": "site:orcid.org {terms}",
    "producthunt": "site:producthunt.com {terms}",
    "indiehackers": "site:indiehackers.com {terms}",
}

SOURCE_LABELS = {
    "github": "GitHub",
    "gitlab": "GitLab",
    "bitbucket": "Bitbucket",
    "stackoverflow": "Stack Overflow",
    "leetcode": "LeetCode",
    "hackerrank": "HackerRank",
    "codepen": "CodePen",
    "devto": "Dev.to",
    "hashnode": "Hashnode",
    "kaggle": "Kaggle",
    "scholar": "Google Scholar",
    "researchgate": "ResearchGate",
    "huggingface": "Hugging Face",
    "linkedin": "LinkedIn",
    "indeed": "Indeed",
    "naukri": "Naukri",
    "wellfound": "Wellfound",
    "instahyre": "Instahyre",
    "cutshort": "Cutshort",
    "behance": "Behance",
    "dribbble": "Dribbble",
    "artstation": "ArtStation",
    "orcid": "ORCID",
    "producthunt": "Product Hunt",
    "indiehackers": "Indie Hackers",
}

CATEGORY_SOURCES = {
    "developer": ["github", "gitlab", "bitbucket", "stackoverflow", "leetcode", "hackerrank", "codepen", "devto", "hashnode"],
    "data": ["kaggle", "github", "scholar", "researchgate", "huggingface"],
    "general": ["linkedin", "wellfound", "cutshort", "github", "stackoverflow"],
    "design": ["behance", "dribbble", "artstation", "codepen", "linkedin"],
    "research": ["scholar", "researchgate", "orcid"],
    "startup": ["wellfound", "producthunt", "indiehackers", "github", "linkedin"],
}

CATEGORY_KEYWORDS = {
    "developer": (
        "developer", "software", "backend", "frontend", "full-stack", "full stack", "engineer", "programmer",
        "devops", "sre", "mobile", "react", "angular", "python", "javascript", "typescript", "java", "golang",
        "rust", "c++", "coder", "coding", "web development", "api",
    ),
    "data": (
        "data", "machine learning", "ml", "ai", "analyst", "scientist", "deep learning", "nlp", "data science",
        "artificial intelligence", "big data", "llm", "computer vision", "research",
    ),
    "design": (
        "design", "ui", "ux", "creative", "graphic", "illustrator", "visual", "product designer", "figma",
        "art director", "animation", "3d", "motion",
    ),
    "research": (
        "researcher", "phd", "ph.d", "professor", "academic", "postdoc", "research scientist", "scholar",
        "university", "paper", "publication", "research engineer",
    ),
    "startup": (
        "startup", "founder", "co-founder", "cofounder", "early-stage", "early stage", "product manager",
        "product lead", "growth", "series a", "venture",
    ),
}

MAX_SOURCES_PER_REQUEST = 15
