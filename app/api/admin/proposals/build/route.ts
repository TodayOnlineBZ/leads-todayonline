import { strToU8, zipSync } from "fflate";
import { NextResponse, type NextRequest } from "next/server";
import type { Values } from "@/lib/domain";
import type { ProposalDocument } from "@/lib/proposalAi";
import { briefing, buildPrompt2, fileSlug, missingItems, photoUrls } from "@/lib/proposalBuild";
import { documentPage } from "@/lib/proposalPages";
import { proposalBaseUrl } from "@/lib/proposalRoute";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await requireMaster())) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const admin = createAdminClient();
  const { data: p } = await admin.from("proposals")
    .select("id, lead_id, slug, price_cents, discount_percent, final_cents, created_at, expires_at, finalized_at, mvp_html, document, moneybird_url, current_mvp_version_id, current_document_version_id, lead:leads(values, sale_status)")
    .eq("id", request.nextUrl.searchParams.get("proposal") ?? "").maybeSingle();
  if (!p || !p.finalized_at || !p.mvp_html || !p.document) return NextResponse.json({ error: "Alleen een definitief voorstel heeft een bouwpakket." }, { status: 404 });
  const lead = p.lead as unknown as { values: Values; sale_status: string };
  const prompt = buildPrompt2(lead.values, missingItems(lead.values));
  if (request.nextUrl.searchParams.get("format") === "prompt") return new Response(prompt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const { data: notes } = await admin.from("lead_notes").select("author_name, body, created_at").eq("lead_id", p.lead_id);
  const eur = (cents: number) => `€ ${(Number(cents) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`;
  const photos = photoUrls(p.mvp_html);
  const origin = request.nextUrl.origin;
  const doc = documentPage({ values: lead.values, document: p.document as ProposalDocument, priceCents: Number(p.price_cents), discountPercent: Number(p.discount_percent), finalCents: Number(p.final_cents), createdAt: p.created_at, expiresAt: p.expires_at, mvpUrl: `${proposalBaseUrl(request)}/${p.slug}` }).replaceAll('src="/voorstel/', `src="${origin}/voorstel/`);
  const files: Record<string, string> = {
    "LEESMIJ.md": [`# Bouwpakket ${lead.values.organisatie}`, "", `Gemaakt op: ${new Date().toISOString().slice(0, 10)}`, `Definitief voorstel: ${p.finalized_at.slice(0, 10)}`, `MVP-versie: ${p.current_mvp_version_id ?? "eerste versie"}`, `Uitwerking-versie: ${p.current_document_version_id ?? "eerste versie"}`, "Herkomst: leadsysteem TodayOnline. Dit pakket is intern en bevat klantgegevens.", "", "- mvp.html: de goedgekeurde richting", "- uitwerking.html: de toelichting voor de klant", "- briefing.md: bedrijfsinfo, antwoorden en notities", "- offerte.md: bedragen, status en Moneybird-link", "- fotos.md: gebruikte foto's met hun oorspronkelijke adres", "- doorbouwprompt.md: de opdracht om de site verder te bouwen", ""].join("\n"),
    "mvp.html": p.mvp_html,
    "uitwerking.html": doc,
    "briefing.md": briefing(lead.values, notes ?? []),
    "offerte.md": ["# Offerte", "", `- Prijs vóór korting: ${eur(p.price_cents)} exclusief btw`, `- Korting: ${Number(p.discount_percent)}%`, `- Totaal: ${eur(p.final_cents)} exclusief btw`, `- Verkoopstatus: ${lead.sale_status}`, `- Moneybird: ${p.moneybird_url ?? "nog geen concept"}`, ""].join("\n"),
    "fotos.md": ["# Foto's in de MVP", "", "Controleer de rechten voordat een foto op de echte site komt.", "", ...(photos.length ? photos.map((u) => `- ${u}`) : ["Geen externe foto's gevonden."]), ""].join("\n"),
    "doorbouwprompt.md": prompt + "\n",
  };
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
  return new Response(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="bouwpakket-${fileSlug(lead.values.organisatie)}.zip"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
