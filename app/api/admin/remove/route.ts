import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

// Verwijdert de inlog. Het profiel blijft als "removed" bestaan, zodat leads en notities leesbaar blijven.
export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Deze gebruiker bestaat niet." }, { status: 404 });
  if (id === master.id || target.role === "master") return NextResponse.json({ error: "Een master-account kun je hier niet verwijderen." }, { status: 400 });
  const { error: updateError } = await admin.from("profiles").update({ status: "removed" }).eq("id", id);
  if (updateError) return NextResponse.json({ error: "Verwijderen is niet gelukt." }, { status: 500 });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: "De toegang is gestopt, maar de inlog kon niet worden verwijderd." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
