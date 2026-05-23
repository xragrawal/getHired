import { searchLinkedInJobs } from "@/lib/jobs/linkedin";
import type { JobSearchParams } from "@/lib/jobs/types";

export async function POST(req: Request) {
  let params: JobSearchParams;
  try {
    params = (await req.json()) as JobSearchParams;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!params.keywords?.trim()) {
    return Response.json({ error: "keywords is required" }, { status: 400 });
  }

  try {
    const result = await searchLinkedInJobs(params);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[jobs/search]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
