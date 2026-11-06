import { getEstimate } from "@/lib/moneybird";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
const FINAL = ["accepted", "rejected", "billed", "archived"];

// Haalt de echte stand op bij Moneybird. Wat een melding zelf zegt, wordt nooit vertrouwd.
export async function syncEstimate(admin: Admin, proposalId: string, estimateId: string) {
  const estimate = await getEstimate(estimateId).catch((e) => {
    // Verwijderd in Moneybird: niets te doen.
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  });
  if (!estimate) return "niet gevonden";
  const cents = Math.round(Number(estimate.total_price_excl_tax ?? 0) * 100);
  const { data, error } = await admin.rpc("apply_moneybird_state", { p_proposal: proposalId, p_state: String(estimate.state ?? ""), p_amount_cents: cents > 0 ? cents : null });
  if (error) throw new Error("De status kon niet worden opgeslagen.");
  return String(data ?? "");
}

const OUTCOME: Record<string, string> = {
  bijgewerkt: "verkoopstatus bijgewerkt",
  ongewijzigd: "al eerder verwerkt",
  opgeslagen: "geen statuswijziging nodig",
  "status blijft": "verkoopstatus blijft staan",
  "lead niet actief": "lead is teruggezet",
  "niet gevonden": "niet meer in Moneybird",
  onbekend: "voorstel niet gevonden",
};
const STATE: Record<string, string> = { draft: "concept", open: "verstuurd", late: "verstuurd, verlopen", accepted: "geaccepteerd", rejected: "afgewezen", billed: "gefactureerd", archived: "gearchiveerd" };

// Alle offertes die nog kunnen veranderen, eventueel alleen van één lead.
export async function syncOpenEstimates(admin: Admin, leadId?: string) {
  let query = admin.from("proposals").select("id, moneybird_estimate_id, moneybird_state, lead:leads(values)").not("moneybird_estimate_id", "is", null);
  if (leadId) query = query.eq("lead_id", leadId);
  const { data } = await query;
  const open = (data ?? []).filter((p) => !FINAL.includes(String(p.moneybird_state ?? "")));
  let changed = 0;
  const details: string[] = [];
  for (const p of open) {
    const result = await syncEstimate(admin, p.id, String(p.moneybird_estimate_id));
    if (result === "bijgewerkt") changed++;
    const { data: after } = await admin.from("proposals").select("moneybird_state, lead:leads(sale_status)").eq("id", p.id).maybeSingle();
    const name = String((p.lead as unknown as { values?: { organisatie?: string } } | null)?.values?.organisatie ?? "Onbekend");
    const state = after?.moneybird_state ? STATE[after.moneybird_state] ?? after.moneybird_state : "onbekend";
    const sale = (after?.lead as unknown as { sale_status?: string } | null)?.sale_status ?? "";
    details.push(`${name}: Moneybird ${state}, ${OUTCOME[result] ?? result}${sale ? ` (nu ${sale})` : ""}`);
  }
  return { checked: open.length, changed, details };
}
