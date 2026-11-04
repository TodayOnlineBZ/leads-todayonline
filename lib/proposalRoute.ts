import { createAdminClient } from "@/lib/supabase/admin";

export async function loadProposal(slug: string) {
  if (!/^[a-z0-9-]{8,120}$/.test(slug)) return null;
  const { data } = await createAdminClient().from("proposals")
    .select("id, lead_id, slug, status, price_cents, discount_percent, final_cents, mvp_html, document, expires_at, disabled_at, view_count, created_at, lead:leads(values)")
    .eq("slug", slug).maybeSingle();
  return data;
}
export const isLive = (p: { status: string; disabled_at: string | null; expires_at: string }) =>
  p.status === "ready" && !p.disabled_at && new Date(p.expires_at).getTime() > Date.now();
export function proposalBaseUrl(request: Request) {
  return process.env.PROPOSAL_BASE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin + "/v";
}
