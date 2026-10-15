"""Local-LLM (Ollama) analyses: ATS keyword extraction and JD/resume match."""

import json
import time

import httpx

from .config import settings
from .logging_config import get_logger

log = get_logger("jobtracker.ats")


class AtsError(Exception):
    """Raised when a model call fails, with a user-facing message."""


def _parse_json_object(content: str) -> dict:
    """Parse a JSON object out of a model reply (tolerates prose / code fences)."""
    start, end = content.find("{"), content.rfind("}")
    if start == -1 or end == -1:
        raise AtsError("Model did not return a JSON object.")
    try:
        return json.loads(content[start : end + 1])
    except json.JSONDecodeError as exc:
        raise AtsError("Model did not return valid JSON.") from exc


def _ollama_chat(system: str, user: str, schema: dict, model: str | None = None) -> dict:
    """Call Ollama and return parsed JSON.

    Local models use Ollama's `format` JSON-schema (strict structured output).
    Cloud models (name ends with `-cloud`) don't support that schema, so we
    request the same keys in the prompt and parse the JSON from the reply.
    """
    model = model or settings.ollama_model
    is_cloud = model.endswith("-cloud")

    if is_cloud:
        keys = ", ".join(schema.get("properties", {}).keys())
        user = f"{user}\n\nRespond with ONLY a JSON object (no markdown) with keys: {keys}."
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "options": {"temperature": 0.2},
        }
    else:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "think": False,  # qwen3 is a reasoning model; skip <think> for speed
            "format": schema,
            "keep_alive": "30m",  # keep the model resident between calls
            "options": {"temperature": 0.2, "num_predict": 1024},
        }

    log.info("Calling Ollama model %s (this may take a while)...", model)
    started = time.monotonic()
    try:
        resp = httpx.post(f"{settings.ollama_url}/api/chat", json=payload, timeout=300.0)
    except httpx.ConnectError as exc:
        raise AtsError(
            f"Could not reach Ollama at {settings.ollama_url}. "
            "Is it running? Try `ollama serve`."
        ) from exc
    except httpx.HTTPError as exc:
        raise AtsError(f"Model request failed: {exc}") from exc

    if resp.status_code == 404:
        hint = "`ollama signin` (cloud model)" if is_cloud else f"`ollama pull {model}`"
        raise AtsError(f"Model '{model}' not available. Try {hint}.")
    if resp.status_code != 200:
        raise AtsError(f"Model returned HTTP {resp.status_code}: {resp.text[:200]}")

    elapsed = time.monotonic() - started
    content = resp.json().get("message", {}).get("content", "").strip()
    log.info("Ollama (%s) responded in %.1fs (%d chars)", model, elapsed, len(content))
    if not content:
        raise AtsError("Model returned an empty response.")

    return _parse_json_object(content)


# ---------------------------------------------------------------------------
# ATS keyword extraction
# ---------------------------------------------------------------------------
ATS_SCHEMA = {
    "type": "object",
    "properties": {
        "hard_skills": {"type": "array", "items": {"type": "string"}},
        "tools_technologies": {"type": "array", "items": {"type": "string"}},
        "soft_skills": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
    "required": ["hard_skills", "tools_technologies", "soft_skills", "keywords", "summary"],
}

ATS_SYSTEM = (
    "You are an expert resume and ATS (Applicant Tracking System) optimization "
    "assistant. You extract the exact keywords and skills a candidate's resume "
    "must contain to pass an automated ATS screen for a given job."
)

ATS_USER = """Analyze this job description and extract the most important \
terms a resume must include to clear an ATS screen for this role.

Guidelines:
- hard_skills: technical / domain skills required (explicit or clearly implied)
- tools_technologies: named tools, languages, frameworks, platforms, certifications
- soft_skills: interpersonal / professional skills mentioned
- keywords: other exact phrases or terms an ATS would scan for (titles, methodologies)
- summary: one sentence on what the resume should emphasize
Prefer terms that appear in or are directly implied by the JD. Do not invent unrelated skills.
List only the most important items: at most 12 per category, most critical first.

Job description:
\"\"\"
{jd}
\"\"\""""


def generate_ats_keywords(jd_text: str) -> dict:
    """Return the ATS keyword analysis for a job description."""
    return _ollama_chat(ATS_SYSTEM, ATS_USER.format(jd=jd_text), ATS_SCHEMA)


# ---------------------------------------------------------------------------
# JD / resume compatibility score
# ---------------------------------------------------------------------------
COMPAT_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "matched": {"type": "array", "items": {"type": "string"}},
        "missing": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
    "required": ["score", "matched", "missing", "summary"],
}

COMPAT_SYSTEM = (
    "You are an experienced hiring manager assessing whether a candidate is a "
    "genuine fit for a role. You judge actual qualifications - not keyword "
    "matching. Weigh how well the candidate's real experience, skills depth, "
    "seniority, scope of responsibility, and domain align with what the job "
    "requires. A resume that merely repeats the JD's words is not a strong match; "
    "demonstrated, relevant experience is. Be realistic and specific."
)

COMPAT_USER = """Assess how well this CANDIDATE fits this ROLE, as a hiring manager would.

Base the judgement on genuine fit, not word overlap:
- Are the core responsibilities something the candidate has actually done?
- Is their experience at the right depth and seniority for this role?
- Does their background (domain, scale, type of work) align with the role?
- Which hard requirements are clearly met, and which are genuinely absent?

Return:
- score: integer 0-100 for overall fit as a hiring decision (not keyword overlap)
- matched: requirements/qualifications the candidate genuinely demonstrates
- missing: important requirements the candidate does not actually meet
- summary: one or two sentences on their fit and what would most improve it

Judge only on what the resume actually shows. Do not assume unstated experience,
and do not reward a resume just for echoing the job description's wording.

=== JOB DESCRIPTION (the role) ===
{jd}

=== RESUME (the candidate) ===
{resume}"""


# ---------------------------------------------------------------------------
# JD extraction from a fetched web page
# ---------------------------------------------------------------------------
JD_SCHEMA = {
    "type": "object",
    "properties": {"jd_text": {"type": "string"}},
    "required": ["jd_text"],
}

JD_SYSTEM = (
    "You extract the job description from the raw text of a web page. You return "
    "only the posting's own content and ignore site navigation, ads, cookie "
    "banners, related jobs, and other boilerplate."
)

JD_USER = """From the following web page text, extract ONLY the job description \
for this role — the about/overview, responsibilities, requirements, \
qualifications, and (if present) location and compensation. Remove navigation, \
menus, ads, cookie notices, "similar jobs", and unrelated boilerplate. Keep the \
wording from the posting; do not invent anything. Return it as clean plain text.

If the page does not actually contain a job description, return an empty string.

WEB PAGE TEXT:
\"\"\"
{page}
\"\"\""""


def generate_jd_from_page(page_text: str) -> str:
    """Use the model to extract a clean job description from page text."""
    result = _ollama_chat(JD_SYSTEM, JD_USER.format(page=page_text), JD_SCHEMA)
    return (result.get("jd_text") or "").strip()


def generate_compatibility(jd_text: str, resume_text: str) -> dict:
    """Return a compatibility score and analysis for a resume vs. a JD.

    Uses the stronger compat model for better judgement than keyword matching.
    """
    user = COMPAT_USER.format(jd=jd_text, resume=resume_text)
    return _ollama_chat(COMPAT_SYSTEM, user, COMPAT_SCHEMA, model=settings.ollama_compat_model)
