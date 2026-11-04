import { type NextRequest } from "next/server";
import { mvpHeaders, pageHeaders, statusPage, withMvpBanner } from "@/lib/proposalPages";
import { isLive, loadProposal } from "@/lib/proposalRoute";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const GONE = ["Deze opzet is niet meer beschikbaar", "De geldigheid van deze eerste opzet is verlopen. Wil je hem nog eens bekijken? Laat het me weten."] as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const proposal = await loadProposal(slug);
  if (!proposal || !isLive(proposal) || !proposal.mvp_html) return new Response(statusPage(...GONE), { status: proposal ? 410 : 404, headers: pageHeaders });
  await createAdminClient().from("proposals").update({ view_count: proposal.view_count + 1, last_viewed_at: new Date().toISOString() }).eq("id", proposal.id);
  return new Response(withMvpBanner(proposal.mvp_html, proposal.expires_at), { headers: mvpHeaders });
}
