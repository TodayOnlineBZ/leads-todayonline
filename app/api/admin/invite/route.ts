import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

export async function POST(request: NextRequest) {
  if (!(await requireMaster())) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Vul een naam en een geldig e-mailadres in." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: new URL("/wachtwoord", request.url).toString(),
  });
  if (error || !data.user) return NextResponse.json({ error: "Uitnodigen is niet gelukt. Bestaat dit account al?" }, { status: 400 });
  const { error: updateError } = await admin.from("profiles").update({ status: "active" }).eq("id", data.user.id);
  if (updateError) return NextResponse.json({ error: "De uitnodiging is verstuurd, maar activeren is niet gelukt." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
