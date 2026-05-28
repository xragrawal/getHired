import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";
import { NextResponse } from "next/server";
import { z } from "zod";

const PersonaBody = z.object({
  name: z.string().min(1),
  desired_role: z.string().min(1),
  skills: z.array(z.string()).min(1),
  experience_years: z.number().int().min(0),
  seniority: z.enum(["Intern", "Junior", "Mid", "Senior", "Staff", "Principal"]),
  preferences: z.string().default(""),
});

function buildPersonaEmbedText(data: z.infer<typeof PersonaBody>): string {
  const parts = [
    `${data.desired_role}.`,
    `${data.seniority} level with ${data.experience_years} years of experience.`,
    `Skills: ${data.skills.join(", ")}.`,
  ];
  if (data.preferences) parts.push(data.preferences);
  return parts.join(" ");
}

// GET /api/personas — list all personas for the current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ personas: [] });

  const { data: personas, error } = await supabase
    .from("personas")
    .select("id, name, desired_role, skills, experience_years, seniority, preferences, is_default, created_at, updated_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ personas });
}

// POST /api/personas — create a new persona
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = PersonaBody.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // Upsert user_profiles row
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id" })
    .select("id")
    .single();

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  // Check if this will be the first persona (auto-set as default)
  const { count } = await supabase
    .from("personas")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id);

  const isFirst = (count ?? 0) === 0;

  // Generate embedding
  const embedding = await embedText(buildPersonaEmbedText(body.data));

  const { data: persona, error: personaErr } = await supabase
    .from("personas")
    .insert({
      profile_id: profile.id,
      ...body.data,
      embedding: `[${embedding.join(",")}]`,
      is_default: isFirst,
    })
    .select()
    .single();

  if (personaErr) return NextResponse.json({ error: personaErr.message }, { status: 500 });

  return NextResponse.json({ persona }, { status: 201 });
}
