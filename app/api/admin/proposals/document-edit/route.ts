import { NextResponse, type NextRequest } from "next/server";
import type { ProposalDocument } from "@/lib/proposalAi";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const pairs = (v: unknown, count: number) => (Array.isArray(v) ? v : []).slice(0, count).map((x) => ({ titel: text(x?.titel, 150), tekst: text(x?.tekst, 800) })).filter((x) => x.titel || x.tekst);

// Slaat handmatig aangepaste teksten op als nieuwe versie. Dit kost geen tegoed.
export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return fail(403, "Geen toegang.");
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data: p } = await admin.from("proposals").select("id, lead_id, status, finalized_at, moneybird_status, document").eq("id", String(body.id ?? "")).maybeSingle();
  if (!p || p.status !== "ready" || !p.document) return fail(404, "Dit voorstel is niet beschikbaar.");
  if (p.finalized_at || p.moneybird_status) return fail(409, "Dit voorstel ligt vast. Maak eerst een nieuw voorstel.");
  const d = body.document ?? {};
  const previous = p.document as ProposalDocument;
  const kop = text(d.kop, 150);
  const voorwoord = (Array.isArray(d.voorwoord) ? d.voorwoord : []).slice(0, 8).map((x: unknown) => text(x, 1500)).filter(Boolean);
  if (!kop) return fail(400, "De kop mag niet leeg zijn.");
  if (!voorwoord.length) return fail(400, "Het voorwoord mag niet leeg zijn.");
  const planning = (Array.isArray(d.planning) ? d.planning : []).slice(0, 6).map((x: { wanneer?: unknown; titel?: unknown; tekst?: unknown }) => ({ wanneer: text(x?.wanneer, 40), titel: text(x?.titel, 100), tekst: text(x?.tekst, 400) })).filter((x: { titel: string }) => x.titel);
  if (!planning.length) return fail(400, "De planning heeft minstens één stap met een titel nodig.");
  const onderhoud = { tonen: d.onderhoud?.tonen !== false, titel: text(d.onderhoud?.titel, 100), bedrag: text(d.onderhoud?.bedrag, 40), eenheid: text(d.onderhoud?.eenheid, 80), tekst: text(d.onderhoud?.tekst, 1000) };
  if (onderhoud.tonen && !onderhoud.titel) return fail(400, "Geef het onderhoudsblok een titel, of zet het uit.");
  const betaling = [text(d.betaling?.[0], 80), text(d.betaling?.[1], 80)];
  if (!betaling[0] || !betaling[1]) return fail(400, "Vul beide betaalmomenten in.");
  const document = { ...previous, kop, kop_accent: text(d.kop_accent, 60), voorwoord, voordelen: pairs(d.voordelen, 8), aanpak: pairs(d.aanpak, 6), planning, planning_intro: text(d.planning_intro, 400), onderhoud, betaling };
  const { data: profile } = await admin.from("profiles").select("name").eq("id", master.id).maybeSingle();
  const actor = profile?.name ?? "Onbekend";
  const { data: version, error } = await admin.from("proposal_versions").insert({ proposal_id: p.id, part: "document", status: "ready", document, quality: "handmatig", cost_usd: 0, created_by_name: actor }).select("id").single();
  if (error || !version) return fail(500, "Opslaan is niet gelukt.");
  const { error: activate } = await admin.from("proposals").update({ document, current_document_version_id: version.id }).eq("id", p.id);
  if (activate) return fail(409, "Dit voorstel ligt vast. Maak eerst een nieuw voorstel.");
  await admin.from("lead_proposal_events").insert({ lead_id: p.lead_id, proposal_id: p.id, kind: "regenerated_document", actor_name: actor });
  return NextResponse.json({ ok: true });
}
