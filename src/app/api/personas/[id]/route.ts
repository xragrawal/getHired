import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";
import { NextResponse } from "next/server";
import { z } from "zod";

const PersonaUpdate = z.object({
  name: z.string().min(1).optional(),
  desired_role: z.string().min(1).optional(),
  skills: z.array(z.string()).min(1).optional(),
  experience_years: z.number().int().min(0).optional(),
  seniority: z.enum(["Intern", "Junior", "Mid", "Senior", "Staff", "Principal"]).optional(),
  preferences: z.string().optional(),
});

function buildPersonaEmbedText(data: {
  desired_role: string;
  seniority: string;
  experience_years: number;
  skills: string[];
  preferences: string;
}): string {
  const parts = [
    `${data.desired_role}.`,
    `${data.seniority} level with ${data.experience_years} years of experience.`,
    `Skills: ${data.skills.join(", ")}.`,
  ];
  if (data.preferences) parts.push(data.preferences);
  return parts.join(" ");
}

async function getPersonaForUser(supabase: Awaited<ReturnType<typeof createClient>>, personaId: string, userId: string) {
  const { data } = await supabase
    .from("personas")
    .select("*, user_profiles!inner(user_id)")
    .eq("id", personaId)
    .eq("user_profiles.user_id", userId)
    .single();
  return data;
}

// PATCH /api/personas/[id] — update persona fields + re-embed
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await getPersonaForUser(supabase, id, user.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = PersonaUpdate.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const merged = {
    desired_role: body.data.desired_role ?? existing.desired_role,
    seniority: body.data.seniority ?? existing.seniority,
    experience_years: body.data.experience_years ?? existing.experience_years,
    skills: body.data.skills ?? existing.skills,
    preferences: body.data.preferences ?? existing.preferences,
  };

  const embedding = await embedText(buildPersonaEmbedText(merged));

  const { data: persona, error } = await supabase
    .from("personas")
    .update({
      ...body.data,
      embedding: `[${embedding.join(",")}]`,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ persona });
}

// DELETE /api/personas/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await getPersonaForUser(supabase, id, user.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.is_default) {
    return NextResponse.json({ error: "Cannot delete the default persona. Set another as default first." }, { status: 400 });
  }

  const { error } = await supabase.from("personas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
