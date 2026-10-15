import io
import json
import time
from datetime import date

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models, schemas
from .ats import (
    AtsError,
    generate_ats_keywords,
    generate_compatibility,
    generate_jd_from_page,
)
from .jd_fetch import FetchError, fetch_page_text
from .config import settings
from .database import Base, engine, get_db
from .docx_utils import (
    DOCX_MIME,
    docx_bytes_to_html,
    docx_bytes_to_text,
    text_to_docx_bytes,
)
from .logging_config import get_logger, setup_logging

setup_logging()
log = get_logger("jobtracker.api")

# Create tables on startup. For real migrations, swap this for Alembic.
Base.metadata.create_all(bind=engine)
log.info("Database tables ready")

app = FastAPI(title="Job Application Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_job_or_404(job_id: int, db: Session) -> models.Job:
    job = db.get(models.Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _require_docx(file: UploadFile) -> None:
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are accepted")


def _maybe_set_applied_date(job: models.Job) -> None:
    """Stamp today's date the first time a job's status becomes 'Applied'."""
    if job.application_status == models.ApplicationStatus.applied and job.applied_date is None:
        job.applied_date = date.today()


# ---------------------------------------------------------------------------
# Job CRUD
# ---------------------------------------------------------------------------
# Text columns the client may filter on (AG Grid colId -> model attr).
_TEXT_FILTER_COLS = {
    "job_id": models.Job.job_id,
    "company_name": models.Job.company_name,
    "recruiter_email": models.Job.recruiter_email,
}


def _apply_filters(query, filters_json: str | None):
    """Apply AG Grid text column filters (server-side) to the query."""
    if not filters_json:
        return query
    try:
        model = json.loads(filters_json)
    except json.JSONDecodeError:
        return query

    # Status "set" filter: {"values": ["Applied", "Interview", ...]}
    status_spec = model.get("application_status")
    if isinstance(status_spec, dict) and status_spec.get("values"):
        members = []
        for v in status_spec["values"]:
            try:
                members.append(models.ApplicationStatus(v))
            except ValueError:
                pass
        if members:
            query = query.filter(models.Job.application_status.in_(members))

    for col_id, spec in model.items():
        col = _TEXT_FILTER_COLS.get(col_id)
        if col is None or not isinstance(spec, dict):
            continue
        # AG Grid may send combined conditions; use the first one.
        if "conditions" in spec and spec["conditions"]:
            spec = spec["conditions"][0]
        value = spec.get("filter")
        if value is None:
            continue
        v = str(value)
        ftype = spec.get("type", "contains")
        if ftype == "equals":
            query = query.filter(col.ilike(v))
        elif ftype == "notEqual":
            query = query.filter(~col.ilike(v))
        elif ftype == "startsWith":
            query = query.filter(col.ilike(f"{v}%"))
        elif ftype == "endsWith":
            query = query.filter(col.ilike(f"%{v}"))
        elif ftype == "notContains":
            query = query.filter(~col.ilike(f"%{v}%"))
        else:  # contains (default)
            query = query.filter(col.ilike(f"%{v}%"))
    return query


# Columns the client is allowed to sort by (maps AG Grid colId -> model attr).
_SORTABLE = {
    "id": models.Job.id,
    "job_id": models.Job.job_id,
    "company_name": models.Job.company_name,
    "application_status": models.Job.application_status,
    "used_referral": models.Job.used_referral,
    "cold_email": models.Job.cold_email,
    "recruiter_email": models.Job.recruiter_email,
    "applied_date": models.Job.applied_date,
    "created_at": models.Job.created_at,
}


@app.get("/api/jobs", response_model=schemas.JobPage)
def list_jobs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort: str = "id",
    order: str = "desc",
    search: str | None = None,
    filters: str | None = None,
    db: Session = Depends(get_db),
):
    """Return one page of jobs plus the total count (server-side pagination)."""
    query = db.query(models.Job)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(models.Job.company_name.ilike(like), models.Job.job_id.ilike(like))
        )
    query = _apply_filters(query, filters)

    total = query.count()

    sort_col = _SORTABLE.get(sort, models.Job.id)
    sort_col = sort_col.desc() if order == "desc" else sort_col.asc()
    items = query.order_by(sort_col).offset(offset).limit(limit).all()
    return {"items": items, "total": total}


@app.get("/api/jobs/applied-by-date")
def applied_by_date(db: Session = Depends(get_db)):
    """Count of jobs applied on each date (most recent first)."""
    rows = (
        db.query(models.Job.applied_date, func.count(models.Job.id))
        .filter(models.Job.applied_date.isnot(None))
        .group_by(models.Job.applied_date)
        .order_by(models.Job.applied_date.desc())
        .all()
    )
    return [{"date": d.isoformat(), "count": c} for d, c in rows]


