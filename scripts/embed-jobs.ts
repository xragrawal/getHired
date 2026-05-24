import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { embedTexts, EMBEDDING_MODEL, EMBEDDING_DIM } from "../src/lib/embeddings";

const BATCH_SIZE = 100;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { realtime: { transport: ws } });
}

function buildEmbedText(job: {
  title: string;
  company: string;
  seniority_level: string | null;
  employment_type: string | null;
  work_arrangement: string | null;
  skills_required: string[] | null;
  tech_stack: string[] | null;
  jd_parsed: { summary?: string } | null;
}): string {
  const parts: string[] = [];
  parts.push(`${job.title} at ${job.company}.`);
  if (job.seniority_level)       parts.push(`${job.seniority_level} level.`);
  if (job.employment_type)       parts.push(`${job.employment_type}.`);
  if (job.work_arrangement)      parts.push(`${job.work_arrangement}.`);
  if (job.skills_required?.length)
    parts.push(`Required skills: ${job.skills_required.join(", ")}.`);
  if (job.tech_stack?.length)
    parts.push(`Tech stack: ${job.tech_stack.join(", ")}.`);
  if (job.jd_parsed?.summary)    parts.push(job.jd_parsed.summary);
  return parts.join(" ");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m === 0 ? `${s}s` : `${m}m ${s % 60}s`;
}

async function main() {
  const startTime = Date.now();
  const supabase = getSupabaseClient();

  console.log(`\n🔢 Job Embedder`);
  console.log(`   Model : ${EMBEDDING_MODEL} (${EMBEDDING_DIM} dims)\n`);

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select(`
      id,
      title:job_id ( title ),
      company:job_id ( company ),
      seniority_level,
      employment_type,
      work_arrangement,
      skills_required,
      tech_stack,
      jd_parsed
    `)
    .not("jd_parsed_at", "is", null)
    .is("embedding", null);

  if (error) throw new Error(`Failed to fetch jobs: ${error.message}`);
  if (!jobs || jobs.length === 0) {
    console.log("   ✅ Nothing to embed — all parsed jobs already have embeddings.\n");
    return;
  }

  type RawJob = typeof jobs[0] & {
    title: { title: string } | null;
    company: { company: string } | null;
  };

  const rows = (jobs as RawJob[]).map((j) => ({
    id: j.id as string,
    title: (j.title as { title: string } | null)?.title ?? "",
    company: (j.company as { company: string } | null)?.company ?? "",
    seniority_level: j.seniority_level as string | null,
    employment_type: j.employment_type as string | null,
    work_arrangement: j.work_arrangement as string | null,
    skills_required: j.skills_required as string[] | null,
    tech_stack: j.tech_stack as string[] | null,
    jd_parsed: j.jd_parsed as { summary?: string } | null,
  }));

  console.log(`   Jobs to embed : ${rows.length}`);
  console.log(`   Batch size    : ${BATCH_SIZE}`);
  console.log(`   Batches       : ${Math.ceil(rows.length / BATCH_SIZE)}\n`);

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    process.stdout.write(`   Batch [${batchNum}/${totalBatches}] (${batch.length} jobs) ... `);

    try {
      const texts = batch.map(buildEmbedText);
      const embeddings = await embedTexts(texts);

      for (let j = 0; j < batch.length; j++) {
        const { error: updateError } = await supabase
          .from("job_postings")
          .update({ embedding: `[${embeddings[j].join(",")}]` as unknown as string })
          .eq("id", batch[j].id);

        if (updateError) {
          console.error(`\n   ❌ Failed to update ${batch[j].id}: ${updateError.message}`);
          failed++;
        } else {
          embedded++;
        }
      }

      console.log(`✅`);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`);
      failed += batch.length;
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ Complete`);
  console.log(`   Embedded : ${embedded}`);
  console.log(`   Failed   : ${failed}`);
  console.log(`   Duration : ${formatDuration(Date.now() - startTime)}`);
  console.log(`${"═".repeat(60)}\n`);
}

main().catch(console.error);
