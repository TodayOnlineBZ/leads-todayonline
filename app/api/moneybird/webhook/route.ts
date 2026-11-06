import { NextResponse, type NextRequest } from "next/server";
import { administrationId, moneybirdReady } from "@/lib/moneybird";
import { syncEstimate } from "@/lib/moneybirdSync";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
const ok = () => NextResponse.json({ ok: true });

// Moneybird meldt hier wijzigingen aan offertes. Moneybird test dit adres bij het aanmelden met een lege melding.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || body.entity_type !== "Estimate" || !body.entity_id || !moneybirdReady()) return ok();
  if (String(body.administration_id ?? "") !== administrationId) return ok();
  const admin = createAdminClient();
  const { data: hooks } = await admin.from("moneybird_webhooks").select("token");
  if (!(hooks ?? []).some((h) => h.token && h.token === body.webhook_token)) return ok();
  const { data: p } = await admin.from("proposals").select("id").eq("moneybird_estimate_id", String(body.entity_id)).maybeSingle();
  if (!p) return ok();
  try {
    await syncEstimate(admin, p.id, String(body.entity_id));
    return ok();
  } catch (e) {
    console.error("Moneybird-melding niet verwerkt:", e instanceof Error ? e.message : e);
    // Een andere status dan 200 laat Moneybird het later opnieuw proberen.
    return NextResponse.json({ error: "later opnieuw" }, { status: 503 });
  }
}
