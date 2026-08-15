import pytest
from pydantic import ValidationError

from app.schemas import CandidateProfile, ScrapingRequest, ScrapingResponse, SourceStatus


def test_request_requires_job_description():
    with pytest.raises(ValidationError):
        ScrapingRequest()


def test_request_accepts_defaults():
    request = ScrapingRequest(job_description="Senior backend engineer")
    assert request.max_candidates == 10
    assert request.sources is None


def test_response_model_roundtrip():
    payload = {
        "job_description": "Senior backend engineer",
        "candidates": [
            {
                "name": "Ada Lovelace",
                "source": "github",
                "url": "https://github.com/ada",
                "skills": ["python"],
                "relevance_score": 0.9,
                "rank": 1,
            }
        ],
        "sources_status": [{"source": "github", "status": "ok", "candidates_found": 1}],
        "sources_used": ["github"],
        "partial": False,
    }
    response = ScrapingResponse.model_validate(payload)
    assert isinstance(response.candidates[0], CandidateProfile)
    assert isinstance(response.sources_status[0], SourceStatus)


def test_relevance_score_clamped_by_schema():
    with pytest.raises(ValidationError):
        CandidateProfile(relevance_score=1.5)
