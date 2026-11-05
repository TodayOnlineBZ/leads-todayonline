import { randomBytes } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import type { Values } from "@/lib/domain";
import { costUsd, generateConcept, generateDocument, generateMvp, QUALITY, type Quality, siteNotes } from "@/lib/proposalAi";
import { readSite } from "@/lib/siteContent";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

export const maxDuration = 300;
const DAY = 86_400_000;
const VALID_DAYS = 14;
const DISCOUNT_PERCENT = 10;
const slugify = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "voorstel";

async function step<T>(name: string, run: () => Promise<T>) {
  try {
    return await run();
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new Error(`${name}: ${timeout ? "Claude deed er te lang over." : e instanceof Error ? e.message : "onbekende fout."}`);
  }
}

export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const priceCents = Number(body.priceCents);
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return NextResponse.json({ error: "Vul een geldige prijs in." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "De Claude API-sleutel ontbreekt nog in Vercel." }, { status: 400 });
  const quality = (body.quality in QUALITY ? body.quality : "standaard") as Quality;
  const admin = createAdminClient();
  const { data: lead } = await admin.from("leads").select("id, values, archived_at").eq("id", String(body.leadId ?? "")).maybeSingle();
  if (!lead || lead.archived_at) return NextResponse.json({ error: "Deze lead bestaat niet of is teruggezet." }, { status: 404 });
  const values = lead.values as Values;
  // Een lopende generatie kost al tegoed: start er niet per ongeluk een tweede.
  const { data: running } = await admin.from("proposals").select("id").eq("lead_id", lead.id).eq("status", "generating").gt("created_at", new Date(Date.now() - 6 * 60_000).toISOString()).limit(1);
  if (running?.length) return NextResponse.json({ error: "Er wordt al een voorstel gemaakt voor deze lead." }, { status: 409 });
  const { data: proposal, error } = await admin.from("proposals").insert({
    lead_id: lead.id,
    slug: `${slugify(values.organisatie ?? "")}-${randomBytes(8).toString("hex")}`,
    price_cents: priceCents,
    discount_percent: DISCOUNT_PERCENT,
    quality,
    final_cents: Math.round((priceCents * (100 - DISCOUNT_PERCENT)) / 100),
    expires_at: new Date(Date.now() + VALID_DAYS * DAY).toISOString(),
    created_by: master.id,
  }).select("id").single();
  if (error || !proposal) return NextResponse.json({ error: "Het voorstel kon niet worden gestart." }, { status: 500 });

  after(async () => {
    try {
      // Eerst de korte tekst: mislukt die, dan is er geen tegoed aan de dure MVP besteed.
      const site = await readSite(values.site);
      // De korte stappen lopen tegelijk, zodat de MVP genoeg van de tijdslimiet overhoudt.
      const [doc, concept] = await Promise.all([
        step("Uitwerking", () => generateDocument(values, site)),
        QUALITY[quality].concept ? generateConcept(values, site).catch((e) => { console.error("Ontwerpconcept mislukt:", e instanceof Error ? e.message : e); return null; }) : null,
      ]);
      const mvp = await step("MVP", () => generateMvp(values, site, quality, concept?.text ?? null));
      doc.document.open_punten = [...siteNotes(site, mvp.html), ...doc.document.open_punten];
      await admin.from("proposals").update({
        status: "ready", mvp_html: mvp.html, document: doc.document, error: null,
        input_tokens: (mvp.usage.input_tokens ?? 0) + (doc.usage.input_tokens ?? 0) + (concept?.usage.input_tokens ?? 0),
        output_tokens: (mvp.usage.output_tokens ?? 0) + (doc.usage.output_tokens ?? 0) + (concept?.usage.output_tokens ?? 0),
        cost_usd: costUsd(quality, mvp.usage, doc.usage, concept?.usage),
      }).eq("id", proposal.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Onbekende fout.";
      console.error("Voorstel mislukt:", message);
      await admin.from("proposals").update({ status: "failed", error: message.slice(0, 300) }).eq("id", proposal.id);
    }
  });
  return NextResponse.json({ ok: true, id: proposal.id });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireMaster())) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const id = String(body.id ?? "");
  let change: Record<string, unknown> | null = null;
  if (body.action === "extend") change = { expires_at: new Date(Date.now() + VALID_DAYS * DAY).toISOString(), disabled_at: null };
  if (body.action === "disable") change = { disabled_at: new Date().toISOString() };
  if (!change) return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
  const { error } = await admin.from("proposals").update(change).eq("id", id);
  return error ? NextResponse.json({ error: "Dat is niet gelukt." }, { status: 500 }) : NextResponse.json({ ok: true });
}
