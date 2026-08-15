# Scraping Agent — Candidate Sourcing Endpoint

Status: **built** per this spec. A FastAPI endpoint (`POST /scraping-agent`) that takes a job description and returns a ranked list of candidate profiles sourced from the public web — for recruiting/sourcing, not job-listing search.

Stateless: one request in (job description), one response out (ranked candidates). No chat history — this is intentionally simpler than the project's other chat-history-based endpoints.

## Architecture

```
POST /scraping-agent
{ "job_description": "..." }
        │
        ▼
Groq LLM (tool-calling loop)
│
┌────┴────┐
▼         ▼
web_search  scrape_page
│         │
▼         ▼
DuckDuckGo  trafilatura → BeautifulSoup → (Crawl4AI, if added)
│
▼
Ranked JSON candidate list
```

## Candidate sources

Targets publicly searchable sources only — no login, no scraping behind a paywall or auth wall:

- **GitHub** — public profiles, strong technical signal (best source for technical roles)
- **LinkedIn (X-ray search)** — via search engine, `site:linkedin.com/in` reads public search results/snippets only. Never logs in or scrapes authenticated LinkedIn pages.
- **Indeed** — public resume search results only (not the paid, login-gated Indeed Resume contact feature)
- **Wellfound (AngelList)** — public profiles, good for startup-track roles

Optional, role-dependent additions:

- **Stack Overflow** (dev roles), **Kaggle** (data/ML roles), **Behance/Dribbble** (design roles)

Explicitly dropped: **Dice, Monster, Indeed Resume, and EZyConnect** candidate/resume databases — all require a paid recruiter login, and automated scraping against those (even with a legitimate paid account) typically breaches their Terms of Service. Not part of the automated tool. If you have paid access to these, the plan is to search manually there and paste results into the agent for ranking — not to scrape them directly.

## Reliability / fallback layers

| Layer | Primary | Fallback |
| --- | --- | --- |
| LLM Search | Groq (retry w/ backoff) | Gemini Flash → smaller Groq model |
| Search | DuckDuckGo (retry) | SearXNG or Tavily free tier |
| Scrape | trafilatura | BeautifulSoup → Crawl4AI (JS-heavy pages) |

Also planned/implemented:

- Per-scrape timeout; skip and log on failure rather than blocking
- Per-source circuit breaker (stop hitting a source that's failing repeatedly within one request)
- Overall request timeout, with partial results returned rather than a hard failure — response includes a `sources_status` field showing what succeeded/failed
- Structured error responses distinguishing **"no candidates found"** (200, empty list) from **"upstream failure"** (503)

Fallback providers are optional — the agent should degrade gracefully to just Groq + DuckDuckGo + trafilatura if extra keys aren't configured, and pick up the fallbacks automatically once they are.

## Hosting

Finalized: **GCP, via Cloud Run**. Always-free tier: 2M requests/month, scales to zero when idle. Deploy as a container (Dockerfile) alongside/within the existing FastAPI app.

Watch: egress/data-transfer allowance if scraping volume gets heavy; Cloud Run's own request timeout should sit comfortably above whatever internal timeout cap the agent uses (`AGENT_TIMEOUT`, default 60s).

## Required API keys / environment variables

| Variable | Required? | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | Yes | Primary LLM |
| `GROQ_MODEL` | No (has default) | Override model, e.g. for the small fallback model |
| `GEMINI_API_KEY` | No | LLM fallback if Groq errors/ratelimits |
| `TAVILY_API_KEY` | No | Search fallback if DuckDuckGo is rate-limited |

## API

### `POST /scraping-agent`

Request:

```json
{ "job_description": "Senior Python backend engineer..." }
```

Optional fields: `sources` (allow-list of `github`, `linkedin`, `indeed`, `wellfound`, `stackoverflow`, `kaggle`, `behance`, `dribbble`) and `max_candidates` (1–50, default 10).

Response (200):

```json
{
  "job_description": "...",
  "candidates": [
    {
      "name": "...",
      "role": "...",
      "headline": "...",
      "source": "github",
      "url": "https://github.com/...",
      "location": "...",
      "skills": ["..."],
      "experience": "...",
      "relevance_score": 0.9,
      "summary": "...",
      "rank": 1
    }
  ],
  "sources_status": [
    { "source": "github", "status": "ok", "error": null, "candidates_found": 5 }
  ],
  "sources_used": ["github"],
  "partial": false
}
```

Errors: **503** on upstream failure (no LLM/provider reachable); **200 with empty `candidates`** when nothing was found; optional **401** when `API_KEY` is configured and the `X-API-Key` header is missing/mismatched.

### `GET /health`

Returns `{"status": "ok", "llm_configured": true|false}`.

## Running locally

```bash
pip install -r requirements.txt          # + requirements-optional.txt for Gemini/Crawl4AI
cp .env.example .env                      # fill in GROQ_API_KEY
export $(grep -v '^#' .env | xargs)
uvicorn app.main:app --reload
curl -X POST localhost:8000/scraping-agent \
  -H 'Content-Type: application/json' \
  -d '{"job_description": "Senior Python backend engineer, FastAPI, AWS"}'
```

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Deploy to Cloud Run

```bash
gcloud builds submit --tag gcr.io/<PROJECT>/scraper-agent
gcloud run deploy scraper-agent \
  --image gcr.io/<PROJECT>/scraper-agent \
  --set-env-vars GROQ_API_KEY=<key> \
  --allow-unauthenticated --region us-central1
```
