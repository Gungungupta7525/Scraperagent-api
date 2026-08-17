import asyncio
import json
import queue
import threading
import time
import warnings

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .agent import ScrapingAgent, UpstreamError
from .config import Settings
from .schemas import ScrapingRequest

warnings.filterwarnings("ignore", message=".*renamed.*ddgs.*")

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


def _safe_json(obj):
    try:
        return json.dumps(obj)
    except (TypeError, ValueError) as exc:
        print(f"[SAFE_JSON] json.dumps failed: {exc}", flush=True)
        sanitized = {"type": obj.get("type", "error"), "detail": f"serialization error: {exc}"}
        return json.dumps(sanitized)


def _run_job(agent: ScrapingAgent, job_description: str, sources, max_candidates: int, out: "queue.Queue"):
    def on_status(message: str) -> None:
        print(f"[STATUS] {message}", flush=True)
        out.put({"type": "status", "message": message})

    try:
        result = agent.run(
            job_description,
            sources=sources,
            max_candidates=max_candidates,
            on_status=on_status,
        )
        n = len(result.get("candidates", []))
        print(f"[RESULT] {n} candidates, partial={result.get('partial')}", flush=True)
        out.put({"type": "result", "data": result})
    except UpstreamError as exc:
        print(f"[UPSTREAM] {exc}", flush=True)
        out.put({"type": "error", "detail": str(exc), "status_code": 503})
    except Exception as exc:
        print(f"[EXCEPTION] {exc}", flush=True, exc_info=True)
        out.put({"type": "error", "detail": f"internal error: {exc}", "status_code": 500})
    finally:
        out.put(None)
        print("[THREAD] _run_job done", flush=True)


async def _ndjson(out: "queue.Queue", thread: threading.Thread):
    last_beat = time.monotonic()
    while True:
        try:
            item = out.get_nowait()
            if item is None:
                print("[NDJSON] sentinel received, closing", flush=True)
                return
            raw = _safe_json(item)
            t = item.get("type", "?")
            print(f"[NDJSON] yielding type={t} len={len(raw)}", flush=True)
            yield raw + "\n"
            if t in ("result", "error"):
                return
            last_beat = time.monotonic()
        except queue.Empty:
            if not thread.is_alive():
                print("[NDJSON] thread dead, final queue check", flush=True)
                try:
                    item = out.get_nowait()
                    if item is None:
                        return
                    raw = _safe_json(item)
                    t = item.get("type", "?")
                    print(f"[NDJSON] final type={t} len={len(raw)}", flush=True)
                    yield raw + "\n"
                    if t in ("result", "error"):
                        return
                except queue.Empty:
                    print("[NDJSON] WARNING: thread dead, queue empty, no result!", flush=True)
                return
            if time.monotonic() - last_beat >= 10:
                yield _safe_json({"type": "status", "message": "Still working…"}) + "\n"
                last_beat = time.monotonic()
            await asyncio.sleep(0.1)


@app.get("/health")
def health():
    return {"status": "ok", "llm_configured": settings.llm_configured, "mode": "llm+heuristic" if settings.llm_configured else "heuristic-only"}


@app.post("/scraping-agent", dependencies=[Depends(require_api_key)])
def scraping_agent(payload: ScrapingRequest, stream: int = 0):
    if stream:
        out: "queue.Queue" = queue.Queue()
        thread = threading.Thread(
            target=_run_job,
            args=(get_agent(), payload.job_description, payload.sources, payload.max_candidates, out),
            daemon=True,
        )
        thread.start()
        print(f"[REQUEST] stream started, sources={payload.sources}, max={payload.max_candidates}", flush=True)
        return StreamingResponse(_ndjson(out, thread), media_type="application/x-ndjson")
    try:
        return get_agent().run(
            payload.job_description,
            sources=payload.sources,
            max_candidates=payload.max_candidates,
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
