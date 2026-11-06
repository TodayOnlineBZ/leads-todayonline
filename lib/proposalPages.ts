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
// Een eigen bestand mag bekende bibliotheken laden. Ook dan blijft het volledig afgeschermd van de leadtool.
const CDN = "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com https://code.jquery.com";
export const ownMvpHeaders = {
  ...COMMON_HEADERS,
  "Content-Security-Policy": `sandbox allow-scripts allow-popups; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${CDN}; style-src 'unsafe-inline' https://fonts.googleapis.com ${CDN}; font-src https://fonts.gstatic.com data: ${CDN}; img-src data: blob: https:; media-src data: blob: https:; connect-src ${CDN}; form-action 'none'; base-uri 'none'`,
};
export const pageHeaders = {
  ...COMMON_HEADERS,
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; form-action 'none'; base-uri 'none'",
};

// De balk staat in de normale paginastroom en scrolt mee weg. Een sticky header begint daardoor vanzelf eronder;
// een fixed of absolute header staat tegen de bovenrand en wordt hier onder de balk geschoven.
const MVP_BANNER_SCRIPT = `(function(){
var bar=document.getElementById("todayonline-mvp-balk");if(!bar)return;
var fixed=new Map(),moved=new Set();
function scan(){
  var h=bar.offsetHeight;
  document.querySelectorAll("body *").forEach(function(el){
    if(el===bar||bar.contains(el)||fixed.has(el)||moved.has(el))return;
    var cs=getComputedStyle(el);
    if(cs.position!=="fixed"&&cs.position!=="absolute")return;
    var r=el.getBoundingClientRect();
    if(!r.height||r.height>innerHeight*.5||r.width<innerWidth*.5)return;
    if(cs.position==="fixed"){if(r.top<=1&&parseFloat(cs.top)<=1)fixed.set(el,parseFloat(cs.top)||0);return;}
    var parent=el.offsetParent;
    if((!parent||parent===document.body||parent===document.documentElement)&&getComputedStyle(document.body).position==="static"&&r.top+scrollY<h){el.style.setProperty("top",((parseFloat(cs.top)||0)+h)+"px","important");moved.add(el);}
  });
}
function place(){
  var offset=Math.max(0,bar.offsetHeight-scrollY);
  fixed.forEach(function(top,el){el.style.setProperty("top",(top+offset)+"px","important");});
}
function all(){scan();place();}
var last=0;
addEventListener("scroll",function(){var now=Date.now();if(now-last>300){last=now;scan();}place();},{passive:true});
addEventListener("resize",all);
addEventListener("DOMContentLoaded",all);
addEventListener("load",function(){all();setTimeout(all,500);});
})();`;

export function withMvpBanner(html: string, expiresAt: string) {
  const banner = `<div id="todayonline-mvp-balk" style="position:relative;z-index:2147483647;display:block;box-sizing:border-box;width:100%;margin:0;background:#0f3d2e;color:#f5f7f4;font:14px/1.4 Arial,sans-serif;padding:8px 16px;text-align:center">Eerste opzet door TodayOnline, geldig tot ${escapeHtml(nlDate(expiresAt))}</div><script>${MVP_BANNER_SCRIPT}</script>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + banner) : banner + html;
}

export function statusPage(title: string, text: string) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f5f7f4;color:#15261e;font:16px/1.5 Arial,sans-serif"><div style="background:#0f3d2e;padding:24px;text-align:center"><img src="/logo.png" alt="TodayOnline" height="36"></div>
<main style="max-width:520px;margin:48px auto;padding:0 20px"><h1 style="font-size:26px;line-height:1.2">${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><p>Mail gerust naar <a href="mailto:bart@todayonline.nl" style="color:#b4500c">bart@todayonline.nl</a>.</p></main></body></html>`;
}

const WORK = [
  ["kinnie-benelux.nl", "Kinnie Benelux", "Webshop", ["Webshop", "Shopify"], "Online winkel voor Kinnie, de bitterzoete, alcoholvrije frisdrank uit Malta, op een eigen Shopify-thema.", "green"],
  ["albertus.nl", "Albertus Magnus", "Vereniging", ["Web development", "Technische ondersteuning"], "Website van de Groningse studentenvereniging Albertus Magnus.", "cream"],
  ["buddyrun-noord.nl", "Buddy Run Noord", "Evenement", ["Website-ontwerp", "Development"], "Een obstacle run in Groningen voor mensen met een verstandelijke beperking en hun buddy's.", "orange"],
] as const;

