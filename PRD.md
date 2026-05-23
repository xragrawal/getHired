---
name: hiring-radar
description: >
  End-to-end automated job hunting pipeline across multiple job boards — the "Hiring Radar".
  Use this skill whenever the user wants to find jobs across Wellfound, Indeed, Naukri, or LinkedIn,
  get AI-scored and ranked results, enrich leads with founder/company data, and generate
  personalized resumes, cover letters, or outreach messages. Triggers include: "scan job boards",
  "find me jobs on multiple platforms", "hiring radar", "automate my job search", "find jobs on
  Wellfound and LinkedIn", "score jobs by relevance", "find founder contacts for jobs",
  "generate outreach for job applications", "I want a job radar", or any request to search
  across more than one job platform. Also triggers when user wants to automate any part of
  the collect → score → enrich → outreach pipeline. Always use this skill proactively — even
  if the user only asks for one phase (e.g. just scoring, or just outreach), offer the full
  pipeline and run it end-to-end unless told otherwise.
---

# Hiring Radar

Inspired by the "Doc Radar" project — this is an automated pipeline that scans multiple job
boards, extracts structured data, scores jobs by AI relevance, enriches with founder/company
signals, and generates personalized application materials.

```
User provides profile / resume
        ↓
PHASE 1 — Candidate Profile
        ↓
PHASE 2 — Collect: Scan Wellfound, Indeed, Naukri, LinkedIn
        ↓
PHASE 3 — Schema: Extract structured data per job
        ↓
PHASE 4 — Score: AI ranking by relevance
        ↓
PHASE 5 — Enrich: Founder LinkedIn + company signals
        ↓
PHASE 6 — Outreach: Tailored resume, cover letter, LinkedIn DM
        ↓
PHASE 7 — Apply (email / portal / DM) + save to Drive
```

---

## PHASE 1 — Candidate Profile

**Input**: Resume (LaTeX, PDF, plain text, or pasted content), or ask the user to describe themselves.

Extract and display a **Profile Card**:
```
Name:            [full name]
Target title(s): [inferred from most recent role if not stated]
Seniority:       [junior / mid / senior / lead]
Top skills:      [top 8–10 tech + domain skills]
Industries:      [e.g. SaaS, fintech, logistics]
Experience:      [total years + per domain]
Location:        [city / remote / hybrid preference]
Education:       [degree, institution]
Avoid:           [any companies/roles to skip — ask if not stated]
Prioritize:      [any companies/roles to target — ask if not stated]
```

Ask user to confirm or correct before scanning. Also ask:
- Which job boards to scan (default: all four)
- Any specific roles, seniority levels, or salary range filters
- Remote-only, hybrid, or onsite preference

---

## PHASE 2 — Collect: Multi-Board Scan

Use **Claude in Chrome** to scan each enabled board. Run boards in sequence. For each board:

### 2a. Browser Setup
Use `list_connected_browsers` to connect. If no browser available: *"Please open Chrome with the Claude extension active, then let me know."*

---

### Wellfound (`wellfound.com/jobs`)
Best for: funded startups, Series A–C, tech roles.

```
1. navigate → https://wellfound.com/jobs
2. read_page → apply role + location filters
3. Scrape job cards: title, company, location, funding stage, team size, remote status, posted date
4. Open each promising listing → get_page_text → extract full JD + apply link
5. Target: 15–25 listings
```

Key signals to extract: funding stage, last raised, team size, equity offered.

---

### Indeed (`indeed.com`)
Best for: broadest coverage, established companies, non-tech roles.

```
1. navigate → https://www.indeed.com/jobs?q=[title]&l=[location]
2. Scrape listings: title, company, location, salary (if shown), posted date
3. Open each listing → get_page_text → extract full JD + apply method
4. Target: 15–25 listings
```

---

### Naukri (`naukri.com`)
Best for: Indian market, large enterprises, IT services.

