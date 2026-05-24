import { readdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel, getLLMConfig } from "../src/lib/llm/providers";
import type { LLMProvider, LLMConfig } from "../src/lib/llm/providers";
import type { LinkedInJobWithDetails } from "../src/lib/jobs/types";
import { OUTPUT_DIR, OUTPUT_PREFIX } from "./job-constants";

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseLLMArg(): LLMConfig {
  const base = getLLMConfig(); // reads from .env
  const flag = process.argv.find((a) => a.startsWith("--llm=") || a === "--llm");
  if (!flag) return base;

  const value =
    flag === "--llm"
      ? process.argv[process.argv.indexOf("--llm") + 1]
      : flag.slice("--llm=".length);

  if (!value) return base;

  const [providerRaw, ...modelParts] = value.split(":");
  const provider = providerRaw as LLMProvider;
  const model = modelParts.length ? modelParts.join(":") : base.model;

  return { ...base, provider, model };
}

// ─── Supabase (service role — no cookies needed in scripts) ───────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { realtime: { transport: ws } });
}

// ─── Dedup key ────────────────────────────────────────────────────────────────

function normalizeSegment(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildDedupKey(company: string, title: string, location: string): string {
  const city = location.split(",")[0] || "remote";
  return [company, title, city].map(normalizeSegment).join("@");
}

// ─── JD parse schema ──────────────────────────────────────────────────────────

const SENIORITY_VALUES = ["Intern", "Junior", "Mid", "Senior", "Staff", "Principal", "Lead"] as const;

const JDSchema = z.object({
  // .catch(null) tolerates unexpected values (e.g. "entry-level", "junior developer") from weaker models
  seniority_level: z
    .enum(SENIORITY_VALUES)
    .nullable()
    .catch(null),
  experience_min: z.number().int().nullable().catch(null),
  experience_max: z.number().int().nullable().catch(null),
  skills_required: z.array(z.string()).catch([]),
  skills_preferred: z.array(z.string()).catch([]),
  tech_stack: z.array(z.string()).catch([]),
  salary_min: z.number().nullable().catch(null),
  salary_max: z.number().nullable().catch(null),
  salary_currency: z.string().nullable().catch(null),
  responsibilities: z.array(z.string()).catch([]),
  benefits: z.array(z.string()).catch([]),
  visa_sponsorship: z.boolean().nullable().catch(null),
  summary: z.string().catch(""),
});

type JDParsed = z.infer<typeof JDSchema>;

const PARSE_PROMPT = (jdRaw: string) => `You are a structured data extractor. Extract information from the job description below and return ONLY a valid JSON object — no explanation, no markdown, no code fences.

JSON schema to follow:
{
  "seniority_level": "Intern" | "Junior" | "Mid" | "Senior" | "Staff" | "Principal" | "Lead" | null,
  "experience_min": number | null,
  "experience_max": number | null,
  "skills_required": string[],
  "skills_preferred": string[],
  "tech_stack": string[],
  "salary_min": number | null,
  "salary_max": number | null,
  "salary_currency": string | null,
  "responsibilities": string[],
  "benefits": string[],
  "visa_sponsorship": boolean | null,
  "summary": string
}

Rules:
- salary: convert to INR annual if possible; null if not mentioned
- skills/tech_stack: specific tools and technologies only, not soft skills
- summary: 1-2 sentences describing the role and company
- Return ONLY the JSON object, nothing else

Job Description:
${jdRaw}`;

async function parseJD(jdRaw: string, llmConfig: LLMConfig): Promise<JDParsed> {
  const model = getLanguageModel(llmConfig);
  const { object, rawResponse } = await generateObject({
    model,
    schema: JDSchema,
    mode: "json",
    prompt: PARSE_PROMPT(jdRaw),
  });

  if (process.env.LLM_DEBUG === "1") {
    console.log("\n[LLM raw response]");
    console.log(JSON.stringify(rawResponse, null, 2));
    console.log("[LLM parsed object]");
    console.log(JSON.stringify(object, null, 2));
    console.log();
  }

  return object;
}

// ─── Supabase upsert ──────────────────────────────────────────────────────────

async function upsertJob(
  supabase: ReturnType<typeof getSupabaseClient>,
  job: LinkedInJobWithDetails,
  parsed: JDParsed
) {
  const dedupKey = buildDedupKey(job.company, job.title, job.location);

  // 1. Upsert into jobs
  const { data: jobRow, error: jobErr } = await supabase
    .from("jobs")
    .upsert({ dedup_key: dedupKey, company: job.company, title: job.title }, { onConflict: "dedup_key" })
    .select("id")
    .single();

  if (jobErr) throw new Error(`jobs upsert failed: ${jobErr.message}`);

  // 2. Upsert into job_postings
  const { error: postingErr } = await supabase.from("job_postings").upsert(
    {
      job_id: jobRow.id,
      source: job.source,
      url: job.url,
      location: job.location,
      work_arrangement: job.details?.work_arrangement ?? "",
      employment_type: job.details?.employment_type ?? "",
      applicant_count: job.details?.applicant_count ?? "",
      is_accepting: job.details?.is_accepting ?? true,
      easy_apply: job.easy_apply,
      pass_type: job.pass_type,
      posted_date: job.posted_date,
      fetched_at: job.fetched_at,
      fetched_date: job.fetched_at ? job.fetched_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      seniority_level: parsed.seniority_level,
      experience_min: parsed.experience_min,
      experience_max: parsed.experience_max,
      skills_required: parsed.skills_required,
      skills_preferred: parsed.skills_preferred,
      tech_stack: parsed.tech_stack,
      salary_min: parsed.salary_min,
      salary_max: parsed.salary_max,
      salary_currency: parsed.salary_currency,
      jd_parsed: parsed,
      jd_parsed_at: new Date().toISOString(),
    },
    { onConflict: "source,url" }
  );

  if (postingErr) throw new Error(`job_postings upsert failed: ${postingErr.message}`);
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function findLatestOutputFile(): string | null {
  const dir = join(process.cwd(), OUTPUT_DIR);
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.startsWith(OUTPUT_PREFIX) && f.endsWith(".json"))
      .sort()
      .reverse();
  } catch {
    return null;
  }
  return files.length ? join(dir, files[0]) : null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m === 0 ? `${s}s` : `${m}m ${s % 60}s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const llmConfig = parseLLMArg();
  const supabase = getSupabaseClient();

  console.log(`\n🔍 JD Parser`);
  console.log(`   LLM      : ${llmConfig.provider} / ${llmConfig.model}`);

  const filePath = findLatestOutputFile();
  if (!filePath) {
    console.error(`   ❌ No output file found in ${OUTPUT_DIR}`);
    process.exit(1);
  }
  console.log(`   File     : ${filePath}\n`);

  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const jobs: LinkedInJobWithDetails[] = raw.jobs ?? [];
  const eligible = jobs.filter((j) => j.details?.jd_raw);

  console.log(`   Total jobs     : ${jobs.length}`);
  console.log(`   With JD        : ${eligible.length}`);
  console.log(`   Skipping (no JD): ${jobs.length - eligible.length}\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < eligible.length; i++) {
    const job = eligible[i];
    process.stdout.write(`   [${i + 1}/${eligible.length}] ${job.title} @ ${job.company} ... `);

    try {
      const parsed = await parseJD(job.details!.jd_raw, llmConfig);
      await upsertJob(supabase, job, parsed);
      console.log(`✅  (${parsed.seniority_level ?? "?"} | ${parsed.skills_required.slice(0, 3).join(", ")})`);
      success++;
    } catch (err) {
      console.log(`❌  ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  // Delete JSON only if all succeeded
  if (failed === 0) {
    unlinkSync(filePath);
    console.log(`\n   🗑  Deleted ${filePath}`);
  } else {
    console.log(`\n   ⚠️  Kept JSON (${failed} failures) — rerun to retry`);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ Complete`);
  console.log(`   Parsed & stored : ${success}`);
  console.log(`   Failed          : ${failed}`);
  console.log(`   Duration        : ${formatDuration(Date.now() - startTime)}`);
  console.log(`${"═".repeat(60)}\n`);
}

main().catch(console.error);
