import { type NextRequest } from "next/server";
import { BUCKET } from "@/lib/leadFiles";
import { loadProposal } from "@/lib/proposalRoute";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const notFound = () => new Response("Niet gevonden", { status: 404, headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });

// Beeld in de MVP. Dit stuurt door naar een tijdelijk adres, zodat grote foto's niet tegen de limiet van de server lopen.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string; fileId: string }> }) {
  const { slug, fileId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return notFound();
  const proposal = await loadProposal(slug);
  if (!proposal) return notFound();
  const admin = createAdminClient();
  const { data: file } = await admin.from("lead_files").select("path, mime_type").eq("id", fileId).eq("lead_id", proposal.lead_id).maybeSingle();
  if (!file || !file.mime_type.startsWith("image/")) return notFound();
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(file.path, 3600);
  if (!data?.signedUrl) return notFound();
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}