```
1. navigate → https://www.naukri.com/[role]-jobs
2. Apply experience and location filters
3. Scrape: title, company, experience required, salary range, posted date
4. Open each → get_page_text → extract JD
5. Target: 15–20 listings
```

---

### LinkedIn Posts (Primary) + Jobs (Fallback)

**Posts search** (less competition — surfaces hiring manager announcements):
```
1. navigate → https://www.linkedin.com
2. Confirm logged in
3. Main search bar → run 3–5 keyword queries (see templates below)
4. Filter → Posts tab → Date: Past week
5. Scrape post cards: author, company, snippet, apply method
```

Query templates:
```
"we're hiring [job title]"
"looking for a [job title]"
"[job title] opening [location or remote]"
"join our team [key skill]"
"hiring [job title] [key skill] apply"
```

**Jobs tab fallback** (if Posts yields < 10 results):
```
navigate → https://www.linkedin.com/jobs
Search role + location → scrape listings → open each → get_page_text
```

---

## PHASE 3 — Schema: Extract Structured Data

For every collected listing, populate this schema:

```json
{
  "id": "[board]-[index]",
  "source": "wellfound | indeed | naukri | linkedin",
  "title": "",
  "company": "",
  "location": "",
  "remote": true/false,
  "salary_range": "",
  "posted_date": "",
  "apply_method": "email | portal | linkedin_dm | easy_apply",
  "apply_url": "",
  "jd_summary": "",
  "required_skills": [],
  "preferred_skills": [],
  "seniority": "",
  "funding_stage": "",
  "glassdoor_rating": null,
  "team_size": "",
  "equity_offered": true/false,
  "red_flags": []
}
```

**Red flag signals** (auto-detect and note):
- "contract only" / "C2C" without mention of conversion
- Vague scope ("various responsibilities")
- Extremely wide salary range (>2x spread)
- Posted > 30 days ago with no applications closed note
- Re-posted role (same title, same company, different date)

---

## PHASE 4 — Score: AI Relevance Ranking

Score each job 1–10 against the candidate profile:

| Factor | Weight |
|---|---|
| Title / role match | 25% |
| Skills overlap (required) | 30% |
| Skills overlap (preferred) | 10% |
| Seniority fit | 15% |
| Location / remote match | 10% |
| Industry relevance | 10% |

**Bonus signals** (+0.5 each, max +1.5):
- Funding stage matches growth preference
- Equity offered (if candidate values it)
- Posted within last 7 days
- Team size matches preference

**Penalty** (−1.0 per flag):
- Any red flag detected

Present a **ranked table** (top 20, sorted by score):

| # | Score | Title | Company | Source | Location | Salary | Apply via | Red flags |
|---|---|---|---|---|---|---|---|---|

Ask: **"Which of these would you like to apply to? You can pick multiple."**

---

## PHASE 5 — Enrich: Founder + Company Signals

For each job the user selects, enrich with:

### 5a. Founder / Hiring Manager LinkedIn
Use Chrome to search LinkedIn for the company's founders or the hiring manager who posted:

```
1. navigate → LinkedIn search → "[Company] founder" or "[Company] CEO"
2. read_page → find correct profile
3. Extract: name, title, LinkedIn URL, mutual connections count, recent activity
```

### 5b. Company Signals
Use `web_search` to gather:
- Recent funding news (last 6 months)
- Glassdoor / Blind ratings (search: `[company] glassdoor review`)
- Recent press / product launches
- Headcount growth (LinkedIn company page → "People" tab)
- Any controversy or layoff signals

### 5c. Enrich the Schema
Add to each selected job:
```json
{
  "founder_name": "",
  "founder_linkedin_url": "",
  "founder_mutual_connections": 0,
  "recent_funding_news": "",
  "glassdoor_rating": null,
  "blind_rating": null,
  "headcount_growth": "",
  "recent_press": ""
}
```

Present an **enrichment summary** per company before generating outreach.

---

## PHASE 6 — Outreach: Personalized Materials