@app.get("/api/jobs/stats", response_model=schemas.JobStats)
def job_stats(db: Session = Depends(get_db)):
    """Aggregate counts for the dashboard stat cards (computed in SQL)."""
    rows = (
        db.query(models.Job.application_status, func.count(models.Job.id))
        .group_by(models.Job.application_status)
        .all()
    )
    by = {status: count for status, count in rows}
    total = sum(by.values())
    S = models.ApplicationStatus
    applied = by.get(S.applied, 0)
    interviews = by.get(S.interview, 0)
    offers = by.get(S.offer, 0)
    responded = by.get(S.online_assessment, 0) + interviews + offers
    rate = round(responded / total * 100) if total else 0
    return {
        "total": total,
        "applied": applied,
        "interviews": interviews,
        "offers": offers,
        "response_rate": rate,
    }


@app.post("/api/jobs", response_model=schemas.JobOut, status_code=201)
def create_job(payload: schemas.JobCreate, db: Session = Depends(get_db)):
    job = models.Job(**payload.model_dump())
    _maybe_set_applied_date(job)
    db.add(job)
    db.commit()
    db.refresh(job)
    log.info("Created job id=%s company=%r", job.id, job.company_name)
    return job


@app.post("/api/jobs/fetch-jd", response_model=schemas.FetchJdResponse)
def fetch_jd(payload: schemas.FetchJdRequest):
    """Fetch a job link, extract its text, and have the model return a clean JD."""
    url = (payload.job_link or "").strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Enter a valid http(s) job link")
    try:
        page_text = fetch_page_text(url)
    except FetchError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    log.info("Fetch-JD: extracting JD from %s via %s", url, settings.ollama_model)
    try:
        jd_text = generate_jd_from_page(page_text)
    except AtsError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if not jd_text:
        raise HTTPException(
            status_code=422,
            detail="No job description found on that page. Paste it manually.",
        )
    return {"jd_text": jd_text}


@app.post("/api/jobs/{job_id}/fetch-jd", response_model=schemas.JobOut)
def fetch_jd_for_job(job_id: int, db: Session = Depends(get_db)):
    """Fetch the JD from an existing job's link and save it to that job."""
    job = _get_job_or_404(job_id, db)
    if not job.job_link:
        raise HTTPException(status_code=400, detail="Add a job link first")
    try:
        page_text = fetch_page_text(job.job_link.strip())
    except FetchError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    log.info("Fetch-JD: job id=%s from %s", job_id, job.job_link)
    try:
        jd_text = generate_jd_from_page(page_text)
    except AtsError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if not jd_text:
        raise HTTPException(
            status_code=422,
            detail="No job description found on that page. Paste it manually.",
        )
    job.jd_text = jd_text
    db.commit()
    db.refresh(job)
    return job


