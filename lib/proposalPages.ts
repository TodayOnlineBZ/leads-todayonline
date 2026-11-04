import { formatEuro, type Values } from "@/lib/domain";
import type { ProposalDocument } from "@/lib/proposalAi";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const nlDate = (at: string | Date) => new Date(at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

const COMMON_HEADERS = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

// De MVP komt van een AI-model: de sandbox isoleert hem volledig van de inlog en de rest van de app.
export const mvpHeaders = {
  ...COMMON_HEADERS,
  "Content-Security-Policy": "sandbox allow-scripts allow-popups; default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: https:; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'",
};
export const pageHeaders = {
  ...COMMON_HEADERS,
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; form-action 'none'; base-uri 'none'",
};

export function withMvpBanner(html: string, expiresAt: string) {
  const banner = `<div style="position:sticky;top:0;z-index:2147483647;background:#0f3d2e;color:#f5f7f4;font:14px/1.4 Arial,sans-serif;padding:8px 16px;text-align:center">Eerste opzet door TodayOnline, geldig tot ${escapeHtml(nlDate(expiresAt))}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + banner) : banner + html;
}

export function statusPage(title: string, text: string) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f5f7f4;color:#15261e;font:16px/1.5 Arial,sans-serif"><div style="background:#0f3d2e;padding:24px;text-align:center"><img src="/logo.png" alt="TodayOnline" height="36"></div>
<main style="max-width:520px;margin:48px auto;padding:0 20px"><h1 style="font-size:26px;line-height:1.2">${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><p>Mail gerust naar <a href="mailto:bart@todayonline.nl" style="color:#b4500c">bart@todayonline.nl</a>.</p></main></body></html>`;
}

const WORK = [
  ["kinnie-benelux.nl", "Kinnie Benelux", "Webshop · Shopify", "Online winkel voor Kinnie, de bitterzoete, alcoholvrije frisdrank uit Malta, op een eigen Shopify-thema."],
  ["albertus.nl", "Albertus Magnus", "Web development · Technische ondersteuning", "Website van de Groningse studentenvereniging Albertus Magnus."],
  ["buddyrun-noord.nl", "Buddy Run Noord", "Website-ontwerp · Development", "Een obstacle run in Groningen voor mensen met een verstandelijke beperking en hun buddy's."],
];

type DocInput = { values: Values; document: ProposalDocument; priceCents: number; discountPercent: number; finalCents: number; createdAt: string; expiresAt: string; mvpUrl: string };

export function documentPage({ values, document: d, priceCents, discountPercent, finalCents, createdAt, expiresAt, mvpUrl }: DocInput) {
  const org = escapeHtml(values.organisatie);
  const contact = (values.contact ?? "").trim();
  const firstName = contact.split(/\s+/)[0];
  const half = Math.round(finalCents / 2);
  const section = (label: string, title: string, intro: string, body: string) => `<section><p class="eyebrow">${label}</p><h2>${title}</h2>${intro ? `<p class="intro">${intro}</p>` : ""}${body}</section>`;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Toelichting bij de offerte - ${org}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;700&family=Figtree:wght@400;500;600&display=swap">
<style>
:root{--green:#0f3d2e;--orange:#e8701a;--ink:#15261e;--muted:#56665e;--line:#d5ddd7;--tint:#e7efe9}
*{box-sizing:border-box}body{margin:0;background:#f5f7f4;color:var(--ink);font:16px/1.55 Figtree,Arial,sans-serif}
.doc{max-width:820px;margin:0 auto;background:#fff}
.cover{background:var(--green);color:#f5f7f4;padding:48px}.cover img{height:36px;display:block;margin-bottom:64px}
.cover .eyebrow{color:#f6a266}.cover h1{font:700 44px/1.08 "League Spartan",Arial,sans-serif;margin:0 0 16px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;margin-top:40px;font-size:14px}.meta b{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#f6a266}
section{padding:36px 48px;border-bottom:1px solid var(--line);break-inside:avoid}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#b4500c;margin:0 0 6px}
h2{font:600 28px/1.15 "League Spartan",Arial,sans-serif;margin:0 0 10px}.intro{color:var(--muted);margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{border:1px solid var(--line);border-radius:8px;padding:14px;break-inside:avoid}.card h3{font-size:16px;margin:0 0 4px}.card p{margin:0;font-size:15px;color:var(--muted)}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}.step{border-top:3px solid var(--orange);padding-top:10px}.step b{display:block;font-size:12px;color:#b4500c;letter-spacing:.06em}.step h3{font-size:16px;margin:4px 0}.step p{margin:0;font-size:14px;color:var(--muted)}
table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid var(--line)}td:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}tr.total td{font-weight:700;font-size:18px;border-bottom:0}
.note{background:var(--tint);border-radius:8px;padding:14px;margin-top:16px;font-size:15px}
.cta{background:var(--green);color:#f5f7f4;border-radius:8px;padding:18px;margin-top:20px}.cta a{color:#f6a266;font-weight:600}
a{color:#b4500c}.work p{margin:4px 0 0;font-size:15px;color:var(--muted)}.work small{color:var(--muted)}
@media(max-width:560px){.cover,section{padding-left:20px;padding-right:20px}.cover h1{font-size:34px}}
@page{size:A4;margin:0}@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.doc{max-width:none}}
</style></head><body><div class="doc">
<header class="cover"><img src="/logo.png" alt="TodayOnline"><p class="eyebrow">Toelichting bij de offerte · Nieuwe website</p><h1>${escapeHtml(d.kop)}</h1><p>Toelichting op de aanpak, planning en investering voor de nieuwe website van ${org}.</p>
<div class="meta"><div><b>Voor</b>${org}${contact ? `<br>t.a.v. ${escapeHtml(contact)}` : ""}</div><div><b>Datum</b>${escapeHtml(nlDate(createdAt))}</div><div><b>Van</b>Bart Ziemerink<br>TodayOnline</div></div></header>
<section><p class="eyebrow">Voorwoord</p><h2>Beste ${escapeHtml(firstName || values.organisatie)},</h2>${d.voorwoord.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}<p>Bij TodayOnline schakel je rechtstreeks met mij: van het eerste gesprek tot de livegang en daarna.</p><p><b>Bart Ziemerink</b><br>Eigenaar TodayOnline · Amsterdam</p></section>
${section("Wat het jullie oplevert", "In het kort", "", `<div class="grid">${d.voordelen.map((v) => `<div class="card"><h3>${escapeHtml(v.titel)}</h3><p>${escapeHtml(v.tekst)}</p></div>`).join("")}</div>`)}
${section("01 / De aanpak", "Zo pakken we het aan", "", `<div class="grid">${d.aanpak.map((v) => `<div class="card"><h3>${escapeHtml(v.titel)}</h3><p>${escapeHtml(v.tekst)}</p></div>`).join("")}</div>
<div class="cta">Bekijk de eerste opzet van jullie homepage: <a href="${escapeHtml(mvpUrl)}">open de opzet</a>. Dit is een eerste richting, geldig tot ${escapeHtml(nlDate(expiresAt))}. Vanaf hier werken we samen verder.</div>`)}
${section("02 / Planning", "Binnen 2 tot 3 weken live", d.deadline ? escapeHtml(d.deadline) : "", `<div class="steps"><div class="step"><b>NA AKKOORD</b><h3>Kennismaken</h3><p>We nemen alles vooraf samen door.</p></div><div class="step"><b>WEEK 1</b><h3>Uitwerken</h3><p>We leggen de inhoud vast en maken het design concreet.</p></div><div class="step"><b>WEEK 2</b><h3>Bouwen</h3><p>De site komt op een testadres te staan.</p></div><div class="step"><b>WEEK 2 TOT 3</b><h3>Feedback en livegang</h3><p>Na de laatste aanpassingen gaat de site live.</p></div></div>
<p class="note">De oplevertijd gaat ervan uit dat de teksten, het beeld en de feedback op tijd beschikbaar zijn.</p>`)}
${section("03 / Techniek", "Ook achter de schermen op orde", "", `<div class="grid"><div class="card"><h3>Oplevering</h3><p>Ik controleer de site en zet hem veilig live.</p></div><div class="card"><h3>Standaard SEO-optimalisatie</h3><p>De basis staat goed, zodat Google jullie site goed kan lezen.</p></div></div>`)}
${section("04 / Eerder werk", "Websites die ik eerder bouwde", "", `<div class="grid work">${WORK.map(([url, name, type, text]) => `<div class="card"><h3><a href="https://${url}">${name}</a></h3><small>${type}</small><p>${text}</p></div>`).join("")}</div>`)}
${section("05 / Investering", "Overzicht van de investering", "De offerte zelf bevat de officiële bedragen en voorwaarden.", `<table><tr><td>Bouw van de website, oplevering en standaard SEO-optimalisatie</td><td>${formatEuro(priceCents)}</td></tr><tr><td>Korting ${Number(discountPercent)}%</td><td>- ${formatEuro(priceCents - finalCents)}</td></tr><tr class="total"><td>Totaal eenmalig, exclusief btw</td><td>${formatEuro(finalCents)}</td></tr></table>
<div class="grid" style="margin-top:18px"><div class="card"><h3>Betaling</h3><p>${formatEuro(half)} na akkoord op de offerte en ${formatEuro(finalCents - half)} na livegang van de website.</p></div><div class="card"><h3>Optioneel onderhoud: € 35 per maand</h3><p>Hosting, domeinnaam, onderhoud en wijzigingen waar nodig. Bij grotere aanpassingen nemen we contact op om te kijken wat er precies moet gebeuren. Alle bedragen exclusief btw.</p></div></div>`)}
${section("Volgende stap", "Samen aan de slag", "", `<p>Na akkoord op de offerte plan ik een moment in om alles door te nemen. Heb je tussendoor vragen? Bel of mail me gerust.</p><p><b>Bart Ziemerink</b><br><a href="mailto:bart@todayonline.nl">bart@todayonline.nl</a><br>+31 6 345 40 298<br><a href="https://todayonline.nl">todayonline.nl</a></p>`)}
</div></body></html>`;
}