For each selected + enriched job, generate all three materials in one pass:

### 6a. Tailored Resume
- Mirror exact JD keywords (ATS optimization)
- Rewrite summary to match this specific role
- Reorder bullet points: most relevant accomplishments first
- Quantify achievements; use `[X%]` placeholders if numbers unknown
- Output: full `.tex` or `.md` file labeled `[Company]_[Role]_Resume`

### 6b. Cover Letter
3–4 paragraphs:
1. **Hook**: Specific reason for THIS role at THIS company (reference enrichment data — funding, product, recent news)
2. **Value prop**: 2–3 concrete achievements mapped to JD requirements
3. **Cultural fit**: Something specific from enrichment (mission, growth stage, product angle)
4. **Close**: Confident, direct CTA

Tone must match company culture (startup casual vs. enterprise formal).

### 6c. LinkedIn Outreach Message
For the founder or hiring manager found in Phase 5:

Short, punchy DM (150 words max):
- Line 1: Specific hook — reference their recent post, funding round, or product launch
- Line 2: One concrete, relevant achievement from the resume
- Line 3: Clear ask — "Would love to chat about the [Role] opening"

**Personalization rules**:
- If mutual connections > 0: mention the mutual connection by name
- If they posted the job themselves: reference the post directly
- If recent funding: congratulate briefly, then pivot to value
- Never use: "I hope this message finds you well", "I am reaching out because", or any generic opener

Show all three materials to the user per company. Ask: **"Should I apply to this one?"**

---

## PHASE 7 — Apply + Save

### Apply Routes

**Route A — Email** (Gmail MCP):
- Subject: `Application for [Role] — [Name]`
- Body: 3-sentence intro + cover letter inline + resume attached
- Confirm → send

**Route B — Portal** (Chrome):
```
navigate → apply URL
read_page → map form fields
form_input → fill from tailored data
Pause → show user all filled fields
Wait for "submit" → click Submit
```

**Route C — LinkedIn DM** (Chrome):
```
navigate → founder/hiring manager profile
find → Message button
type → personalized DM from 6c
Pause → show user the draft
Wait for "send" → send
```

**Always wait for explicit confirmation before any submission.**

### Save to Google Drive (Google Drive MCP)
After each application (or in batch):

File naming:
```
[YYYY-MM-DD]_[Company]_[Role]_Resume.tex
[YYYY-MM-DD]_[Company]_[Role]_CoverLetter.md
[YYYY-MM-DD]_[Company]_[Role]_OutreachDM.md
```

Folder: `Hiring Radar / [Year] / [Month]`

Confirm folder structure with user before writing.

---

## Guidelines

- **Never fabricate.** No invented skills, roles, or achievements. Flag gaps honestly and suggest honest framing.
- **Always read the full JD** before generating materials — never rely on title alone.
- **ATS first.** Resume must use exact JD keywords.
- **Respect user's voice.** DMs and cover letters should sound human, not AI-generated.
- **Be proactive.** After each phase, suggest the next without waiting.
- **Label everything by company.** When running multiple jobs in parallel, prefix all output clearly.
- **Ask before sending.** All Gmail sends, form submissions, and DMs require explicit chat confirmation.

---

## Edge Cases

- **No Chrome connected**: Pause and ask user to connect the extension before resuming.
- **Board requires login** (LinkedIn, Naukri): Pause and ask user to log in, then resume.
- **Easy Apply (LinkedIn)**: Confirm all pre-filled fields before submitting — LinkedIn auto-populates but may be wrong.
- **Duplicate listings** (same role on multiple boards): Deduplicate by company + title; keep the version with the most data.
- **Expired listing**: Note "may be expired" in red flags; still generate materials if user wants to apply cold.
- **Career change**: Emphasize transferable skills; reframe past titles using target industry vocabulary.
- **No apply link** (post only): Default to LinkedIn DM route (Route C).
- **Naukri not relevant** (user is outside India or only wants global roles): Skip that board automatically.
