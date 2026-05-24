# getHired — Architecture

## What It Is

An automated job-hunting platform for developers. It scrapes LinkedIn daily, parses every job description with an LLM, embeds jobs into a vector space, and serves a personalized ranked feed so each user sees the roles most relevant to their profile. It also generates tailored resumes and cover letters on demand.

---

## High-Level System Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  BACKGROUND PIPELINE  (runs locally via crontab, no users)         │
│                                                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ jobs:fetch   │───▶│ jobs:parse   │───▶│    jobs:embed        │  │
│  │              │    │              │    │                      │  │
│  │ LinkedIn MCP │    │ LLM reads    │    │ OpenAI/Ollama embeds │  │
│  │ → search +   │    │ jd_raw →     │    │ job text →           │  │
│  │   details    │    │ structured   │    │ vector(768)          │  │
│  │ → JSON file  │    │ fields in    │    │ stored in            │  │
│  │              │    │ Supabase     │    │ job_postings         │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  NEXT.JS WEB APP  (src/app/)                                        │
│                                                                    │
│  / (landing)                                                       │
│       │                                                            │
│       ▼                                                            │
│  /login ── Supabase Google OAuth ── /auth/callback                 │
│       │                                                            │
│       ▼                                                            │
│  /dashboard (auth-gated — shows user info, sign-out)              │
│                                                                    │
│  API routes (implemented):                                         │
│    POST /api/chat          ← AI chat with MCP tools               │
│    POST /api/jobs/search   ← LinkedIn job search proxy            │
│    GET  /api/mcp/tools     ← lists available MCP tools            │
│                                                                    │
│  API routes (planned):                                             │
│    POST /api/profile/setup ← embed + save user profile            │
│    GET  /api/jobs/feed     ← pgvector ranked feed                 │
│    GET  /api/jobs/[id]     ← job detail                          │
│    POST /api/jobs/[id]/generate ← LLM → resume + cover letter    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | Server components + API routes |
| Auth | Supabase Auth (Google OAuth) | Session managed via `@supabase/ssr` cookies |
| Database | Supabase (PostgreSQL + pgvector) | Vector similarity for job matching |
| Embeddings | OpenAI `text-embedding-3-small` (768 dims) | Used for both jobs and user profiles — single shared utility |
| LLM (JD parse) | Ollama / Anthropic / OpenAI | Switchable via `--llm` flag or `.env` |
| LLM (chat / generation) | Anthropic Claude Sonnet (default) | Via Vercel AI SDK `streamText` |
| Job source | `linkedin-scraper-mcp` (local process) | MCP over streamable-HTTP on port 8080 |
| Styling | Tailwind CSS v4 | |
| Runtime | `tsx` for scripts, Node.js for Next.js | |

---

## Source Tree

```
src/
  app/
    api/
      chat/route.ts          ← AI chat endpoint (streams, uses MCP tools)
      jobs/search/route.ts   ← LinkedIn job search via MCP
      mcp/tools/route.ts     ← exposes list of available MCP tools
      auth/callback/route.ts ← OAuth redirect handler
    dashboard/page.tsx        ← auth-gated user dashboard
    login/page.tsx
    page.tsx                  ← landing page
    layout.tsx / globals.css

  lib/
    llm/providers.ts          ← factory: anthropic | openai | ollama
    mcp/
      client.ts               ← AI SDK MCP client (stdio / SSE / streamable-http)
      http-client.ts          ← raw MCP streamable-HTTP client (used in scripts)
      types.ts
    jobs/
      linkedin.ts             ← search + detail helpers (uses MCPHttpClient)
      parser.ts               ← parses raw MCP text → LinkedInJob[]
      types.ts
    supabase/
      client.ts               ← browser client
      server.ts               ← server/middleware client (cookie-based)

  middleware.ts               ← Supabase session refresh on every request

scripts/
  fetch-pune-jobs.ts          ← npm run jobs:fetch
  parse-jd-worker.ts          ← npm run jobs:parse
  embed-jobs.ts               ← npm run jobs:embed
  job-constants.ts            ← keyword groups, pass configs, output path
  output/                     ← staging JSON (auto-deleted after parse)
```

---

## Background Pipeline (3 Scripts)

Run in sequence daily (locally via crontab or manually):

```bash
npm run jobs:fetch    # ~10–20 min
npm run jobs:parse    # ~5–15 min depending on LLM
npm run jobs:embed    # ~2–5 min
```

