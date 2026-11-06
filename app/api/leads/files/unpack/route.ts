import { unzipSync } from "fflate";
import { NextResponse, type NextRequest } from "next/server";
import { BUCKET, guessKind, MAX_FILES_PER_LEAD, safeName, sniffImage, storagePath, zipPlan } from "@/lib/leadFiles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

// Pakt een geüploade zip uit. De rechten komen van de database, via de sessie van de gebruiker.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(403, "Geen toegang.");
  const body = await request.json().catch(() => ({}));
  const { data: file } = await supabase.from("lead_files").select("id, lead_id, name, path, kind, uploaded_by_name").eq("id", String(body.id ?? "")).maybeSingle();
  if (!file) return fail(404, "Dit bestand is niet gevonden.");
  if (file.kind !== "zip") return fail(400, "Dit is geen zip-bestand.");
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from(BUCKET).download(file.path);
  if (error || !blob) return fail(502, "De zip kon niet worden gelezen.");
  const { count } = await admin.from("lead_files").select("id", { count: "exact", head: true }).eq("lead_id", file.lead_id);
  const room = MAX_FILES_PER_LEAD - (count ?? 0);
  let entries: Record<string, Uint8Array>;
  const plan = zipPlan();
  try {
    entries = unzipSync(new Uint8Array(await blob.arrayBuffer()), { filter: plan.filter });
  } catch {
    return fail(400, "Deze zip kon niet worden uitgepakt. Is hij beschadigd of met een wachtwoord beveiligd?");
  }
  const names = Object.keys(entries);
  let added = 0, skipped = plan.rejected + (names.length > room ? names.length - room : 0);
  const queue = names.slice(0, Math.max(room, 0));
  async function worker() {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const bytes = entries[name];
      const mime = sniffImage(bytes);
      if (!mime) { skipped += 1; continue; }
      const clean = safeName(name);
      const path = storagePath(file!.lead_id, clean);
      const upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (upload.error) { skipped += 1; continue; }
      const row = await admin.from("lead_files").insert({ lead_id: file!.lead_id, name: clean, path, size_bytes: bytes.length, mime_type: mime, kind: guessKind(clean), uploaded_by: user!.id, uploaded_by_name: file!.uploaded_by_name });
      if (row.error) { await admin.storage.from(BUCKET).remove([path]); skipped += 1; continue; }
      added += 1;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return NextResponse.json({ ok: true, added, skipped });
}
