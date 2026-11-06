import { after, NextResponse, type NextRequest } from "next/server";
import type { Values } from "@/lib/domain";
import { generateConcept, generateDocument, generateMvp, partCost, QUALITY, type Quality, siteNotes } from "@/lib/proposalAi";
import { loadUploads, mergeUploads } from "@/lib/leadFiles";
import { proposalBaseUrl } from "@/lib/proposalRoute";
import { readSite } from "@/lib/siteContent";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

export const maxDuration = 300;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const LOCKED = "Dit voorstel ligt vast. Maak eerst een nieuw voorstel.";
type Part = "mvp" | "document";
const CURRENT = { mvp: "current_mvp_version_id", document: "current_document_version_id" } as const;

async function actorName(id: string) {
  const { data } = await createAdminClient().from("profiles").select("name").eq("id", id).maybeSingle();
  return data?.name ?? "Onbekend";
}

// Maakt één onderdeel opnieuw. De vorige versie blijft online tot de nieuwe volledig is gelukt.
export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return fail(403, "Geen toegang.");
  if (!process.env.ANTHROPIC_API_KEY) return fail(400, "De Claude API-sleutel ontbreekt nog in Vercel.");
  const body = await request.json().catch(() => ({}));
  const part = body.part as Part;
  if (part !== "mvp" && part !== "document") return fail(400, "Onbekend onderdeel.");
  const wish = String(body.wish ?? "").trim();
  if (wish.length > 1000) return fail(400, "Je wens mag maximaal 1000 tekens lang zijn.");
  const quality = (part === "mvp" && body.quality in QUALITY ? body.quality : "standaard") as Quality;
  const admin = createAdminClient();
  const { data: p } = await admin.from("proposals").select("id, lead_id, slug, status, finalized_at, moneybird_status, mvp_html, document, lead:leads(values)").eq("id", String(body.id ?? "")).maybeSingle();
  if (!p || p.status !== "ready") return fail(404, "Dit voorstel is niet beschikbaar.");
  if (p.finalized_at || p.moneybird_status) return fail(409, LOCKED);

  // Een vastgelopen poging mag een nieuwe niet blijven tegenhouden.
  await admin.from("proposal_versions").update({ status: "failed", error: "Afgebroken." }).eq("proposal_id", p.id).eq("part", part).eq("status", "generating").lt("created_at", new Date(Date.now() - 6 * 60_000).toISOString());
  const name = await actorName(master.id);
  const { data: version, error } = await admin.from("proposal_versions").insert({ proposal_id: p.id, part, wish: wish || null, quality: part === "mvp" ? quality : null, created_by_name: name }).select("id").single();
  if (error || !version) return fail(409, "Dit onderdeel wordt al gemaakt.");

  const base = proposalBaseUrl(request);
  after(async () => {
    try {
      const values = (p.lead as unknown as { values: Values }).values;
      const [read, uploads] = await Promise.all([readSite(values.site), loadUploads(p.lead_id, p.slug, base)]);
      const site = mergeUploads(read, uploads);
      const change: Record<string, unknown> = {};
      const result: Record<string, unknown> = {};
      if (part === "mvp") {
        const concept = QUALITY[quality].concept ? await generateConcept(values, site, wish).catch(() => null) : null;
        const mvp = await generateMvp(values, site, quality, concept?.text ?? null, { wish, previousHtml: wish ? p.mvp_html : null });
        change.mvp_html = mvp.html;
        Object.assign(result, { mvp_html: mvp.html, notes: siteNotes(site, mvp.html), input_tokens: (mvp.usage.input_tokens ?? 0) + (concept?.usage.input_tokens ?? 0), output_tokens: (mvp.usage.output_tokens ?? 0) + (concept?.usage.output_tokens ?? 0), cost_usd: partCost(QUALITY[quality].model, mvp.usage) + partCost(QUALITY.standaard.model, concept?.usage) });
      } else {
        const doc = await generateDocument(values, site, { wish, previous: wish ? p.document : null });
        // Handmatige afspraken blijven staan; Claude schrijft alleen zijn eigen teksten opnieuw.
        const old = (p.document ?? {}) as Record<string, unknown>;
        const merged = { ...doc.document, ...Object.fromEntries(["planning", "planning_intro", "onderhoud", "betaling"].filter((k) => old[k] != null).map((k) => [k, old[k]])) };
        change.document = merged;
        Object.assign(result, { document: merged, input_tokens: doc.usage.input_tokens ?? 0, output_tokens: doc.usage.output_tokens ?? 0, cost_usd: partCost(QUALITY.standaard.model, doc.usage) });
      }
      // De database weigert dit als het voorstel intussen definitief is geworden.
      const { error: activate } = await admin.from("proposals").update({ ...change, [CURRENT[part]]: version.id }).eq("id", p.id);
      if (activate) throw new Error(LOCKED);
      await admin.from("proposal_versions").update({ status: "ready", ...result }).eq("id", version.id);
      await admin.from("lead_proposal_events").insert({ lead_id: p.lead_id, proposal_id: p.id, kind: `regenerated_${part}`, actor_name: name });
    } catch (e) {
      const message = e instanceof Error ? (e.name === "TimeoutError" ? "Claude deed er te lang over." : e.message) : "Onbekende fout.";
      console.error("Opnieuw maken mislukt:", message);
      await admin.from("proposal_versions").update({ status: "failed", error: message.slice(0, 300) }).eq("id", version.id);
    }
  });
  return NextResponse.json({ ok: true, id: version.id });
}

// Zet een eerdere versie terug. Dat kost geen tegoed.
export async function PATCH(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return fail(403, "Geen toegang.");
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data: v } = await admin.from("proposal_versions").select("id, proposal_id, part, status, mvp_html, document").eq("id", String(body.versionId ?? "")).maybeSingle();
  if (!v || v.status !== "ready") return fail(404, "Deze versie is niet beschikbaar.");
  const { data: p } = await admin.from("proposals").select("id, lead_id, finalized_at, moneybird_status").eq("id", v.proposal_id).maybeSingle();
  if (!p) return fail(404, "Voorstel niet gevonden.");
  if (p.finalized_at || p.moneybird_status) return fail(409, LOCKED);
  const part = v.part as Part;
  const { error } = await admin.from("proposals").update({ ...(part === "mvp" ? { mvp_html: v.mvp_html } : { document: v.document }), [CURRENT[part]]: v.id }).eq("id", p.id);
  if (error) return fail(409, LOCKED);
  await admin.from("lead_proposal_events").insert({ lead_id: p.lead_id, proposal_id: p.id, kind: `restored_${part}`, actor_name: await actorName(master.id) });
  return NextResponse.json({ ok: true });
}
