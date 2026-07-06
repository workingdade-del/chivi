import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim();

  if (!reason) {
    return NextResponse.json({ error: "La raison de la pause est requise" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("system_settings")
    .update({
      is_paused: true,
      pause_reason: reason,
      paused_at: new Date().toISOString(),
      paused_by: user.id,
    })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ paused: true });
}
