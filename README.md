# Job Application Tracker

Track job applications in a fast, dark-themed data grid — with document
management and **AI** features that fetch job descriptions, extract ATS keywords,
and score how well your resume matches.

- **Frontend:** React + Vite + AG Grid (dark theme)
- **Backend:** FastAPI + SQLAlchemy
- **Database:** PostgreSQL (resume/cover-letter `.docx` stored as `bytea`)
- **AI:** LLM via [Ollama](https://ollama.com) — a cloud model (default) or a
  fully-local model; no paid API key needed

## Features

- **Dashboard** with live stat cards: total, applied, interviews, offers, response rate
- **Editable grid** — Job Id, Company, Job Link, Status, Recruiter Email, and the
  Referral / Cold Email toggles save immediately on change
- **Colored status pills** with a click-to-change dropdown (7 statuses)
- **Date Applied** — auto-stamped the first time a job's status becomes "Applied"
- **Documents** — upload Resume / Cover Letter `.docx`, preview them in-browser,
  or download. JD is stored as text and downloaded/previewed as a generated `.docx`.
- **Fetch JD from the job link** — the AI reads the posting page and fills in a
  clean JD (from the Add form, or the **Generate** button in the JD column)
- **ATS Keywords** — the model extracts the keywords/skills a resume needs to
  pass an ATS screen for the JD
- **Compatibility** — the model scores the resume against the JD (0–100%) with a
  matched/missing breakdown
- **Server-side pagination, sorting, filtering, and search** (scales to large tables)
- **Column show/hide** and a **page-size selector** (10 / 50 / 100)

## Columns

Job Id · Company · Job Link · Status · Date Applied · Referral · Cold Email ·
Recruiter Email · Resume · Cover Letter · JD · ATS Keywords · Compatibility · 🗑 Delete

> **Job Id** is user-entered (e.g. a req number). An internal auto-id is used by
> the API and isn't shown. **Date Applied** is set automatically on the first
> transition to "Applied".

## Prerequisites

- **PostgreSQL 17** (this setup uses Homebrew's)
- **Python 3.13** (3.14 is too new for some wheels)
- **Node.js 18+**
- **Ollama** for the AI features. Two options:
  - **Cloud model (default):** sign in once with `ollama signin`, then the app
    uses `gpt-oss:20b-cloud` — fast and no load on your machine (needs internet).
  - **Local models (offline):** pull them and point `.env` at them:
    ```bash
    ollama pull qwen3:4b   # ATS keyword extraction
    ollama pull qwen3:8b   # compatibility scoring
    ```

## Quick start (one command)

From the **project root**:

```bash
./start.sh
```

This ensures Postgres and Ollama are running, then starts the backend
(http://localhost:8000) and frontend (http://localhost:5173) together.
Press **Ctrl+C** to stop both.

First-time only, do the one-time setup below before running `./start.sh`.

## Manual setup / first run

### 1. Database

```bash
brew services start postgresql@17   # if not already running
createdb jobtracker                 # one-time: create the database
```

The backend connects as your macOS user with no password (Homebrew trust auth) —
see `DATABASE_URL` in `backend/.env`. Point it at any other Postgres by editing
that value.

### 2. Backend

```bash
cd backend
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # adjust if your DB / Ollama differ
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                  # http://localhost:5173
```

## AI features

Three AI actions, all through Ollama (same `/api/chat` endpoint for cloud or local):

| Action | What it does | Where |
|---|---|---|
| **Fetch JD** | Reads the job-link page, strips it, and returns a clean JD | Add form button + JD-column **Generate** |
| **ATS Keywords** | Extracts the keywords/skills a resume needs for the JD | ATS column **Generate** (model = `OLLAMA_MODEL`) |
| **Compatibility** | Scores resume vs JD (0–100) with matched/missing | Compatibility column **Score** (model = `OLLAMA_COMPAT_MODEL`) |

- Results are **saved** to Postgres; **↻** regenerates and re-saves.
- Compatibility needs both a **JD** and an **uploaded resume**.
- Generation logs (with model + timings) print to the backend console.

**Cloud vs local:** a model whose name ends in `-cloud` runs on Ollama's servers
(fast, no local load, but your JD/resume text is sent to Ollama and it needs
internet + `ollama signin`). A plain model (e.g. `qwen3:4b`) runs entirely on your
machine (private, offline, slower). The code handles both — just set the `.env`
values. Local models use Ollama's strict JSON-schema output; cloud models are
asked for JSON in the prompt and parsed.

### Fetch-JD limitations

The server fetches the page HTML and the model extracts the JD, so it works well
on **static/simple postings** (Greenhouse, Lever, company career pages). **JS-
rendered or login-walled pages** (LinkedIn, many Workday pages) return little
usable text — you'll get a clear message to paste the JD manually.

## How documents work

- **Resume / Cover Letter:** upload a `.docx` per row (Upload / Replace in the
  grid). Bytes are stored in the `jobs` table; Download streams them back;
  Preview renders them in-browser (converted to HTML via `mammoth`).
- **JD:** stored as text (typed, or AI-fetched from the link). The JD column's
  Download returns a `.docx` generated via `python-docx`; Preview shows it rendered.

## Filtering & search

- **Search box** — company or job id (server-side).
- **Column filters** — text filters on Job Id, Company, Recruiter Email; a
  multi-select pill filter on Status. All applied server-side.
- **Sort** — click any sortable header; sorting runs on the server.

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | local Homebrew Postgres | Postgres connection |
| `CORS_ORIGINS` | `http://localhost:5173` | allowed frontend origin(s) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `gpt-oss:20b-cloud` | model for Fetch-JD + ATS keywords |
| `OLLAMA_COMPAT_MODEL` | `gpt-oss:20b-cloud` | model for compatibility |

Set the two model vars to `qwen3:4b` / `qwen3:8b` for a fully-local, offline setup.
Frontend (`frontend/.env`): `VITE_API_BASE` (default `http://localhost:8000`).

## Project structure

```
JobTrackerApplication/
├── start.sh                 # one-command launcher
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + routes
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── ats.py           # Ollama calls (fetch-JD, ATS, compatibility)
│   │   ├── jd_fetch.py      # fetch + clean a job-posting page
│   │   ├── docx_utils.py    # docx generate / preview / text extract
│   │   ├── config.py        # settings (.env)
│   │   └── logging_config.py
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx          # grid, dashboard, datasource
        ├── api.js           # API client
        ├── statuses.js      # status colors + score colors
        └── components/      # cells, modals, filters
```

## Notes / limitations

- Tables are auto-created on startup (`create_all` + manual `ALTER`). For
  production, add **Alembic** migrations.
- Single-user; no authentication.
- Cloud AI models send your JD/resume text to Ollama's servers and need internet.
  Use local models (`qwen3:*`) if you want everything to stay on your machine.
- Files live in Postgres as `bytea`. Storage is isolated in the backend, so
  moving to disk / S3 / Google Drive only changes the upload/download endpoints.
