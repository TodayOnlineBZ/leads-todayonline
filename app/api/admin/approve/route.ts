import { NextResponse, type NextRequest } from "next/server";
import { sendApprovedEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

export async function POST(request: NextRequest) {
  if (!(await requireMaster())) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  // Alleen een wachtend account: zo krijgt niemand per ongeluk een tweede mail.
  const { data, error } = await createAdminClient().from("profiles").update({ status: "active" })
    .eq("id", id).eq("status", "pending").select("name, email");
  if (error) return NextResponse.json({ error: "Goedkeuren is niet gelukt." }, { status: 500 });
  const profile = data?.[0];
  if (!profile) return NextResponse.json({ error: "Dit account wacht niet meer op goedkeuring." }, { status: 409 });
  const emailSent = await sendApprovedEmail(profile.email, profile.name);
  return NextResponse.json({ ok: true, emailSent });
}
