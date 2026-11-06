import { randomUUID } from "node:crypto";
import type { SiteContent, SitePhoto } from "@/lib/siteContent";
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET = "lead-files";
const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
export const MAX_FILES_PER_LEAD = 300;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

export function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  const text = Buffer.from(b.subarray(0, 300)).toString("latin1");
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(text)) return "image/svg+xml";
  return null;
}

export const safeName = (raw: string) => (raw.split(/[\\/]/).pop() ?? "").normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "").trim().slice(0, 150);
export const storagePath = (leadId: string, name: string) => `${leadId}/${randomUUID()}-${name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(-80)}`;
export const guessKind = (name: string) => (/logo/i.test(name) ? "logo" : "foto");

// Bepaalt vóór het uitpakken welke items uit een zip zijn toegestaan, zodat een zip-bom niet in het geheugen komt.
export function zipPlan() {
  let total = 0;
  let count = 0;
  const plan = { rejected: 0, filter: (entry: { name: string; originalSize: number }) => {
    const name = entry.name;
    if (name.endsWith("/") || name.includes("__MACOSX/") || safeName(name).startsWith(".") || !safeName(name)) return false;
    if (!IMAGE_TYPES[safeName(name).split(".").pop()?.toLowerCase() ?? ""]) { plan.rejected += 1; return false; }
    if (entry.originalSize > MAX_ENTRY_BYTES || total + entry.originalSize > MAX_TOTAL_BYTES || count >= MAX_FILES_PER_LEAD) { plan.rejected += 1; return false; }
    total += entry.originalSize;
    count += 1;
    return true;
  } };
  return plan;
}

type Row = { id: string; name: string; path: string; mime_type: string; kind: string; size_bytes: number };
const inTime = <T,>(work: Promise<T>, fallback: T, ms: number) => Promise.race([work, new Promise<T>((done) => setTimeout(() => done(fallback), ms))]);

// Aangeleverde bestanden gaan voor op beeld van de website. De klant ziet ze alleen via de link van het voorstel.
export async function loadUploads(leadId: string, slug: string, base: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("lead_files").select("id, name, path, mime_type, kind, size_bytes").eq("lead_id", leadId).order("created_at");
  // Foto's uit een eigen MVP-bestand horen bij dat bestand, en niet bij het beeld voor Claude.
  const images = ((data ?? []) as Row[]).filter((f) => f.mime_type.startsWith("image/") && f.kind !== "overig");
  const url = (f: Row) => `${base}/${slug}/bestand/${f.id}`;
  const forClaude = images.filter((f) => f.kind !== "logo" && f.mime_type !== "image/svg+xml" && f.size_bytes <= 3_500_000 && f.size_bytes >= 2000).slice(0, 8);
  const photos = await inTime(Promise.all(forClaude.map(async (f): Promise<SitePhoto | null> => {
    const { data: blob } = await admin.storage.from(BUCKET).download(f.path);
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mediaType = sniffImage(bytes);
    return mediaType && mediaType !== "image/svg+xml" ? { url: url(f), mediaType, base64: Buffer.from(bytes).toString("base64") } : null;
  })), [], 10_000);
  return {
    logoUrl: images.find((f) => f.kind === "logo") ? url(images.find((f) => f.kind === "logo") as Row) : null,
    imageUrls: images.filter((f) => f.kind !== "logo").map((f) => ({ url: url(f), alt: `Aangeleverd door de klant: ${f.name}` })),
    photos: photos.filter((p): p is SitePhoto => !!p),
  };
}

export function mergeUploads(site: SiteContent | null, uploads: Awaited<ReturnType<typeof loadUploads>>): SiteContent | null {
  if (!uploads.imageUrls.length && !uploads.logoUrl) return site;
  return {
    pages: site?.pages ?? 0,
    text: site?.text ?? "Niet beschikbaar.",
    colors: site?.colors ?? [],
    unread: !site,
    logoUrl: uploads.logoUrl ?? site?.logoUrl ?? null,
    imageUrls: [...uploads.imageUrls, ...(site?.imageUrls ?? [])].slice(0, 50),
    photos: [...uploads.photos, ...(site?.photos ?? [])].slice(0, 8),
  };
}
