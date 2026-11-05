import { NextResponse, type NextRequest } from "next/server";
import type { Values } from "@/lib/domain";
import { createDraftEstimate, findOrCreateContact, moneybirdReady } from "@/lib/moneybird";
import { isLive, proposalBaseUrl } from "@/lib/proposalRoute";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const DAY = 86_400_000;

// Maakt alleen een concept: dit endpoint verstuurt nooit iets naar een klant.
export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return fail(403, "Geen toegang.");
  if (!moneybirdReady()) return fail(400, "De Moneybird-gegevens ontbreken nog in Vercel.");
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data: p } = await admin.from("proposals")
    .select("id, lead_id, slug, status, price_cents, discount_percent, final_cents, expires_at, disabled_at, finalized_at, moneybird_status, moneybird_url, lead:leads(values)")
    .eq("id", String(body.id ?? "")).maybeSingle();
  if (!p) return fail(404, "Voorstel niet gevonden.");
  if (p.moneybird_status === "draft") return NextResponse.json({ ok: true, url: p.moneybird_url, existing: true });
  if (!p.finalized_at) return fail(400, "Maak dit voorstel eerst definitief.");
  if (!isLive(p)) return fail(400, "Deze link is verlopen of staat uit. Verleng het voorstel eerst.");
  const values = (p.lead as unknown as { values: Values }).values;
  const company = (values.organisatie ?? "").trim();
  const email = (values.email ?? "").trim();
  if (!company) return fail(400, "De naam van de organisatie ontbreekt. Vul die in bij Bedrijfsinfo.");
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) return fail(400, "Het e-mailadres van dit bedrijf ontbreekt of klopt niet. Vul het in bij Bedrijfsinfo.");

  // Eén aanvraag tegelijk: een tweede klik krijgt deze rij niet te pakken. Een vastgelopen poging vervalt na 5 minuten.
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: claimed } = await admin.from("proposals").update({ moneybird_status: "creating", moneybird_started_at: new Date().toISOString() })
    .eq("id", p.id).or(`moneybird_status.is.null,and(moneybird_status.eq.creating,moneybird_started_at.lt.${stale})`).select("id");
  if (!claimed?.length) return fail(409, "Dit concept wordt al gemaakt.");

  try {
    const contact = await findOrCreateContact(values, email);
    const dueDays = Math.max(1, Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / DAY));
    const estimate = await createDraftEstimate({ contactId: contact.id, company, priceCents: Number(p.price_cents), discountPercent: Number(p.discount_percent), dueDays, documentUrl: `${proposalBaseUrl(request)}/${p.slug}/toelichting` });
    await admin.from("proposals").update({ moneybird_status: "draft", moneybird_estimate_id: estimate.id, moneybird_url: estimate.url }).eq("id", p.id);
    const { data: profile } = await admin.from("profiles").select("name").eq("id", master.id).maybeSingle();
    await admin.from("lead_proposal_events").insert({ lead_id: p.lead_id, proposal_id: p.id, kind: "moneybird_draft", price_cents: p.price_cents, final_cents: p.final_cents, actor_name: profile?.name ?? "Onbekend" });
    return NextResponse.json({ ok: true, url: estimate.url, createdContact: contact.created, warning: contact.warning });
  } catch (e) {
    await admin.from("proposals").update({ moneybird_status: null, moneybird_started_at: null }).eq("id", p.id);
    const timeout = e instanceof Error && e.name === "TimeoutError";
    console.error("Moneybird-concept mislukt:", e instanceof Error ? e.message : e);
    return fail(502, timeout ? "Moneybird reageerde niet op tijd. Controleer in Moneybird of er toch een concept staat voordat je het opnieuw probeert." : e instanceof Error ? e.message : "Het concept kon niet worden gemaakt.");
  }
}