### Script 1 — `jobs:fetch` (`scripts/fetch-pune-jobs.ts`)

1. Initialises a persistent `MCPHttpClient` session to the `linkedin-scraper-mcp` server.
2. For each keyword in `ACTIVE_GROUPS` × each pass (local / remote):
   - Calls `search_jobs` MCP tool → list of `LinkedInJob` objects.
   - For each new job, calls `get_job_details` MCP tool → `jd_raw` (full JD text).
3. Deduplicates by `job_id` across keywords.
4. Writes everything to `scripts/output/pune-jobs-{timestamp}.json` (flushed after each keyword).
5. Does **not** touch the database.

### Script 2 — `jobs:parse` (`scripts/parse-jd-worker.ts`)

1. Finds the latest JSON file in `scripts/output/`.
2. For each job with a `jd_raw`:
   - Sends it to the configured LLM using the Vercel AI SDK `generateObject` with a Zod schema.
   - Extracts: `seniority_level`, `experience_min/max`, `skills_required`, `skills_preferred`, `tech_stack`, `salary_min/max/currency`, `responsibilities`, `benefits`, `visa_sponsorship`, `summary`.
3. Upserts into Supabase:
   - `jobs` table: deduplicated by `dedup_key` (`company@title@city`).
   - `job_postings` table: one row per platform URL; all parsed fields written here. `jd_raw` is **never** stored in the DB.
4. Deletes the JSON file when all rows succeed (keeps it on partial failure for retry).

### Script 3 — `jobs:embed` (`scripts/embed-jobs.ts`)

1. Queries `job_postings` where `jd_parsed_at IS NOT NULL AND embedding IS NULL`.
2. Builds an embed string per job:
   ```
   "{title} at {company}. {seniority_level}. {employment_type}. {work_arrangement}.
   Required skills: {skills_required}. Tech stack: {tech_stack}. {jd_parsed.summary}"
   ```
3. Calls OpenAI `text-embedding-3-small` (or Ollama `nomic-embed-text`) in batches of 100.
4. Writes the 768-dim vector back to `job_postings.embedding`.

---

## LLM Provider Abstraction (`src/lib/llm/providers.ts`)

All LLM calls go through a single factory function:

```ts
getLanguageModel(config?)  →  LanguageModel
```

Provider is selected via the `LLM_PROVIDER` env var (default: `ollama`) or passed explicitly. Scripts can override with `--llm=anthropic:claude-sonnet-4-6` at runtime.

| Provider | Default model | How |
|---|---|---|
| `anthropic` | `claude-sonnet-4-6` | `@ai-sdk/anthropic` |
| `openai` | `gpt-4o` | `@ai-sdk/openai` |
| `ollama` | `gemma3:4b` | `ollama-ai-provider`, hits `localhost:11434` |

---

## MCP Integration (`src/lib/mcp/`)

Two separate MCP client implementations serve different use cases:

### `MCPHttpClient` (http-client.ts)
- Minimal hand-rolled client for scripts and server-side API routes.
- Manages `mcp-session-id` across requests.
- Used by `jobs:fetch` script and `/api/jobs/search` route.
- Parses MCP's SSE-format responses directly.

### AI SDK MCP Client (client.ts)
- Wraps `experimental_createMCPClient` from the Vercel AI SDK.
- Supports three transports: `stdio`, `sse`, `streamable-http`.
- Caches clients in a process-level `Map` so stdio processes aren't respawned per request.
- Exposes all tools from all configured MCP servers (prefixed by server name: `linkedin__search_jobs`).
- Used by `/api/chat` to give the LLM access to LinkedIn and any other MCP tools.

MCP servers are configured via the `MCP_SERVERS` env var (JSON array):
```json
[{ "name": "linkedin", "transport": "streamable-http", "url": "http://127.0.0.1:8080/mcp" }]
```

---

## Chat API (`/api/chat/route.ts`)

```
POST /api/chat
  body: { messages, system?, provider?, model? }
  response: streaming Vercel AI data stream
```

- Selects LLM via `getLanguageModel()` (from body or env default).
- Fetches all MCP tools via `getAllMCPTools()`.
- Calls `streamText` with up to 10 agentic steps (tool use → tool result → continue).
- Returns a streaming response the frontend can consume with the AI SDK's `useChat` hook.

---

## Auth Flow

