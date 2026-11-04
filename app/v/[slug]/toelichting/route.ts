import { type NextRequest } from "next/server";
import type { Values } from "@/lib/domain";
import type { ProposalDocument } from "@/lib/proposalAi";
import { documentPage, pageHeaders, statusPage } from "@/lib/proposalPages";
import { isLive, loadProposal, proposalBaseUrl } from "@/lib/proposalRoute";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await loadProposal(slug);
  if (!p || !isLive(p) || !p.document) return new Response(statusPage("Deze toelichting is niet meer beschikbaar", "De geldigheid van deze toelichting is verlopen."), { status: p ? 410 : 404, headers: pageHeaders });
  const lead = p.lead as unknown as { values: Values };
  return new Response(documentPage({ values: lead.values, document: p.document as ProposalDocument, priceCents: Number(p.price_cents), discountPercent: Number(p.discount_percent), finalCents: Number(p.final_cents), createdAt: p.created_at, expiresAt: p.expires_at, mvpUrl: `${proposalBaseUrl(request)}/${p.slug}` }), { headers: pageHeaders });
}
