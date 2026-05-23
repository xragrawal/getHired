import { initSharedClient, searchLinkedInJobs, getJobDetails } from "../src/lib/jobs/linkedin";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  KEYWORDS,
  ACTIVE_GROUPS,
  PASSES,
  REMOTE_LOCATION_ALLOWLIST,
  OUTPUT_DIR,
  OUTPUT_PREFIX,
} from "./job-constants";
import type { LinkedInJobWithDetails } from "../src/lib/jobs/types";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60}s`;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Rewrites the output file with current accumulated state.
// Called after every keyword so the file is always up-to-date.
function flush(outFile: string, startTime: number, jobs: LinkedInJobWithDetails[]) {
  const localCount = jobs.filter((j) => j.pass_type === "local").length;
  const remoteCount = jobs.filter((j) => j.pass_type === "remote").length;
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        fetched_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        status: "in_progress",
        passes: {
          local: { location: PASSES.local.baseParams.location, count: localCount },
          // remote: { location: PASSES.remote.baseParams.location, count: remoteCount },
        },
        total_unique_jobs: jobs.length,
        still_accepting: jobs.filter((j) => j.details?.is_accepting !== false).length,
        closed: jobs.filter((j) => j.details?.is_accepting === false).length,
        jobs,
      },
      null,
      2
    )
  );
}

async function main() {
  const startTime = Date.now();
  const outputDir = join(process.cwd(), OUTPUT_DIR);
  mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outFile = join(outputDir, `${OUTPUT_PREFIX}-${timestamp}.json`);

  const seen = new Set<string>();
  const allJobs: LinkedInJobWithDetails[] = [];
  const allKeywords = ACTIVE_GROUPS.flatMap((g) => KEYWORDS[g]);
  const client = await initSharedClient();

  console.log(`\n🚀 Starting job fetch`);
  console.log(`   Keywords : ${allKeywords.length} (groups: ${ACTIVE_GROUPS.join(", ")})`);
  console.log(`   Passes   : ${Object.keys(PASSES).join(", ")}`);
  console.log(`   Output   : ${outFile}\n`);

  for (const [passKey, pass] of Object.entries(PASSES) as [keyof typeof PASSES, typeof PASSES[keyof typeof PASSES]][]) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📍 Pass: ${pass.label}`);
    console.log(`${"─".repeat(60)}`);

    for (const keyword of allKeywords) {
      console.log(`\n  🔍 "${keyword}"...`);

      // Step 1 — search
      let fresh: typeof allJobs[0][] = [];
      try {
        const result = await searchLinkedInJobs(
          { keywords: keyword, ...pass.baseParams },
          client
        );

        let newJobs = result.jobs.filter((j) => !seen.has(j.job_id));

        // if (passKey === "remote") {
        //   const before = newJobs.length;
        //   newJobs = newJobs.filter(
        //     (j) => REMOTE_LOCATION_ALLOWLIST.test(j.location) || j.location === ""
        //   );
        //   const dropped = before - newJobs.length;
        //   if (dropped > 0) console.log(`     ⚠️  Dropped ${dropped} non-India remote listings`);
        // }

        newJobs.forEach((j) => seen.add(j.job_id));
        fresh = newJobs.map((j) => ({ ...j, pass_type: passKey, details: null }));
        console.log(`     ✅ ${fresh.length} new  |  ${result.total_found} total on LinkedIn`);
      } catch (err) {
        console.error(`     ❌ Search failed: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      if (fresh.length === 0) continue;

      // Step 2 — fetch details for this keyword's jobs immediately
      console.log(`     🔎 Fetching details...`);
      for (let i = 0; i < fresh.length; i++) {
        const job = fresh[i];
        process.stdout.write(`        [${i + 1}/${fresh.length}] ${job.title} @ ${job.company} ... `);
        try {
          const details = await getJobDetails(job.job_id, client);
          fresh[i] = { ...job, details };
          console.log(`${details.is_accepting ? "✅" : "🚫 closed"}  ${details.applicant_count}`);
        } catch (err) {
          console.log(`❌ ${err instanceof Error ? err.message : err}`);
        }
        if (i < fresh.length - 1) await delay(500);
      }

      // Step 3 — write to file immediately after this keyword is done
      allJobs.push(...fresh);
      flush(outFile, startTime, allJobs);
      console.log(`     💾 Saved (${allJobs.length} total so far)`);
    }
  }

  // Final write — mark as complete
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        fetched_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        status: "complete",
        passes: {
          local: { location: PASSES.local.baseParams.location, count: allJobs.filter((j) => j.pass_type === "local").length },
          // remote: { location: PASSES.remote.baseParams.location, count: allJobs.filter((j) => j.pass_type === "remote").length },
        },
        total_unique_jobs: allJobs.length,
        still_accepting: allJobs.filter((j) => j.details?.is_accepting !== false).length,
        closed: allJobs.filter((j) => j.details?.is_accepting === false).length,
        jobs: allJobs,
      },
      null,
      2
    )
  );

  const localCount = allJobs.filter((j) => j.pass_type === "local").length;
  const remoteCount = allJobs.filter((j) => j.pass_type === "remote").length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ Complete`);
  console.log(`   Local jobs     : ${localCount}`);
  console.log(`   Remote jobs    : ${remoteCount}`);
  console.log(`   Total unique   : ${allJobs.length}`);
  console.log(`   Still accepting: ${allJobs.filter((j) => j.details?.is_accepting !== false).length}`);
  console.log(`   Closed         : ${allJobs.filter((j) => j.details?.is_accepting === false).length}`);
  console.log(`   Output         : ${outFile}`);
  console.log(`   ⏱  Duration   : ${formatDuration(Date.now() - startTime)}`);
  console.log(`${"═".repeat(60)}\n`);
}

main().catch(console.error);
