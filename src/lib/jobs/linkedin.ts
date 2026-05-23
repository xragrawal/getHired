import { MCPHttpClient } from "@/lib/mcp/http-client";
import { parseSearchResults } from "./parser";
import type { JobDetails, JobSearchParams, JobSearchResult } from "./types";

function getLinkedInMCPUrl(): string {
  const raw = process.env.MCP_SERVERS ?? "[]";
  try {
    const servers = JSON.parse(raw) as Array<{ name: string; url?: string }>;
    const li = servers.find((s) => s.name === "linkedin");
    if (li?.url) return li.url;
  } catch {
    // fall through
  }
  return "http://127.0.0.1:8080/mcp";
}

// Shared client — call initSharedClient() once per script run, then reuse
let _sharedClient: MCPHttpClient | null = null;

export async function initSharedClient(): Promise<MCPHttpClient> {
  if (!_sharedClient) {
    _sharedClient = new MCPHttpClient(getLinkedInMCPUrl());
    await _sharedClient.initialize();
  }
  return _sharedClient;
}

export async function searchLinkedInJobs(
  params: JobSearchParams,
  client?: MCPHttpClient
): Promise<JobSearchResult> {
  const c = client ?? new MCPHttpClient(getLinkedInMCPUrl());

  const result = await c.callTool("search_jobs", {
    keywords: params.keywords,
    ...(params.location ? { location: params.location } : {}),
    max_pages: params.max_pages ?? 1,
    ...(params.date_posted ? { date_posted: params.date_posted } : {}),
    ...(params.job_type ? { job_type: params.job_type } : {}),
    ...(params.experience_level ? { experience_level: params.experience_level } : {}),
    ...(params.work_type ? { work_type: params.work_type } : {}),
    ...(params.easy_apply !== undefined ? { easy_apply: params.easy_apply } : {}),
    ...(params.sort_by ? { sort_by: params.sort_by } : {}),
  });

  const searchUrl = (result.url as string) ?? "";
  const sections = result.sections as Record<string, string>;
  const rawText = sections?.search_results ?? "";
  const refs = (result.references as Record<string, unknown[]>)?.search_results ?? [];

  const jobs = parseSearchResults(
    rawText,
    refs as Array<{ kind: string; url: string; text: string }>,
    new Date().toISOString()
  );

  const countMatch = rawText.match(/([\d,]+)\s+results?/);
  const totalFound = countMatch ? parseInt(countMatch[1].replace(/,/g, ""), 10) : jobs.length;

  return { jobs, total_found: totalFound, search_url: searchUrl };
}

export async function getJobDetails(
  jobId: string,
  client?: MCPHttpClient
): Promise<JobDetails> {
  const c = client ?? new MCPHttpClient(getLinkedInMCPUrl());
  const result = await c.callTool("get_job_details", { job_id: jobId });

  const url = (result.url as string) ?? `https://www.linkedin.com/jobs/view/${jobId}/`;
  const sections = result.sections as Record<string, string>;
  const text = sections?.job_posting ?? "";

  const employmentMatch = text.match(/\b(Full-time|Part-time|Contract|Internship|Temporary|Volunteer)\b/i);
  const workMatch = text.match(/\b(Remote|On-site|Hybrid)\b/i);
  const applicantMatch = text.match(/(Over\s+)?([\d,]+)\s+applicants?/i);

  return {
    job_id: jobId,
    url,
    employment_type: employmentMatch?.[0] ?? "",
    work_arrangement: workMatch?.[0] ?? "",
    applicant_count: applicantMatch?.[0] ?? "",
    is_accepting: !/no longer accepting applications/i.test(text),
    jd_raw: text,
    detail_fetched_at: new Date().toISOString(),
  };
}
