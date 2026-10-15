from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from .models import ApplicationStatus


class JobBase(BaseModel):
    job_id: str | None = None
    company_name: str
    job_link: str | None = None
    application_status: ApplicationStatus = ApplicationStatus.saved
    used_referral: bool = False
    cold_email: bool = False
    recruiter_email: str | None = None
    applied_date: date | None = None
    jd_text: str | None = None


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    job_id: str | None = None
    company_name: str | None = None
    job_link: str | None = None
    application_status: ApplicationStatus | None = None
    used_referral: bool | None = None
    cold_email: bool | None = None
    recruiter_email: str | None = None
    applied_date: date | None = None
    jd_text: str | None = None


class JobPage(BaseModel):
    """A page of jobs plus the total row count (for server-side pagination)."""

    items: list["JobOut"]
    total: int


class FetchJdRequest(BaseModel):
    job_link: str


class FetchJdResponse(BaseModel):
    jd_text: str


class JobStats(BaseModel):
    total: int
    applied: int
    interviews: int
    offers: int
    response_rate: int


class JobOut(JobBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime

    # Convenience flags so the grid knows whether a file exists without
    # shipping the bytes in the list response.
    has_resume: bool = False
    has_cover_letter: bool = False
    has_jd: bool = False
    has_ats: bool = False
    has_compatibility: bool = False

    # Analysis results (JSON strings) once generated.
    ats_keywords: str | None = None
    compatibility: str | None = None
