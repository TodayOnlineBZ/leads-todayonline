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

// Alle offertes die nog kunnen veranderen, eventueel alleen van één lead.
export async function syncOpenEstimates(admin: Admin, leadId?: string) {
  let query = admin.from("proposals").select("id, moneybird_estimate_id, moneybird_state").not("moneybird_estimate_id", "is", null);
  if (leadId) query = query.eq("lead_id", leadId);
  const { data } = await query;
  const open = (data ?? []).filter((p) => !FINAL.includes(String(p.moneybird_state ?? "")));
  let changed = 0;
  for (const p of open) if ((await syncEstimate(admin, p.id, String(p.moneybird_estimate_id))) === "bijgewerkt") changed++;
  return { checked: open.length, changed };
}