@app.get("/api/jobs/{job_id}", response_model=schemas.JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    return _get_job_or_404(job_id, db)


@app.put("/api/jobs/{job_id}", response_model=schemas.JobOut)
def update_job(
    job_id: int, payload: schemas.JobUpdate, db: Session = Depends(get_db)
):
    job = _get_job_or_404(job_id, db)
    changed = payload.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(job, field, value)
    _maybe_set_applied_date(job)
    db.commit()
    db.refresh(job)
    log.info("Updated job id=%s fields=%s", job_id, list(changed.keys()))
    return job


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = _get_job_or_404(job_id, db)
    db.delete(job)
    db.commit()
    log.info("Deleted job id=%s", job_id)


# ---------------------------------------------------------------------------
# Resume (docx upload / download)
# ---------------------------------------------------------------------------
@app.post("/api/jobs/{job_id}/resume", response_model=schemas.JobOut)
async def upload_resume(
    job_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    job = _get_job_or_404(job_id, db)
    _require_docx(file)
    job.resume = await file.read()
    job.resume_filename = file.filename
    db.commit()
    db.refresh(job)
    log.info("Uploaded resume for job id=%s (%s, %d bytes)", job_id, file.filename, len(job.resume))
    return job


@app.get("/api/jobs/{job_id}/resume")
def download_resume(job_id: int, db: Session = Depends(get_db)):
    job = _get_job_or_404(job_id, db)
    if job.resume is None:
        raise HTTPException(status_code=404, detail="No resume uploaded")
    filename = job.resume_filename or f"resume_{job_id}.docx"
    return StreamingResponse(
        io.BytesIO(job.resume),
        media_type=DOCX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/jobs/{job_id}/resume/preview", response_class=HTMLResponse)
def preview_resume(job_id: int, db: Session = Depends(get_db)):
    job = _get_job_or_404(job_id, db)
    if job.resume is None:
        raise HTTPException(status_code=404, detail="No resume uploaded")
    return docx_bytes_to_html(job.resume)


# ---------------------------------------------------------------------------
# Cover letter (docx upload / download)
# ---------------------------------------------------------------------------
@app.post("/api/jobs/{job_id}/cover-letter", response_model=schemas.JobOut)
async def upload_cover_letter(
    job_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    job = _get_job_or_404(job_id, db)
    _require_docx(file)
    job.cover_letter = await file.read()
    job.cover_letter_filename = file.filename
    db.commit()
    db.refresh(job)
    log.info("Uploaded cover letter for job id=%s (%s, %d bytes)", job_id, file.filename, len(job.cover_letter))
    return job


@app.get("/api/jobs/{job_id}/cover-letter")
def download_cover_letter(job_id: int, db: Session = Depends(get_db)):
    job = _get_job_or_404(job_id, db)
    if job.cover_letter is None:
        raise HTTPException(status_code=404, detail="No cover letter uploaded")
    filename = job.cover_letter_filename or f"cover_letter_{job_id}.docx"
    return StreamingResponse(
        io.BytesIO(job.cover_letter),
        media_type=DOCX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/jobs/{job_id}/cover-letter/preview", response_class=HTMLResponse)
def preview_cover_letter(job_id: int, db: Session = Depends(get_db)):
    job = _get_job_or_404(job_id, db)
    if job.cover_letter is None:
        raise HTTPException(status_code=404, detail="No cover letter uploaded")
    return docx_bytes_to_html(job.cover_letter)


# ---------------------------------------------------------------------------
# JD: entered as text, downloaded as a generated .docx
# ---------------------------------------------------------------------------
@app.get("/api/jobs/{job_id}/jd")
def download_jd(job_id: int, db: Session = Depends(get_db)):
    job = _get_job_or_404(job_id, db)
    if not job.jd_text:
        raise HTTPException(status_code=404, detail="No job description saved")
    docx_bytes = text_to_docx_bytes(
        job.jd_text, heading=f"JD - {job.company_name}"
    )
    filename = f"jd_{job.company_name}_{job_id}.docx".replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type=DOCX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/jobs/{job_id}/jd/preview", response_class=HTMLResponse)
def preview_jd(job_id: int, db: Session = Depends(get_db)):
    job = _get_job_or_404(job_id, db)
    if not job.jd_text:
        raise HTTPException(status_code=404, detail="No job description saved")
    # Render exactly what the generated .docx will contain.
    docx_bytes = text_to_docx_bytes(job.jd_text, title=f"JD - {job.company_name}")
    return docx_bytes_to_html(docx_bytes)


# ---------------------------------------------------------------------------
# ATS keyword extraction (local LLM via Ollama)
# ---------------------------------------------------------------------------
@app.post("/api/jobs/{job_id}/ats-keywords", response_model=schemas.JobOut)
def generate_ats(job_id: int, db: Session = Depends(get_db)):
    """Analyze the JD with the local model and store the ATS keyword result."""
    job = _get_job_or_404(job_id, db)
    if not job.jd_text:
        raise HTTPException(status_code=400, detail="Add a job description first")
    log.info(
        "ATS: generating for job id=%s (JD %d chars) via %s/%s",
        job_id, len(job.jd_text), settings.ollama_url, settings.ollama_model,
    )
    started = time.monotonic()
    try:
        result = generate_ats_keywords(job.jd_text)
    except AtsError as exc:
        log.error("ATS: generation failed for job id=%s: %s", job_id, exc)
        raise HTTPException(status_code=502, detail=str(exc))
    job.ats_keywords = json.dumps(result)
    db.commit()
    db.refresh(job)
    total = sum(len(result.get(k, [])) for k in ("hard_skills", "tools_technologies", "soft_skills", "keywords"))
    log.info("ATS: saved %d keywords for job id=%s (completed in %.1fs)", total, job_id, time.monotonic() - started)
    return job


# ---------------------------------------------------------------------------
# JD / resume compatibility score (local LLM via Ollama)
# ---------------------------------------------------------------------------
@app.post("/api/jobs/{job_id}/compatibility", response_model=schemas.JobOut)
def generate_compat(job_id: int, db: Session = Depends(get_db)):
    """Compare the resume against the JD and store a compatibility score."""
    job = _get_job_or_404(job_id, db)
    if not job.jd_text:
        raise HTTPException(status_code=400, detail="Add a job description first")
    if job.resume is None:
        raise HTTPException(status_code=400, detail="Upload a resume first")

    resume_text = docx_bytes_to_text(job.resume)
    if not resume_text:
        raise HTTPException(status_code=400, detail="Could not read any text from the resume")

    log.info(
        "Compat: scoring job id=%s (JD %d chars, resume %d chars)",
        job_id, len(job.jd_text), len(resume_text),
    )
    started = time.monotonic()
    try:
        result = generate_compatibility(job.jd_text, resume_text)
    except AtsError as exc:
        log.error("Compat: generation failed for job id=%s: %s", job_id, exc)
        raise HTTPException(status_code=502, detail=str(exc))
    job.compatibility = json.dumps(result)
    db.commit()
    db.refresh(job)
    log.info("Compat: saved score=%s%% for job id=%s (completed in %.1fs)", result.get("score"), job_id, time.monotonic() - started)
    return job


@app.get("/api/health")
def health():
    return {"status": "ok"}
