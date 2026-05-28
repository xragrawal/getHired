import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { getUILanguageModel } from "@/lib/llm/providers";
import { z } from "zod";

const ResumeSchema = z.object({
  desired_role: z.string().describe("The job role the candidate is targeting, inferred from their experience and skills"),
  skills: z.array(z.string()).describe("Technical and domain skills extracted from the resume"),
  experience_years: z.number().int().min(0).describe("Total years of professional experience"),
  seniority: z.enum(["Intern", "Junior", "Mid", "Senior", "Staff", "Principal"]).describe("Seniority level inferred from years of experience and roles held"),
  preferences: z.string().describe("Work preferences inferred from resume: location, work arrangement, company type, etc. Empty string if none apparent."),
});

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Import from lib path to skip pdf-parse v1's test-file side-effect on module load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js" as any);
  const { text } = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer);

  if (!text?.trim()) {
    return NextResponse.json({ error: "Could not extract text from PDF. Ensure it is a text-based (not scanned) PDF." }, { status: 422 });
  }

  const { object } = await generateObject({
    model: getUILanguageModel(),
    schema: ResumeSchema,
    prompt: `Extract structured information from the following resume text. Be precise with skills — list individual technologies, languages, and tools, not broad categories.\n\n---\n${text.slice(0, 12000)}`,
  });

  return NextResponse.json(object);
}
