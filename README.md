# ScraperAgent 🕵️

Candidate-sourcing **chat UI + API**. Paste a job description into the chat and get a ranked list of candidate profiles sourced from the public web — for recruiting/sourcing.

Live demo: **https://scraperagent-api.onrender.com/**

## Repository layout

```
├── app/          # FastAPI backend (scraping-agent endpoint)
├── frontend/     # Chat UI (static: HTML/CSS/JS, no build step)
├── tests/        # Backend unit tests
├── requirements*.txt
└── Dockerfile    # Cloud Run / Render ready
```

## API

`POST /scraping-agent` — one job description in, ranked candidates out. Stateless (no chat history).

Request:

```json
{ "job_description": "Senior Python backend engineer...", "max_candidates": 10 }
```

Response (200): `candidates[]` ranked with `relevance_score`, plus `sources_status` showing which sources succeeded/failed.

Errors: **503** upstream failure (no LLM/provider reachable), **200 empty list** when nothing found, optional **401** when `API_KEY` is set on the backend.

`GET /health` — `{"status": "ok", "llm_configured": true}`.

## Frontend

Static chat UI in `frontend/`. It talks to the API at the base URL in `frontend/config.js`:

```js
const CONFIG = {
  API_BASE_URL: "https://scraperagent-api.onrender.com",
  API_KEY: "",   // set if the backend requires X-API-Key
};
```

The base URL and API key can also be changed from the ⚙️ settings in the UI (stored in `localStorage`).

## Environment variables (backend)

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | Yes | Primary LLM |
| `GROQ_MODEL` | No | Override model |
| `GEMINI_API_KEY` | No | LLM fallback (Gemini Flash) |
| `TAVILY_API_KEY` | No | Search fallback if DuckDuckGo is rate-limited |
| `API_KEY` | No | If set, clients must send `X-API-Key` |
| `CORS_ORIGINS` | No | Defaults to `*` |

Full list in `.env.example`.

## Deploy on Render

1. Push this repo to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add `GROQ_API_KEY` as an environment variable.
6. Deploy. The chat UI is served at the root (`/`), the API at `/scraping-agent`.

## Run locally

```bash
pip install -r requirements.txt
# set GROQ_API_KEY, then:
uvicorn app.main:app --reload
# open http://localhost:8000
```

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```
