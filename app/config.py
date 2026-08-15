import os

DEFAULT_MODEL = "llama-3.3-70b-versatile"
DEFAULT_FALLBACK_MODEL = "llama-3.1-8b-instant"
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"


class Settings:
    def __init__(self, env=None):
        env = env if env is not None else os.environ

        self.groq_api_key = (env.get("GROQ_API_KEY") or "").strip()
        self.groq_model = (env.get("GROQ_MODEL") or DEFAULT_MODEL).strip()
        self.groq_fallback_model = (env.get("GROQ_FALLBACK_MODEL") or DEFAULT_FALLBACK_MODEL).strip()
        self.gemini_api_key = (env.get("GEMINI_API_KEY") or "").strip()
        self.gemini_model = (env.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
        self.tavily_api_key = (env.get("TAVILY_API_KEY") or "").strip()

        self.crawl4ai_enabled = env.get("ENABLE_CRAWL4AI", "false").lower() in ("1", "true", "yes")

        self.cors_origins = [o.strip() for o in env.get("CORS_ORIGINS", "*").split(",") if o.strip()]
        self.api_key = (env.get("API_KEY") or "").strip()

        self.request_timeout = float(env.get("AGENT_TIMEOUT", "60"))
        self.search_timeout = float(env.get("SEARCH_TIMEOUT", "10"))
        self.scrape_timeout = float(env.get("SCRAPE_TIMEOUT", "15"))
        self.max_llm_turns = int(env.get("MAX_LLM_TURNS", "8"))
        self.max_results_per_source = int(env.get("MAX_RESULTS_PER_SOURCE", "5"))
        self.max_scrapes = int(env.get("MAX_SCRAPES", "6"))

    @property
    def llm_configured(self) -> bool:
        return bool(self.groq_api_key or self.gemini_api_key)