type DocInput = { values: Values; document: ProposalDocument; priceCents: number; discountPercent: number; finalCents: number; createdAt: string; expiresAt: string; mvpUrl: string };

export function documentPage({ values, document: d, priceCents, discountPercent, finalCents, createdAt, expiresAt, mvpUrl }: DocInput) {
  const org = escapeHtml(values.organisatie);
  const contact = (values.contact ?? "").trim();
  const firstName = contact.split(/\s+/)[0];
  const half = Math.round(finalCents / 2);
  // De kop is modeltekst: eerst escapen, dan pas één woord accentueren.
  const safeKop = escapeHtml(d.kop);
  const accent = (d.kop_accent ?? "").trim();
  const kop = accent && safeKop.includes(escapeHtml(accent)) ? safeKop.replace(escapeHtml(accent), `<em>${escapeHtml(accent)}</em>`) : safeKop;
  const TOTAL = 6;
  const page = (n: number, body: string) => `<section class="page"><header class="run"><img src="/voorstel/logo-donker.png" alt="TodayOnline"><span>Toelichting bij de offerte · ${org}</span></header><div class="body">${body}</div><footer class="foot"><span>TodayOnline · todayonline.nl</span><b>${String(n).padStart(2, "0")} / ${String(TOTAL).padStart(2, "0")}</b></footer></section>`;
  const head = (label: string, title: string, intro = "") => `<p class="eyebrow">${label}</p><h2>${title}</h2>${intro ? `<p class="intro">${intro}</p>` : ""}`;
  const steps = [["KOMENDE WEEK", "Kennismaken", "Na akkoord op de offerte plannen we een moment om alles vooraf samen door te nemen."], ["WEEK 1", "Uitwerken", "We leggen de inhoud vast en maken het design concreet."], ["WEEK 2", "Bouwen en feedback", "De site komt op een testadres te staan, met een feedbackronde voor de laatste aanpassingen."], ["WEEK 2 TOT 3", "Livegang", "Zodra we samen tevreden zijn, gaat de nieuwe website live."]];
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Toelichting bij de offerte - ${org}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;800&family=Inter:wght@400;500;600&display=swap">
<style>
:root{--green:#0f3d2e;--orange:#f26b21;--orange-text:#b4500c;--ink:#15261e;--muted:#56665e;--line:#d5ddd7;--cream:#f4f1ea;--sand:#e8e3d6}
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#dfe3dd;color:var(--ink);font:15px/1.6 Inter,Arial,sans-serif}
a{color:var(--orange-text)}h1,h2,h3{font-family:"League Spartan",Arial,sans-serif;color:var(--green);margin:0}
.page,.cover{width:100%;max-width:794px;margin:24px auto;background:#fff;box-shadow:0 2px 14px rgba(15,61,46,.14);overflow:hidden}
.page{min-height:1123px;display:flex;flex-direction:column;padding:32px 56px 26px}
.run{display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:11px;color:var(--muted);margin-bottom:34px}.run img{height:17px;width:auto}.run span{text-align:right}
.body{flex:1;display:grid;gap:30px;align-content:start;min-width:0}.foot{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:10px;margin-top:30px;font-size:11px;color:var(--muted)}
.eyebrow{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--orange-text)}.eyebrow:before{content:"";width:26px;height:2px;background:var(--orange)}
h2{font-size:31px;line-height:1.08;font-weight:800;text-wrap:balance}.intro{color:var(--muted);margin:10px 0 0;max-width:58ch}
.cover{display:flex;flex-direction:column;min-height:1123px;background:var(--cream);position:relative}
.cover-top{flex:1;padding:44px 56px;position:relative;overflow:hidden}.cover-top img{height:34px;width:auto;display:block}.ring{position:absolute;width:310px;height:310px;border:44px solid var(--sand);border-radius:50%;top:-110px;right:-70px}.dot{position:absolute;width:26px;height:26px;border-radius:50%;background:var(--orange);top:190px;right:230px}
.cover-tag{position:absolute;top:50px;right:56px;font-size:12px;color:var(--muted)}.cover h1{font-size:54px;line-height:1.03;font-weight:800;margin-top:190px;max-width:13em;text-wrap:balance}.cover em{font-style:normal;color:var(--orange)}.cover-sub{font-size:17px;max-width:32em;margin:18px 0 0}
.cover-band{background:var(--green);color:#f5f7f4;padding:42px 56px 34px}.cover-band:before{content:"";display:block;width:60px;height:3px;background:var(--orange);margin:-42px 0 34px}
.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;font-size:14px}.meta b{display:block;font-size:11px;letter-spacing:.12em;color:#f6a266;margin-bottom:6px}.band-foot{display:flex;justify-content:space-between;gap:16px;margin-top:58px;font-size:12px;color:#c9d6cf}
.two{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:28px;align-items:start}.dark{background:var(--green);color:#f5f7f4;border-radius:10px;padding:24px}.dark h2,.dark h3{color:#fff}.dark .eyebrow{color:#f6a266}
.side h3{font-size:20px;line-height:1.15;margin-bottom:10px}.side p{font-size:13.5px;margin:0 0 16px}.fact{display:flex;justify-content:space-between;gap:10px;border-top:1px solid rgba(255,255,255,.2);padding:8px 0;font-size:13px}.fact b{font-weight:600}
.sign{display:flex;align-items:center;gap:14px;margin-top:18px;font-size:13px}.sign img{width:56px;height:56px;border-radius:50%;border:2px solid var(--orange)}.sign b{display:block;font-size:14px}
.benefits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 26px;margin-top:18px}.benefit{position:relative;padding-left:20px;font-size:13.5px}.benefit:before{content:"";position:absolute;left:0;top:7px;width:9px;height:9px;border-radius:50%;background:var(--orange)}.benefit b{display:block;font-size:14px}.benefit span{color:#d5e0da}
.rows{display:grid;margin-top:18px}.row{display:grid;grid-template-columns:34px minmax(0,1fr);border-top:1px solid var(--line);padding:18px 0}.row>b{font:800 18px "League Spartan",Arial,sans-serif;color:var(--orange)}.row h3{font-size:18px;margin-bottom:5px}.row p{margin:0}
.cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;background:var(--cream);border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:18px 20px}.cta b{display:block;font-size:16px;color:var(--green)}.cta small{color:var(--muted)}.pill{background:var(--orange);color:#fff;font-weight:600;border-radius:999px;padding:9px 18px;text-decoration:none;white-space:nowrap}
.timeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:22px;position:relative}.timeline:before{content:"";position:absolute;left:18px;right:18px;top:17px;height:1px;background:var(--line)}.step{position:relative;font-size:13px}.num{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--green);color:#fff;font-weight:600;margin-bottom:12px}.step:last-child .num{background:var(--orange)}.step small{display:block;font-size:10.5px;font-weight:600;letter-spacing:.1em;color:var(--orange-text)}.step b{display:block;font:600 16px/1.2 "League Spartan",Arial,sans-serif;color:var(--green);margin:3px 0 5px}.step p{margin:0;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-top:18px}.tile{background:var(--cream);border-radius:8px;padding:16px;font-size:13.5px}.tile h3{font-size:17px;margin-bottom:5px}.tile p{margin:0;color:var(--muted)}
.work{display:grid;grid-template-columns:190px minmax(0,1fr);gap:20px;border:1px solid var(--line);border-radius:10px;padding:12px}.shot{border-radius:7px;padding:10px 14px 16px;min-height:132px;display:flex;flex-direction:column;justify-content:space-between}.shot i{font-style:normal;font-size:9.5px;opacity:.8}.shot b{font:800 22px/1 "League Spartan",Arial,sans-serif}.shot small{display:block;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;margin-top:5px}.green{background:var(--green);color:#fff}.cream{background:var(--sand);color:var(--green)}.orange{background:var(--orange);color:#fff}.work h3{font-size:18px}.tags{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.tags span{background:var(--cream);border-radius:999px;font-size:11px;padding:2px 9px}.work p{margin:0 0 6px;font-size:13.5px}.work a{font-size:13px;font-weight:600;text-decoration:none}
table{width:100%;border-collapse:collapse;margin-top:14px}th{font-size:10.5px;letter-spacing:.12em;text-align:left;color:var(--muted);padding:6px 0;border-bottom:2px solid var(--green)}td{padding:12px 0;border-bottom:1px solid var(--line);vertical-align:top}th:last-child,td:last-child{text-align:right;white-space:nowrap;padding-left:14px;font-variant-numeric:tabular-nums}tr.total td{font:800 19px "League Spartan",Arial,sans-serif;color:var(--green);border-bottom:0}
.money{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px;align-items:start}.money h3{font-size:18px;margin-bottom:6px}.pay{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pay div{background:var(--cream);border-radius:8px;padding:12px;font-size:12.5px;color:var(--muted)}.pay b{display:block;font:800 19px "League Spartan",Arial,sans-serif;color:var(--green)}.keep{background:var(--cream);border-radius:8px;padding:16px;font-size:13px}.keep b{font:800 21px "League Spartan",Arial,sans-serif;color:var(--green)}.keep p{margin:6px 0 0;color:var(--muted)}
.next{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:22px}.next p{margin:8px 0 0;font-size:13.5px;color:#d5e0da}.next a{color:#f6a266}.next dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;margin:0;font-size:13px}.next dt{color:#c9d6cf}.next dd{margin:0;overflow-wrap:anywhere}
@media(max-width:720px){body{background:#fff}.page,.cover{margin:0;box-shadow:none;min-height:0;border-bottom:8px solid var(--cream)}.page{padding:20px 16px}.cover-top{padding:28px 16px 40px}.cover-band{padding:32px 16px 24px}.cover h1{font-size:38px;margin-top:130px}.ring{width:220px;height:220px;border-width:32px}.dot{top:130px;right:150px}.cover-tag{display:none}h2{font-size:26px}.two,.money,.next{grid-template-columns:minmax(0,1fr)}.benefits{grid-template-columns:minmax(0,1fr)}.meta{grid-template-columns:minmax(0,1fr)}.timeline{grid-template-columns:minmax(0,1fr)}.timeline:before{display:none}.work{grid-template-columns:minmax(0,1fr)}.run span{display:none}}
@page{size:A4;margin:0}@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page,.cover{margin:0;box-shadow:none;max-width:none;break-after:page;min-height:296mm}}
</style></head><body>
<section class="cover"><div class="cover-top"><div class="ring"></div><div class="dot"></div><img src="/voorstel/logo-donker.png" alt="TodayOnline"><span class="cover-tag">Toelichting bij de offerte</span><p class="eyebrow" style="margin-top:180px">Nieuwe website</p><h1 style="margin-top:0">${kop}</h1><p class="cover-sub">Toelichting op de aanpak, planning en investering voor de nieuwe website van ${org}.</p></div>
<div class="cover-band"><div class="meta"><div><b>VOOR</b>${org}${contact ? `<br>t.a.v. ${escapeHtml(contact)}` : ""}</div><div><b>DATUM</b>${escapeHtml(nlDate(createdAt))}</div><div><b>VAN</b>Bart Ziemerink<br>TodayOnline</div></div><div class="band-foot"><span>Dit document hoort bij de offerte en is daar een inhoudelijke toelichting op.</span><span>todayonline.nl</span></div></div></section>
${page(2, `<div class="two"><div><p class="eyebrow">Voorwoord</p><h2>Beste ${escapeHtml(firstName || values.organisatie)},</h2>${d.voorwoord.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}<div class="sign"><img src="/voorstel/bart.jpg" alt=""><span><b>Bart Ziemerink</b>Eigenaar TodayOnline · todayonline.nl</span></div></div>
<aside class="dark side"><p class="eyebrow">Even voorstellen</p><h3>Eén vast aanspreekpunt</h3><p>Bij TodayOnline schakel je rechtstreeks met mij: van het eerste gesprek tot de livegang en daarna.</p><div class="fact"><span>Standplaats</span><b>Amsterdam</b></div><div class="fact"><span>Actief sinds</span><b>2019</b></div><div class="fact"><span>Gemaakt</span><b>25+ websites</b></div></aside></div>
<div class="dark"><p class="eyebrow">Wat het jullie oplevert</p><h2>In het kort</h2><div class="benefits">${d.voordelen.map((v) => `<div class="benefit"><b>${escapeHtml(v.titel)}</b><span>${escapeHtml(v.tekst)}</span></div>`).join("")}</div></div>`)}
${page(3, `<div>${head("01 / De aanpak", "Zo pakken we het aan.")}<div class="rows">${d.aanpak.map((v, i) => `<div class="row"><b>${"ABCDEF"[i] ?? ""}</b><div><h3>${escapeHtml(v.titel)}</h3><p>${escapeHtml(v.tekst)}</p></div></div>`).join("")}</div></div>
<div class="cta"><div><b>Bekijk de eerste opzet van jullie nieuwe homepage</b><small>Dit is een eerste richting, geldig tot ${escapeHtml(nlDate(expiresAt))}.</small></div><a class="pill" href="${escapeHtml(mvpUrl)}">Open de opzet ↗</a></div>`)}
${page(4, `<div>${head("02 / Planning", "Van akkoord naar livegang.", d.deadline ? escapeHtml(d.deadline) : "We rekenen op 2 tot 3 weken, als de teksten, het beeld en de feedback op tijd beschikbaar zijn.")}<div class="timeline">${steps.map(([when, title, text], i) => `<div class="step"><span class="num">${i + 1}</span><small>${when}</small><b>${title}</b><p>${text}</p></div>`).join("")}</div></div>
<div class="cta"><div><b>Waarom de eerste week zo belangrijk is</b><small>Zodra de bouw begint, zijn grote wijzigingen lastiger door te voeren. Een goede voorbereiding zorgt ervoor dat we daarna vlot en gericht kunnen bouwen.</small></div></div>
<div>${head("03 / Techniek", "Ook achter de schermen op orde.")}<div class="tiles"><div class="tile"><h3>Oplevering</h3><p>Ik controleer de site en zet hem veilig live.</p></div><div class="tile"><h3>Standaard SEO-optimalisatie</h3><p>De basis staat goed, zodat Google jullie site goed kan lezen.</p></div></div></div>`)}
${page(5, `<div>${head("04 / Eerder werk", "Websites die ik eerder bouwde.", "Een greep uit eerder werk. Klik op een website om hem live te bekijken.")}</div>${WORK.map(([url, name, kind, tags, text, color]) => `<article class="work"><div class="shot ${color}"><i>● ● ● ${url}</i><div><b>${name}</b><small>${kind}</small></div></div><div><h3>${name}</h3><div class="tags">${tags.map((t) => `<span>${t}</span>`).join("")}</div><p>${text}</p><a href="https://${url}">Bekijk website ↗</a></div></article>`).join("")}`)}
${page(6, `<div>${head("05 / Investering", "Overzicht van de investering.", "De offerte zelf bevat de officiële bedragen en voorwaarden.")}<table><tr><th>ONDERDEEL</th><th>BEDRAG</th></tr><tr><td>Bouw van de website, oplevering en standaard SEO-optimalisatie</td><td>${formatEuro(priceCents)}</td></tr><tr><td>Korting ${Number(discountPercent)}%</td><td>- ${formatEuro(priceCents - finalCents)}</td></tr><tr class="total"><td>Totaal eenmalig, exclusief btw</td><td>${formatEuro(finalCents)}</td></tr></table></div>
<div class="money"><div><h3>Betaling</h3><div class="pay"><div><b>${formatEuro(half)}</b>Na akkoord op de offerte</div><div><b>${formatEuro(finalCents - half)}</b>Na livegang van de website</div></div></div><div class="keep"><h3>Optioneel onderhoud</h3><b>€ 35</b> per maand, exclusief btw<p>Standaard hosting, domeinnaam, onderhoud en wijzigingen waar nodig. Bij grotere aanpassingen nemen we contact op om te kijken wat er precies moet gebeuren. Jaarlijks vooraf gefactureerd, voor het eerst op de tweede factuur na livegang.</p></div></div>
<div class="dark next"><div><p class="eyebrow">Volgende stap</p><h2>Samen aan de slag.</h2><p>Na akkoord op de offerte plan ik een moment in om alles door te nemen. Heb je tussendoor vragen? Bel of mail me gerust.</p></div><dl><dt>Contact</dt><dd>Bart Ziemerink</dd><dt>E-mail</dt><dd><a href="mailto:bart@todayonline.nl">bart@todayonline.nl</a></dd><dt>Telefoon</dt><dd>+31 6 345 40 298</dd><dt>Web</dt><dd><a href="https://todayonline.nl">todayonline.nl ↗</a></dd></dl></div>`)}
</body></html>`;
}
