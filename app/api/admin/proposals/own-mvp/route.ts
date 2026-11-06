import { randomBytes } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import type { Values } from "@/lib/domain";
import { loadUploads, mergeUploads } from "@/lib/leadFiles";
import { generateDocument, partCost, QUALITY } from "@/lib/proposalAi";
import { fileSlug } from "@/lib/proposalBuild";
import { proposalBaseUrl } from "@/lib/proposalRoute";
import { readSite } from "@/lib/siteContent";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

export const maxDuration = 300;
const MAX_BYTES = 4_100_000;
const DAY = 86_400_000;
const LOCKED = "Dit voorstel ligt vast. Maak eerst een nieuw voorstel.";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

function warningsFor(html: string) {
  const out: string[] = [];
  if (/window\.claude|claude\.use\(/.test(html)) out.push("Dit bestand gebruikt functies van Claude, zoals opslag of gegevens. Die werken buiten Claude niet.");
  if (/\b(?:src|href)=["'](?!https?:|data:|#|mailto:|tel:|__TODAYONLINE|javascript:)[^"']+\.(?:css|js|png|jpe?g|webp|gif|svg|woff2?)["']/i.test(html)) out.push("Dit bestand verwijst naar losse bestanden die niet zijn meegeüpload. Controleer of alles goed laadt.");
  if (/<script[^>]+src=["']https?:\/\/(?!cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|cdn\.tailwindcss\.com|code\.jquery\.com)/i.test(html)) out.push("Dit bestand laadt een script van een andere website. Dat wordt geblokkeerd, dus controleer of alles werkt.");
  return out;
}

// Zet een eigen HTML-bestand als MVP, bij een bestaand of een nieuw voorstel. Er gaat niets naar de klant.
export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return fail(403, "Geen toegang.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return fail(413, "De pagina is groter dan 4 MB.");
  if (!/<html[\s>]|<!doctype html/i.test(raw)) return fail(400, "Dit lijkt geen volledige webpagina.");
  const q = request.nextUrl.searchParams;
  const fileName = (q.get("name") ?? "eigen bestand").slice(0, 150);
  const admin = createAdminClient();
  const base = proposalBaseUrl(request);
  const { data: profile } = await admin.from("profiles").select("name").eq("id", master.id).maybeSingle();
  const actor = profile?.name ?? "Onbekend";
  const fill = (slug: string) => raw.split("__TODAYONLINE_BESTAND__").join(`${base}/${slug}/bestand`);
  const notes = warningsFor(raw);

  const proposalId = q.get("id");
  if (proposalId) {
    const { data: p } = await admin.from("proposals").select("id, lead_id, slug, status, finalized_at, moneybird_status").eq("id", proposalId).maybeSingle();
    if (!p || p.status !== "ready") return fail(404, "Dit voorstel is niet beschikbaar.");
    if (p.finalized_at || p.moneybird_status) return fail(409, LOCKED);
    const html = fill(p.slug);
    const { data: version, error } = await admin.from("proposal_versions").insert({ proposal_id: p.id, part: "mvp", status: "ready", mvp_html: html, quality: "eigen", wish: `Eigen bestand: ${fileName}`, notes, cost_usd: 0, created_by_name: actor }).select("id").single();
    if (error || !version) return fail(500, "Het bestand kon niet worden opgeslagen.");
    const { error: activate } = await admin.from("proposals").update({ mvp_html: html, current_mvp_version_id: version.id }).eq("id", p.id);
    if (activate) return fail(409, LOCKED);
    await admin.from("lead_proposal_events").insert({ lead_id: p.lead_id, proposal_id: p.id, kind: "regenerated_mvp", actor_name: actor });
    return NextResponse.json({ ok: true, notes });
  }

  // Nieuw voorstel: alleen de uitwerking wordt gemaakt.
  const priceCents = Number(q.get("priceCents"));
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return fail(400, "Vul een geldige prijs in.");
  if (!process.env.ANTHROPIC_API_KEY) return fail(400, "De Claude API-sleutel ontbreekt nog in Vercel.");
  const { data: lead } = await admin.from("leads").select("id, values, archived_at").eq("id", q.get("leadId") ?? "").maybeSingle();
  if (!lead || lead.archived_at) return fail(404, "Deze lead bestaat niet of is teruggezet.");
  const values = lead.values as Values;
  const slug = `${fileSlug(values.organisatie)}-${randomBytes(8).toString("hex")}`;
  const html = fill(slug);
  const { data: proposal, error } = await admin.from("proposals").insert({ lead_id: lead.id, slug, price_cents: priceCents, discount_percent: 10, quality: "eigen", final_cents: Math.round(priceCents * 0.9), mvp_html: html, expires_at: new Date(Date.now() + 14 * DAY).toISOString(), created_by: master.id }).select("id").single();
  if (error || !proposal) return fail(500, "Het voorstel kon niet worden gestart.");
  after(async () => {
    try {
      const [read, uploads] = await Promise.all([readSite(values.site), loadUploads(lead.id, slug, base)]);
      const doc = await generateDocument(values, mergeUploads(read, uploads));
      const cost = partCost(QUALITY.standaard.model, doc.usage);
      await admin.from("proposals").update({ status: "ready", document: { ...doc.document, open_punten: [...notes, ...doc.document.open_punten] }, error: null, input_tokens: doc.usage.input_tokens ?? 0, output_tokens: doc.usage.output_tokens ?? 0, cost_usd: cost }).eq("id", proposal.id);
      const { data: versions } = await admin.from("proposal_versions").insert([
        { proposal_id: proposal.id, part: "mvp", status: "ready", mvp_html: html, quality: "eigen", wish: `Eigen bestand: ${fileName}`, notes, cost_usd: 0, created_by_name: actor },
        { proposal_id: proposal.id, part: "document", status: "ready", document: doc.document, input_tokens: doc.usage.input_tokens ?? 0, output_tokens: doc.usage.output_tokens ?? 0, cost_usd: cost, created_by_name: actor },
      ]).select("id, part");
      if (versions?.length === 2) await admin.from("proposals").update({ current_mvp_version_id: versions.find((v) => v.part === "mvp")?.id, current_document_version_id: versions.find((v) => v.part === "document")?.id }).eq("id", proposal.id);
    } catch (e) {
      const message = e instanceof Error ? (e.name === "TimeoutError" ? "Claude deed er te lang over." : e.message) : "Onbekende fout.";
      console.error("Uitwerking mislukt:", message);
      await admin.from("proposals").update({ status: "failed", error: `Uitwerking: ${message}`.slice(0, 300) }).eq("id", proposal.id);
    }
  });
  return NextResponse.json({ ok: true, id: proposal.id, notes });
}
