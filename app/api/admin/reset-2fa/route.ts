import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

// Voor een medewerker die de telefoon kwijt is. Bij de volgende keer inloggen stelt die 2FA opnieuw in.
export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Deze gebruiker bestaat niet." }, { status: 404 });
  if (id === master.id || target.role === "master") return NextResponse.json({ error: "De 2FA van een master-account reset je hier niet." }, { status: 400 });
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: id });
  if (error || !data) return NextResponse.json({ error: "De 2FA kon niet worden opgehaald." }, { status: 500 });
  for (const factor of data.factors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id });
    if (deleteError) return NextResponse.json({ error: "Resetten is niet gelukt." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: data.factors.length });
}
