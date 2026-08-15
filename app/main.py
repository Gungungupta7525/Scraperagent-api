from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .agent import ScrapingAgent, UpstreamError
from .config import Settings
from .schemas import ScrapingRequest, ScrapingResponse

settings = Settings()


def get_agent():
    return ScrapingAgent(settings)

app = FastAPI(
    title="ScraperAgent",
    version="0.1.0",
    description="Candidate sourcing endpoint: takes a job description and returns ranked candidate profiles from public sources.",
)

allow_credentials = "*" not in settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_api_key(x_api_key: str = Header(default=None)):
    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="invalid or missing API key")
    return x_api_key


@app.get("/health")
def health():
    return {"status": "ok", "llm_configured": settings.llm_configured}


@app.post("/scraping-agent", response_model=ScrapingResponse, dependencies=[Depends(require_api_key)])
def scraping_agent(payload: ScrapingRequest):
    if not settings.llm_configured:
        raise HTTPException(
            status_code=503,
            detail="no LLM provider configured: set GROQ_API_KEY and/or GEMINI_API_KEY",
        )
    try:
        return get_agent().run(
            payload.job_description,
            sources=payload.sources,
            max_candidates=payload.max_candidates,
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