```
User → /login → Supabase Google OAuth
     → Google redirects → /auth/callback/route.ts
     → Supabase exchanges code for session
     → redirect to /dashboard
```

`src/middleware.ts` runs on every request to refresh the Supabase session token stored in cookies. Protected routes check `supabase.auth.getUser()` server-side and redirect to `/login` if null.

---

## Database Schema

### `jobs` — one row per unique role (deduped across sources)
```sql
id          uuid  PK
dedup_key   text  UNIQUE   -- "google@software-engineer@pune"
company     text
title       text
created_at  timestamptz
```

Dedup key: `{company}@{title}@{city}` — lowercase, alphanumeric with hyphens.

### `job_postings` — one row per platform listing
```sql
id               uuid  PK
job_id           uuid  FK → jobs.id

-- Source metadata (from scrape)
source           text          -- "linkedin"
url              text          UNIQUE with source
location         text
work_arrangement text          -- Remote | On-site | Hybrid
employment_type  text          -- Full-time | Contract | Internship
applicant_count  text
is_accepting     boolean
easy_apply       boolean
pass_type        text          -- "local" | "remote"
posted_date      text
fetched_at       timestamptz
fetched_date     date

-- LLM-parsed (filled by jobs:parse)
seniority_level  text
experience_min   int
experience_max   int
skills_required  text[]        -- GIN indexed
skills_preferred text[]
tech_stack       text[]
salary_min       bigint        -- INR
salary_max       bigint
salary_currency  text
jd_parsed        jsonb         -- full LLM output
jd_parsed_at     timestamptz   -- NULL = not yet processed

-- Vector (filled by jobs:embed)
embedding        vector(768)   -- IVFFlat indexed
```

### `user_profiles` — planned, one row per user
```sql
id               uuid  PK
user_id          uuid  FK → auth.users  UNIQUE
desired_role     text
skills           text[]
experience_years int
seniority        text          -- Junior | Mid | Senior | Staff
preferences      text          -- free text
embedding        vector(768)
updated_at       timestamptz
```

---

## Embedding Utility (`src/lib/embeddings.ts`)

Single source of truth for all embedding calls — used by `jobs:embed` and the future profile setup API:

```ts
embedText(text: string): Promise<number[]>      // single string
embedTexts(texts: string[]): Promise<number[][]> // batch
```

Model: `text-embedding-3-small`, dimensions: `768`. Both jobs and user profiles must use this — mixing models breaks similarity scores.

---

## Planned: Vector-Based Jobs Feed

Once `user_profiles` exists, the feed query will be:

```sql
SELECT jp.*, j.company, j.title,
       1 - (jp.embedding <=> $user_embedding) AS score
FROM job_postings jp
JOIN jobs j ON j.id = jp.job_id
WHERE jp.fetched_date = CURRENT_DATE
  AND jp.is_accepting = true
  AND jp.embedding IS NOT NULL
ORDER BY jp.embedding <=> $user_embedding
LIMIT 50;
```

---

## Planned: Materials Generation

When a user clicks "Generate" on a job:

```
Inputs:
  user_profiles row  (desired_role, skills, experience, seniority)
  job_postings.jd_parsed  (responsibilities, skills_required, summary)
  jobs.company + jobs.title

LLM generates (Claude Sonnet, streaming):
  1. LaTeX resume  — ATS-optimised, mirrors JD keywords
  2. Cover letter (.md) — hook → value prop → cultural fit → CTA

Saved to:
  /output/applications/{YYYY-MM-DD}_{Company}_{Role}_Resume.tex
  /output/applications/{YYYY-MM-DD}_{Company}_{Role}_CoverLetter.md
```

---

## Build Status

| Item | Status |
|---|---|
| `jobs:fetch` script | Done |
| `jobs:parse` script | Done |
| `jobs:embed` script | Done |
| `/api/chat` with MCP tools | Done |
| `/api/jobs/search` proxy | Done |
| Google OAuth + `/dashboard` | Done |
| `user_profiles` table migration | Planned |
| `/onboarding` profile page | Planned |
| `/api/jobs/feed` pgvector query | Planned |
| `/jobs` feed page | Planned |
| `/jobs/[id]` detail page | Planned |
| `/api/jobs/[id]/generate` LLM generation | Planned |
| `/applications` history page | Planned |
| Multi-source scraping (Naukri, Wellfound) | Future |
