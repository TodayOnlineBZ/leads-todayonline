import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type SitePhoto = { url: string; mediaType: string; base64: string };
export type SiteContent = { pages: number; text: string; colors: string[]; imageUrls: { url: string; alt: string }[]; logoUrl: string | null; photos: SitePhoto[] };

const blocked = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) blocked.addSubnet(net, bits, "ipv6");
const isBlockedIp = (raw: string) => {
  const ip = raw.replace(/^::ffff:/i, "");
  const family = isIP(ip);
  return family === 0 || blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
};

// De website-URL komt uit het leadformulier: de server mag er nooit interne adressen mee opvragen.
export async function assertPublicUrl(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !["", "80", "443"].includes(url.port) && !process.env.TEST_ALLOW_LOCAL_FETCH) throw new Error("Geen toegestaan adres.");
  if (process.env.TEST_ALLOW_LOCAL_FETCH) return url;
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  if (!addresses.length || addresses.some((a) => isBlockedIp(a.address))) throw new Error("Geen openbaar adres.");
  return url;
}

export async function safeFetch(raw: string, maxBytes: number, signal: AbortSignal) {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": "Mozilla/5.0 (compatible; TodayOnline-voorstel/1.0)", accept: "*/*" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      current = new URL(res.headers.get("location") as string, url).href;
      continue;
    }
    if (!res.ok || !res.body) { await res.body?.cancel(); throw new Error(`Status ${res.status}`); }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Bestand te groot."); }
      chunks.push(value);
    }
    return { url: url.href, type: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new Error("Te veel doorverwijzingen.");
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&euml;/g, "ë").replace(/&eacute;/g, "é").replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 65536 ? String.fromCharCode(c) : " "; });
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? decode(m[1] ?? m[2] ?? m[3] ?? "") : ""; };

function bestFromSrcset(srcset: string) {
  let best = "", bestSize = -1;
  for (const part of srcset.split(/,\s+/)) {
    const [u, d] = part.trim().split(/\s+/);
    const size = parseFloat(d ?? "1") || 1;
    if (u && size > bestSize) { best = u; bestSize = size; }
  }
  return best;
}
const absolute = (src: string, base: string) => {
  try {
    const u = new URL(src.trim(), base);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (!process.env.TEST_ALLOW_LOCAL_FETCH) u.protocol = "https:"; // De MVP staat op https en mag alleen https-beeld tonen.
    return u.href;
  } catch { return null; }
};
const SKIP = /sprite|pixel|tracking|gravatar|favicon|spinner|loader|placeholder|blank\.|spacer|1x1|\/icons?\//i;

function extractText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const description = html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0];
  const body = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ").replace(/<\/?(p|div|li|h[1-6]|section|article|br|tr|header|footer|nav|a)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  const seen = new Set<string>();
  const lines = decode(body).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => { if (l.length < 2 || seen.has(l)) return false; seen.add(l); return true; });
  return { title: decode(title).trim(), description: description ? attr(description, "content") : "", lines };
}

function extractImages(html: string, base: string) {
  const out: { url: string; alt: string; logo: boolean }[] = [];
  const add = (src: string, alt: string, logoHint = "") => {
    const url = src && !src.startsWith("data:") ? absolute(src, base) : null;
    if (!url || SKIP.test(url) || out.some((i) => i.url === url)) return;
    out.push({ url, alt: alt.trim().slice(0, 120), logo: /logo/i.test(url + " " + alt + " " + logoHint) });
  };
  const og = html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]*>/i)?.[0];
  if (og) add(attr(og, "content"), "Hoofdafbeelding van de website");
  for (const m of html.matchAll(/<(img|source)\b[^>]*>/gi)) {
    const tag = m[0];
    const w = parseInt(attr(tag, "width"), 10), h = parseInt(attr(tag, "height"), 10);
    if ((w && w < 120) || (h && h < 120)) { if (!/logo/i.test(tag)) continue; }
    const srcset = attr(tag, "data-srcset") || attr(tag, "srcset");
    add((srcset && bestFromSrcset(srcset)) || attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "data-original") || attr(tag, "src"), attr(tag, "alt"), attr(tag, "class"));
  }
  for (const m of html.matchAll(/background(?:-image)?\s*:[^;"'}]*url\(\s*(?:&quot;|["'])?([^"')&]+)/gi)) add(m[1], "");
  return out;
}

const extractColors = (css: string, counts: Map<string, number>) => {
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    const c = "#" + hex.toLowerCase();
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if (Math.max(r, g, b) - Math.min(r, g, b) < 18) continue; // Grijstinten zeggen niets over het merk.
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
};

function sniff(b: Buffer) {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

const SUBPAGE = /over|about|wie-w|dienst|service|aanbod|product|werk|project|portfolio|cases?\b|team|oplossing/i;

// Leest de homepage en enkele belangrijke pagina's. Geeft null als de site niet leesbaar is.
export async function readSite(raw: string | undefined, ms = 12_000): Promise<SiteContent | null> {
  const input = (raw ?? "").trim();
  if (!input) return null;
  const signal = AbortSignal.timeout(ms);
  try {
    const first = await safeFetch(/^https?:\/\//i.test(input) ? input : "https://" + input, 2_000_000, signal);
    const home = first.body.toString("utf8");
    const origin = new URL(first.url);
    const links: string[] = [];
    for (const m of home.matchAll(/<a\b[^>]*>/gi)) {
      try {
        const u = new URL(attr(m[0], "href"), first.url);
        u.hash = "";
        if (u.hostname === origin.hostname && u.pathname !== origin.pathname && SUBPAGE.test(u.pathname) && !/\.(pdf|jpe?g|png|zip)$/i.test(u.pathname) && !links.includes(u.href)) links.push(u.href);
      } catch { /* Ongeldige link overslaan. */ }
    }
    const subs = await Promise.allSettled(links.slice(0, 3).map((l) => safeFetch(l, 2_000_000, signal)));
    const pages = [first, ...subs.flatMap((s) => (s.status === "fulfilled" && s.value.type.includes("html") ? [s.value] : []))];
    const counts = new Map<string, number>();
    const images: ReturnType<typeof extractImages> = [];
    const texts: string[] = [];
    let used = 0;
    for (const page of pages) {
      const html = page.body.toString("utf8");
      const { title, description, lines } = extractText(html);
      const block = `--- Pagina: ${page.url}\nTitel: ${title}\nOmschrijving: ${description}\n${lines.join("\n")}`.slice(0, 7000);
      if (used < 14000) { texts.push(block.slice(0, 14000 - used)); used += block.length; }
      for (const image of extractImages(html, page.url)) if (!images.some((i) => i.url === image.url)) images.push(image);
      extractColors([...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join(" "), counts);
      const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]*>/i)?.[0];
      if (theme) extractColors(attr(theme, "content"), counts);
    }
    const sheets = [...home.matchAll(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi)].map((m) => attr(m[0], "href")).filter(Boolean).slice(0, 2);
    const css = await Promise.allSettled(sheets.map((s) => safeFetch(new URL(s, first.url).href, 1_500_000, signal)));
    css.forEach((c) => { if (c.status === "fulfilled") extractColors(c.value.body.toString("utf8"), counts); });
    const logo = images.find((i) => i.logo) ?? null;
    const usable = images.filter((i) => !i.logo && !/\.svg(\?|$)/i.test(i.url)).slice(0, 30);
    // Claude bekijkt de eerste foto's echt, zodat hij beeld kan kiezen op wat erop staat.
    const downloaded = await Promise.allSettled(usable.slice(0, 12).map(async (i) => {
      const file = await safeFetch(i.url, 3_500_000, signal);
      const mediaType = sniff(file.body);
      if (!mediaType || file.body.length < 8000) throw new Error("Te klein of geen foto.");
      return { url: i.url, mediaType, base64: file.body.toString("base64") };
    }));
    return {
      pages: pages.length,
      text: texts.join("\n\n"),
      colors: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c),
      imageUrls: usable.map(({ url, alt }) => ({ url, alt })),
      logoUrl: logo?.url ?? null,
      photos: downloaded.flatMap((d) => (d.status === "fulfilled" ? [d.value] : [])).slice(0, 8),
    };
  } catch (e) {
    console.error("Website niet leesbaar:", e instanceof Error ? e.message : e);
    return null;
  }
}
