import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_FILE = 50 * 1024 * 1024;
const MAX_PAGE = 4_000_000;
const encoder = new TextEncoder();

// De server vervangt dit door het adres van het voorstel, omdat een nieuw voorstel nog geen link heeft.
export const FILE_TOKEN = "__TODAYONLINE_BESTAND__";

// Een webpagina mag door de limiet van de server maar beperkt groot zijn. Ingebouwde foto's gaan daarom naar de opslag.
export async function prepareOwnMvp(file: File, leadId: string, supabase: SupabaseClient, onProgress: (text: string) => void) {
  if (!/\.html?$/i.test(file.name)) throw new Error("Kies een .html-bestand.");
  if (file.size > MAX_FILE) throw new Error("Dit bestand is groter dan 50 MB.");
  let html = await file.text();
  if (!/<html[\s>]|<!doctype html/i.test(html)) throw new Error("Dit lijkt geen volledige webpagina. Exporteer het artifact als HTML.");
  let moved = 0;
  if (encoder.encode(html).length > MAX_PAGE) {
    const seen = new Map<string, string>();
    const matches = [...html.matchAll(/data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]{20000,})/g)];
    for (const [i, m] of matches.entries()) {
      if (seen.has(m[0])) continue;
      onProgress(`Foto ${i + 1} van ${matches.length} verwerken`);
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const ext = m[1].split("/")[1].replace("jpeg", "jpg");
      const name = `${file.name.replace(/\.html?$/i, "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60)}-foto-${i + 1}.${ext}`;
      const path = `${leadId}/${crypto.randomUUID()}-${name}`;
      const up = await supabase.storage.from("lead-files").upload(path, new Blob([bytes], { type: m[1] }), { contentType: m[1], upsert: false });
      if (up.error) throw new Error("Een foto uit het bestand kon niet worden opgeslagen.");
      const row = await supabase.from("lead_files").insert({ lead_id: leadId, name, path, size_bytes: bytes.length, mime_type: m[1], kind: "overig" }).select("id").single();
      if (row.error || !row.data) { await supabase.storage.from("lead-files").remove([path]); throw new Error("Een foto uit het bestand kon niet worden opgeslagen."); }
      seen.set(m[0], `${FILE_TOKEN}/${row.data.id}`);
      moved += 1;
    }
    for (const [from, to] of seen) html = html.split(from).join(to);
    if (encoder.encode(html).length > MAX_PAGE) throw new Error("Dit bestand blijft te groot: de pagina zelf mag maximaal 4 MB zijn. Verwijder grote ingebouwde video's of lettertypes, of plaats ze op een externe https-link.");
  }
  return { html, moved };
}
