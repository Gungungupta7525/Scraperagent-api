from typing import List, Optional

from pydantic import BaseModel, Field


class ScrapingRequest(BaseModel):
    job_description: str = Field(..., min_length=1, max_length=20000, description="The job description to source candidates for.")
    sources: Optional[List[str]] = Field(
        default=None,
        description="Optional allow-list of sources (github, linkedin, indeed, wellfound, stackoverflow, kaggle, behance, dribbble). Defaults to role-adaptive set.",
    )
    max_candidates: int = Field(default=100, ge=1, le=100, description="Maximum number of ranked candidates to return.")


class CandidateProfile(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    headline: Optional[str] = None
    source: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    experience: Optional[str] = None
    relevance_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    summary: Optional[str] = None
    rank: Optional[int] = None


class SourceStatus(BaseModel):
    source: str
    status: str
    error: Optional[str] = None
    candidates_found: int = 0


class ScrapingResponse(BaseModel):
    job_description: str
    candidates: List[CandidateProfile]
    sources_status: List[SourceStatus]
    sources_used: List[str]
    partial: bool = False
    error: Optional[str] = None
