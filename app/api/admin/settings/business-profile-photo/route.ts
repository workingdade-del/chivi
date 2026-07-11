import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getBusinessProfilePhotoUrl, updateBusinessProfilePhoto } from "@/lib/whatsapp";

export async function GET() {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const photoUrl = await getBusinessProfilePhotoUrl();
  return NextResponse.json({ photoUrl });
}

export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await updateBusinessProfilePhoto(buffer, file.type || "image/jpeg");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de la mise à jour" },
      { status: 502 }
    );
  }

  return NextResponse.json({ updated: true });
}
