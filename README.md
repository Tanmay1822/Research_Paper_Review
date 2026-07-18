# Research Paper Review (RPA)

An AI-powered research assistant for managing academic PDFs. Upload papers, get structured knowledge cards and vector embeddings, chat with citations, compare studies, detect contradictions, and explore citation networks—all in one workspace.

![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-latest-green)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-336791)

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick start (Docker)](#quick-start-docker)
- [Local development (without Docker)](#local-development-without-docker)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [How PDF ingestion works](#how-pdf-ingestion-works)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Paper library
- Upload PDFs (async processing via Celery)
- Organize papers into **folders**
- Track **reading status** (`to_read`, `reading`, `done`) and custom **tags**
- View structured **knowledge cards** (problem, methodology, dataset, results, limitations)
- In-app **PDF viewer** and **BibTeX export**
- **Semantic search** across your library (vector similarity)
- Discover **related papers online** for a selected upload
- Bulk delete, bulk knowledge-card refresh, and folder moves

### Chat workspace
- Multi-paper **RAG chat** with cited answers (page + quote)
- Persistent **chat threads** linked to selected papers
- Follow-up questions in context

### Compare papers
- Side-by-side **comparison matrix** (up to 10 papers)
- **Contradiction analysis** between 2–3 papers (agreements vs conflicting claims)
- **Research gap** finder across a paper set
- **Literature review** generation from selected papers


### Authentication
- Email/password signup and login
- JWT stored in **HTTP-only cookies** (7-day session)

---

## Architecture

```mermaid
flowchart TB
  subgraph client [Frontend - Next.js :3000]
    Pages[Library / Chat / Compare / Network]
  end

  subgraph api [Backend - FastAPI :8000]
    Routers[REST API Routers]
    Auth[JWT Auth]
  end

  subgraph async [Background]
    Worker[Celery Worker]
  end

  subgraph infra [Infrastructure]
    DB[(PostgreSQL + pgvector)]
    Redis[(Redis)]
    OAI[OpenAI API]
  end

  Pages -->|credentials + JSON| Routers
  Routers --> Auth
  Routers --> DB
  Routers --> Redis
  Routers --> OAI
  Worker --> Redis
  Worker --> DB
  Worker --> OAI
```

| Service    | Port  | Description                                      |
|------------|-------|--------------------------------------------------|
| Frontend   | 3000  | Next.js dashboard                                |
| API        | 8000  | FastAPI application                              |
| PostgreSQL | 5432  | Primary database + vector extension (`pgvector`) |
| Redis      | 6379  | Celery broker and result backend                 |

---

## Tech stack

| Layer        | Technologies |
|--------------|--------------|
| Frontend     | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend      | FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Task queue   | Celery, Redis |
| Database     | PostgreSQL 16, [pgvector](https://github.com/pgvector/pgvector) |
| AI / RAG     | LangChain, OpenAI (`gpt-4o`, `gpt-4o-mini`, `text-embedding-3-small`) |
| PDF parsing  | pypdf |
| Auth         | passlib (bcrypt), python-jose (JWT) |
| Containers   | Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended for full stack)
- An [OpenAI API key](https://platform.openai.com/api-keys) with billing enabled (required for ingestion, chat, and analysis)
- **Optional (local dev without Docker):** Python 3.11+, Node.js 20+, PostgreSQL with pgvector, Redis

---

## Quick start (Docker)

This is the fastest way to run the entire stack.

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Research_Paper_Review.git
cd Research_Paper_Review
```

### 2. Configure environment

Copy the example env file and add your secrets:

```bash
cp backend/env.example backend/.env
```

Edit `backend/.env`:

```env
DATABASE_URL=postgresql://admin:password@db:5432/rpa_db
OPENAI_API_KEY=sk-your-openai-key-here
JWT_SECRET=generate-a-long-random-secret-here
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
```

> **Note:** When using Docker Compose, `DATABASE_URL` should use host `db` (not `localhost`). Compose also injects DB/Redis URLs for the `api` and `worker` services; your `.env` must still include `OPENAI_API_KEY` and `JWT_SECRET`.

### 3. Start all services

```bash
docker-compose up --build
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Frontend |
| http://localhost:8000 | Backend API |
| http://localhost:8000/docs | Interactive API docs (Swagger) |

### 4. Apply database migrations

On first run, initialize the schema (from the project root, with containers running):

```bash
docker-compose exec api alembic upgrade head
```

### 5. Create an account and upload

1. Open http://localhost:3000 and sign up.
2. Go to **Library** and upload a PDF.
3. Wait until status shows **completed** (Celery worker processes the file).
4. Explore **Chat**, **Compare**, and **Citation Network**.

### Stop the stack

```bash
# Ctrl+C in the terminal, then:
docker-compose down
```

To remove database volume data as well:

```bash
docker-compose down -v
```

---

## Local development (without Docker)

Use this if you prefer running services natively on your machine.

### 1. PostgreSQL + pgvector

Run PostgreSQL 16 with the pgvector extension. Create a database, for example:

```sql
CREATE DATABASE rpa_db;
CREATE USER admin WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE rpa_db TO admin;
```

Enable the extension (connect to `rpa_db`):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Redis

```bash
redis-server
```

### 3. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
cp env.example .env
# Edit .env: use localhost for DATABASE_URL and Redis URLs
```

Run migrations from the **project root** (where `alembic.ini` lives):

```bash
alembic upgrade head
```

Start the API and Celery worker in **two separate terminals**:

```bash
# Terminal 1 - API
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Worker
cd backend
celery -A app.celery_app:celery_app worker --loglevel=info
```

### 4. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local` (optional; defaults to localhost API):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
npm run dev
```

Open http://localhost:3000.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g. `postgresql://admin:password@localhost:5432/rpa_db`) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings and LLM features |
| `JWT_SECRET` | Yes | Secret for signing JWT cookies; use a long random string in production |
| `CELERY_BROKER_URL` | Yes | Redis URL for Celery (e.g. `redis://localhost:6379/0`) |
| `CELERY_RESULT_BACKEND` | Yes | Redis URL for task results (usually same as broker) |

Copy from `backend/env.example`—never commit your real `.env` file.

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8000` | Base URL for API requests |

---

## Database migrations

Migrations live in `alembic/versions/`. Apply all pending migrations:

```bash
# From project root
alembic upgrade head
```

With Docker:

```bash
docker-compose exec api alembic upgrade head
```

Create a new migration after model changes (development):

```bash
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

---

## Project structure

```
research_paper_analysis/
├── alembic/                 # Database migrations
│   └── versions/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entry point
│   │   ├── celery_app.py    # Celery configuration
│   │   ├── db/
│   │   │   ├── models.py    # SQLAlchemy models
│   │   │   └── database.py
│   │   ├── routers/         # HTTP route handlers
│   │   │   ├── auth.py
│   │   │   ├── upload.py
│   │   │   ├── papers.py
│   │   │   ├── chat.py
│   │   │   ├── folders.py
│   │   │   └── analysis.py
│   │   ├── services/        # Business logic & AI agents
│   │   │   ├── ingestion.py
│   │   │   ├── qa_agent.py
│   │   │   ├── gap_finder.py
│   │   │   ├── lit_review.py
│   │   │   ├── contradiction_agent.py
│   │   │   └── citation_parser.py
│   │   └── tasks/           # Celery tasks
│   ├── uploads/             # Stored PDFs (gitignored)
│   ├── env.example
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/                 # Next.js App Router pages
│   │   ├── login/
│   │   ├── signup/
│   │   └── dashboard/
│   │       ├── library/
│   │       ├── chat/
│   │       ├── compare/
│   │       └── network/
│   ├── components/
│   ├── utils/api.ts         # API client
│   └── Dockerfile
├── docker-compose.yml
├── alembic.ini
└── README.md
```

---

## API overview

All authenticated routes require a valid session cookie (`credentials: include` from the frontend).

Base URL: `http://localhost:8000`

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Sign in (sets cookie) |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user |

### Papers & library

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/papers` | List user's papers |
| GET | `/api/papers/{id}` | Paper detail + knowledge card |
| GET | `/api/papers/{id}/pdf` | Stream PDF file |
| GET | `/api/papers/{id}/export-bibtex` | Download BibTeX |
| POST | `/api/papers/semantic-search` | Vector search |
| POST | `/api/papers/comparison-matrix` | Comparison table |
| POST | `/api/papers/citation-network` | Citation graph data |
| PATCH | `/api/papers/{id}/reading-status` | Update reading status |
| PATCH | `/api/papers/{id}/tags` | Update tags |

### Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload PDF (returns `task_id`, 202) |
| GET | `/api/upload/status/{task_id}` | Poll ingestion status |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message (RAG) |
| GET | `/api/chat/threads` | List threads |
| GET | `/api/chat/threads/{id}` | Thread with messages |

### Folders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/folders` | List / create folders |
| PATCH/DELETE | `/api/folders/{id}` | Rename / delete |

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze-contradictions` | Cross-paper contradiction report |
| POST | `/api/find-research-gaps` | Gap analysis |
| POST | `/api/generate-literature-review` | Lit review draft |
| POST | `/api/papers/bulk-extract` | Re-run knowledge extraction |

Full interactive documentation: http://localhost:8000/docs

---

## How PDF ingestion works

1. **Upload** — PDF is saved to `backend/uploads/staging/` and a Celery task is queued.
2. **Extract** — Text is read with `pypdf` and split into chunks.
3. **Enrich** — OpenAI extracts a structured knowledge card and paper category (Review / Empirical / Theoretical).
4. **Embed** — Chunks are embedded with `text-embedding-3-small` (1536 dimensions) and stored in PostgreSQL via pgvector.
5. **Serve** — Paper status becomes `completed`; chat and search use chunk embeddings for retrieval.

Uploaded files persist under `backend/uploads/` (per-paper UUID filenames). This directory is **gitignored**—do not commit user uploads.

---

## Security notes

Before publishing or deploying:

- **Never commit** `backend/.env`, `frontend/.env.local`, or files under `backend/uploads/`.
- Set a strong `JWT_SECRET` in production (the code defaults to a dev placeholder if unset).
- Rotate `OPENAI_API_KEY` if it was ever exposed.
- Docker Compose uses default Postgres credentials suitable for **local development only**.
- Restrict CORS `allow_origins` in `backend/app/main.py` when deploying to a real domain.
- User passwords are hashed with bcrypt; API uses HTTP-only cookies for sessions.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Upload stays `processing` forever | Celery worker not running | Start `worker` service or run Celery locally |
| `OPENAI_API_KEY not set` | Missing env var | Add key to `backend/.env` and restart API/worker |
| `503` / database errors | Postgres not ready or migrations missing | Wait for DB, run `alembic upgrade head` |
| Frontend can't reach API | Wrong API URL or CORS | Set `NEXT_PUBLIC_API_URL`; ensure API on port 8000 |
| Login works but uploads fail | Worker can't read staging path | Use Docker Compose volumes or same machine for API + worker |
| Semantic search empty | Paper still `pending`/`processing` | Wait for ingestion to complete |

Check API logs:

```bash
docker-compose logs -f api worker
```

---

## Contributing

1. Fork the repository and create a feature branch.
2. Keep secrets out of commits (use `env.example` only).
3. Run the stack locally and verify upload → chat → compare flows.
4. Open a pull request with a clear description of changes.

---

## License

This project does not include a license file yet. Add one (e.g. MIT) before distributing or if you want others to use the code freely.

---

## Acknowledgments

Built with FastAPI, Next.js, LangChain, OpenAI, PostgreSQL/pgvector, Celery, and Redis.
