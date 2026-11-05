import { STEPS, type Values } from "@/lib/domain";

export const fileSlug = (text: string | undefined) => (text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "voorstel";

export const photoUrls = (html: string) => {
  const found = new Set<string>();
  for (const m of html.matchAll(/https:\/\/[^\s"'()<>]+\.(?:jpe?g|png|webp|gif|avif|svg)(?:\?[^\s"'()<>]*)?/gi)) found.add(m[0].replace(/&amp;/g, "&"));
  for (const m of html.matchAll(/<img\b[^>]*\ssrc=["'](https:\/\/[^"']+)["']/gi)) found.add(m[1].replace(/&amp;/g, "&"));
  return [...found];
};

const INFO: [string, string][] = [["organisatie", "Organisatie"], ["contact", "Contactpersoon"], ["telefoon", "Telefoon"], ["email", "E-mail"], ["site", "Huidige website"], ["kvk", "KvK-nummer"], ["adres", "Adres"], ["postcode", "Postcode"], ["plaats", "Plaats"], ["provincie", "Provincie"], ["branche", "Branche"]];
const value = (v: Values, id: string) => (v[id] ?? "").trim() || "Nog niet bekend";

export function briefing(v: Values, notes: { author_name: string; body: string; created_at: string }[]) {
  const answers = STEPS.flatMap((step) => [`\n### ${step.title}\n`, ...step.questions.flatMap((q) => [`**${q.q}**`, value(v, q.id), ""])]);
  return [
    "# Briefing", "", "## Bedrijfsinfo", ...INFO.map(([id, label]) => `- ${label}: ${value(v, id)}`), "",
    "## Kwalificatie", ...answers,
    "### Afronden", `**Reactie op het voorstel**`, value(v, "reactie"), "", `**Overige notities**`, value(v, "notitie"), "",
    "## Notities", ...(notes.length ? notes.map((n) => `- ${n.created_at.slice(0, 10)}, ${n.author_name}: ${n.body}`) : ["Geen notities."]), "",
  ].join("\n");
}

export function buildPrompt2(v: Values, missing: string[]) {
  return [
    `Werk de goedgekeurde MVP voor ${value(v, "organisatie")} uit tot een volledige, live te zetten website.`, "",
    "UITGANGSPUNT",
    "- De MVP is de goedgekeurde richting. Behoud het ontwerpidee, de kleuren, typografie en uitstraling, en werk die consequent door op alle pagina's.",
    "- Baseer de inhoud op de briefing en de huidige website. Verzin geen feiten, cijfers, klantquotes, projecten of contactgegevens. Markeer ontbrekende informatie duidelijk.", "",
    "WAT ER GEBOUWD MOET WORDEN",
    `- Pagina's: ${value(v, "v14")}`, `- Functies: ${value(v, "v15")}`, `- Belangrijkste doel: ${value(v, "v5")}`, `- Gewenste actie van de bezoeker: ${value(v, "v10")}`, `- Contentafspraken: ${value(v, "v17")}`, `- Gewenst moment van live gaan: ${value(v, "v19")}`,
    "- Standaard SEO-optimalisatie: titels, omschrijvingen, koppen, alt-teksten, sitemap, robots en gestructureerde data waar passend.",
    "- Volledig responsive, toegankelijk en snel, met een werkend contact- of aanvraagformulier als dat in de briefing staat.", "",
    "NOG TE REGELEN",
    ...(missing.length ? missing.map((m) => `- ${m}`) : ["- Controleer de definitieve teksten met de klant."]),
    "- Controleer de rechten op alle foto's. Gebruik definitief beeld in eigen hosting, en laat de site niet afhankelijk zijn van bestanden op de oude website.", "",
    "BESTANDEN", "Gebruik de bestanden uit dit bouwpakket: mvp.html, uitwerking.html, briefing.md, offerte.md en fotos.md.", "",
    "Begin met een kort plan van de pagina's en wat je van de klant nodig hebt. Bouw daarna de site.",
  ].join("\n");
}

export const missingItems = (v: Values) => [["v14", "Definitieve lijst met pagina's"], ["v15", "Definitieve lijst met functies"], ["v17", "Afspraken over teksten en beeld"], ["adres", "Volledig adres voor de contactpagina"], ["kvk", "KvK-nummer voor de voettekst"]].filter(([id]) => !(v[id] ?? "").trim()).map(([, label]) => label);
