# Database Schema & Job Processing Flow

## Schema

### `jobs` — one row per unique role (deduped across platforms)

```sql
id           uuid        PK
dedup_key    text        UNIQUE  -- "google@software-engineer@pune"
company      text
title        text
created_at   timestamptz
```

**Dedup key format:** `{company}@{title}@{city}`  
**Normalization:** lowercase, trim, spaces → `-`, strip special chars, take first segment of location (city only)

```ts
function buildDedupKey(company: string, title: string, location: string): string {
  const city = location.split(",")[0];
  return [company, title, city].map(normalizeSegment).join("@");
}
// "Google" + "Software Engineer" + "Pune, Maharashtra, India" → "google@software-engineer@pune"
```

---

### `job_postings` — one row per platform listing

```sql
id               uuid        PK
job_id           uuid        FK → jobs.id
source           text        -- "linkedin", "wellfound", etc.
url              text
location         text
work_arrangement text        -- Remote | On-site | Hybrid
employment_type  text        -- Full-time | Contract | Internship
applicant_count  text        -- "27 applicants", "Over 100 applicants"
is_accepting     boolean
easy_apply       boolean
pass_type        text        -- "local" | "remote"
posted_date      text
fetched_at       timestamptz

-- LLM-parsed fields (filled by Cron 2 after reading JSON)
seniority_level  text        -- Junior | Mid | Senior | Staff | Principal
experience_min   int
experience_max   int
skills_required  text[]      -- GIN indexed
skills_preferred text[]
tech_stack       text[]
salary_min       bigint      -- in INR
salary_max       bigint
salary_currency  text
jd_parsed        jsonb       -- full LLM output (source of truth)
jd_parsed_at     timestamptz -- NULL = not yet processed (Cron 2 queue signal)

UNIQUE(source, url)
```

---

---

## Flow

Both scripts run locally — no Supabase cron, no cloud scheduler.

```
# crontab -e
0 9 * * *   cd /path/to/getHired && npm run jobs:fetch
30 9 * * *  cd /path/to/getHired && npm run jobs:parse
```

Or run manually in sequence:
```bash
npm run jobs:fetch   # ~10-20 min depending on keyword count
npm run jobs:parse   # runs immediately after
```

---

### Script 1 — `jobs:fetch`  (`scripts/fetch-pune-jobs.ts`)

```
→ starts LinkedIn MCP server session
→ searches LinkedIn (all keywords × 2 passes: local + remote)
→ fetches full job details per listing (including jd_raw)
→ writes everything to scripts/output/pune-jobs-{timestamp}.json
→ done — JSON is the staging area, DB not touched yet
```

### Script 2 — `jobs:parse`  (`scripts/parse-jd-worker.ts`)

```
→ finds latest JSON file in scripts/output/
→ for each job:
    → sends jd_raw to LLM (local Ollama or Anthropic/OpenAI via .env)
    → receives structured JSON:
        {
          seniority_level, experience_years: { min, max },
          skills_required[], skills_preferred[],
          tech_stack[], salary: { min, max, currency },
          responsibilities[], benefits[],
          visa_sponsorship, summary
        }
    → computes dedup_key from company + title + city
    → upserts into jobs (ON CONFLICT dedup_key DO NOTHING) → get job_id
    → upserts into job_postings (ON CONFLICT (source, url) DO UPDATE)
       with parsed data only — jd_raw never written to DB
→ deletes JSON file when all rows are processed
```

`jd_raw` lives only in the JSON file — never stored in the database.

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| `jobs` + `job_postings` split | Same role can appear on multiple platforms — dedup at job level |
| `dedup_key` includes city | Same role at same company in different cities = different opening |
| `jd_raw` only in JSON file | Never written to DB — JSON is a temp staging area, deleted after Cron 2 finishes |
| Scalar columns + `jd_parsed` jsonb | Scalar columns for fast SQL filtering; jsonb for full data without migrations |
| Local scripts via crontab | No cloud scheduler needed — runs on your machine, full control |
| `UNIQUE(source, url)` | Prevents duplicate listings from same platform without needing platform job ID |
