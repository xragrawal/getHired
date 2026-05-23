import type { LinkedInJob } from "./types";

interface JobReference {
  kind: string;
  url: string;
  text: string;
}

/**
 * Parses raw LinkedIn job search results into structured job objects.
 * Extracts company + location from the raw text by matching job titles
 * (which appear twice consecutively in the scraped text).
 */
export function parseSearchResults(
  rawText: string,
  references: JobReference[],
  fetchedAt: string
): LinkedInJob[] {
  const jobRefs = references.filter((r) => r.kind === "job");
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  const jobs: LinkedInJob[] = [];

  for (const ref of jobRefs) {
    const jobId = ref.url.match(/\/jobs\/view\/(\d+)/)?.[1] ?? "";
    const title = ref.text.replace(/ with verification$/, "").trim();

    // Find the position of the title (appears twice consecutively in raw text)
    let titleIdx = -1;
    for (let i = 0; i < lines.length - 1; i++) {
      const clean = lines[i].replace(/ with verification$/, "").trim();
      const cleanNext = lines[i + 1].replace(/ with verification$/, "").trim();
      if (clean === title && cleanNext === title) {
        titleIdx = i;
        break;
      }
    }

    let company = "";
    let location = "";
    let postedDate = "";
    let easyApply = false;
    let promoted = false;
    let remote = false;

    if (titleIdx !== -1) {
      // Lines after the double-title: company, location, then flags
      const afterTitle = lines.slice(titleIdx + 2, titleIdx + 8);
      company = afterTitle[0] ?? "";
      location = afterTitle[1] ?? "";
      remote = /remote/i.test(location);

      for (const line of afterTitle.slice(2)) {
        if (/easy apply/i.test(line)) easyApply = true;
        if (/promoted/i.test(line)) promoted = true;
        if (/(\d+\s+(hour|day|week|month|year)s?\s+ago|just now)/i.test(line)) {
          postedDate = line;
        }
      }
    }

    if (!jobId || !title) continue;

    jobs.push({
      job_id: jobId,
      title,
      company,
      location,
      remote,
      easy_apply: easyApply,
      promoted,
      posted_date: postedDate,
      url: `https://www.linkedin.com/jobs/view/${jobId}/`,
      source: "linkedin",
      fetched_at: fetchedAt,
    });
  }

  return jobs;
}
