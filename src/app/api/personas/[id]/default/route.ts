import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// PATCH /api/personas/[id]/default — set this persona as the default
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify persona belongs to user
  const { data: persona } = await supabase
    .from("personas")
    .select("id, profile_id, user_profiles!inner(user_id)")
    .eq("id", id)
    .eq("user_profiles.user_id", user.id)
    .single();

  if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Unset current default, then set the new one (two steps to avoid unique index conflict)
  const { error: unsetErr } = await supabase
    .from("personas")
    .update({ is_default: false })
    .eq("profile_id", persona.profile_id)
    .eq("is_default", true);

  if (unsetErr) return NextResponse.json({ error: unsetErr.message }, { status: 500 });

  const { error: setErr } = await supabase
    .from("personas")
    .update({ is_default: true })
    .eq("id", id);

  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
