"""Fetch a job posting page and extract its readable text."""

import re

import httpx
from bs4 import BeautifulSoup

from .logging_config import get_logger

log = get_logger("jobtracker.jdfetch")

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Tags that never contain the job description.
_DROP_TAGS = ["script", "style", "nav", "footer", "header", "noscript", "svg", "form"]

MAX_CHARS = 12000  # cap what we feed to the model


class FetchError(Exception):
    """Raised when a page can't be fetched or has no usable text."""


def fetch_page_text(url: str) -> str:
    """Download a URL and return its main readable text (best-effort)."""
    try:
        resp = httpx.get(
            url, headers=_HEADERS, timeout=20.0, follow_redirects=True
        )
    except httpx.HTTPError as exc:
        raise FetchError(f"Could not reach the link: {exc}") from exc

    if resp.status_code != 200:
        raise FetchError(
            f"The link returned HTTP {resp.status_code} — the page may require "
            "login or block automated access. Paste the JD manually instead."
        )

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(_DROP_TAGS):
        tag.decompose()

    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) < 200:
        raise FetchError(
            "Couldn't read meaningful text from the link (it may be a "
            "JavaScript-rendered or login-walled page). Paste the JD manually."
        )

    log.info("Fetched %d chars from %s", len(text), url)
    return text[:MAX_CHARS]
