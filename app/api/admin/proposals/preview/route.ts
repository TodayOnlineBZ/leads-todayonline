import { NextResponse, type NextRequest } from "next/server";
import type { Values } from "@/lib/domain";
import type { ProposalDocument } from "@/lib/proposalAi";
import { fileSlug } from "@/lib/proposalBuild";
import { documentPage, mvpHeaders, pageHeaders } from "@/lib/proposalPages";
import { proposalBaseUrl } from "@/lib/proposalRoute";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

export const dynamic = "force-dynamic";

// Interne weergave voor de master. Dit werkt ook als de klantlink is verlopen of uitstaat.
export async function GET(request: NextRequest) {
  if (!(await requireMaster())) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const q = request.nextUrl.searchParams;
  const part = q.get("part");
  if (part !== "mvp" && part !== "document") return NextResponse.json({ error: "Onbekend onderdeel." }, { status: 400 });
  const admin = createAdminClient();
  const { data: p } = await admin.from("proposals").select("slug, price_cents, discount_percent, final_cents, created_at, expires_at, mvp_html, document, lead:leads(values)").eq("id", q.get("proposal") ?? "").maybeSingle();
  if (!p) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  let mvp = p.mvp_html as string | null, doc = p.document as ProposalDocument | null;
  const versionId = q.get("version");
  if (versionId) {
    const { data: v } = await admin.from("proposal_versions").select("proposal_id, mvp_html, document").eq("id", versionId).maybeSingle();
    if (!v || v.proposal_id !== q.get("proposal")) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
    mvp = v.mvp_html; doc = v.document as ProposalDocument | null;
  }
  const values = (p.lead as unknown as { values: Values }).values;
  const download = q.get("download") === "1";
  const attach = (name: string): Record<string, string> => (download ? { "Content-Disposition": `attachment; filename="${fileSlug(values.organisatie)}-${name}.html"` } : {});
  if (part === "mvp") {
    if (!mvp) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
    return new Response(mvp, { headers: { ...mvpHeaders, ...attach("mvp") } });
  }
  if (!doc) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const html = documentPage({ values, document: doc, priceCents: Number(p.price_cents), discountPercent: Number(p.discount_percent), finalCents: Number(p.final_cents), createdAt: p.created_at, expiresAt: p.expires_at, mvpUrl: `${proposalBaseUrl(request)}/${p.slug}` });
  const out = download ? html.replaceAll('src="/voorstel/', `src="${request.nextUrl.origin}/voorstel/`) : html;
  return new Response(out, { headers: { ...pageHeaders, ...attach("uitwerking") } });
}
