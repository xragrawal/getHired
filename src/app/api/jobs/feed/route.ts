import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/jobs/feed?persona=<id>
// If persona param omitted, uses the default persona.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const personaId = searchParams.get("persona");

  // Resolve persona
  let personaQuery = supabase
    .from("personas")
    .select("id, name, embedding, user_profiles!inner(user_id)")
    .eq("user_profiles.user_id", user.id);

  if (personaId) {
    personaQuery = personaQuery.eq("id", personaId);
  } else {
    personaQuery = personaQuery.eq("is_default", true);
  }

  const { data: persona } = await personaQuery.single();

  if (!persona) {
    return NextResponse.json({ error: "No persona found. Please complete onboarding." }, { status: 404 });
  }

  if (!persona.embedding) {
    return NextResponse.json({ error: "Persona has no embedding yet." }, { status: 422 });
  }

  // pgvector similarity query
  const { data: jobs, error } = await supabase.rpc("match_jobs_for_persona", {
    persona_embedding: persona.embedding,
    match_limit: 50,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    persona: { id: persona.id, name: persona.name },
    jobs,
  });
}
