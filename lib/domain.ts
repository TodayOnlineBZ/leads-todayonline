export const PROVINCES = ["Drenthe", "Flevoland", "Friesland", "Gelderland", "Groningen", "Limburg", "Noord-Brabant", "Noord-Holland", "Overijssel", "Utrecht", "Zeeland", "Zuid-Holland"];
export const BRANCHES = ["Accountancy", "Advocatuur", "Architectuur", "Autobedrijven", "Bakkerijen", "Beveiliging", "Bouw", "Fysiotherapie", "Groothandel", "Horeca", "Hoveniers", "Installatietechniek", "IT-dienstverlening", "Kappers en beauty", "Logistiek", "Makelaars", "Marketing en communicatie", "Metaal en machinebouw", "Notariaat", "Retail", "Schoonmaak", "Sport en fitness", "Tandartsen", "Uitzendbureaus", "Verzekeraars"];

type Question = { id: string; q: string; hint: string };
export const STEPS: { num: string; title: string; intro: string; questions: Question[] }[] = [
  { num: "Stap 1", title: "De organisatie", intro: "Wat doen ze, en voor wie?", questions: [
    { id: "v1", q: "Wat doet jullie organisatie, en voor wie?", hint: "Kan de prospect het kort en helder uitleggen?" },
    { id: "v2", q: "Wie is jullie ideale klant of doelgroep, en wat zoekt die?", hint: "De doelgroep waarop de website zich moet richten." },
    { id: "v3", q: "Waarom kiezen klanten voor jullie en niet voor een ander?", hint: "Het onderscheid dat de website moet laten zien." },
  ] },
  { num: "Stap 2", title: "De ambitie", intro: "Waar willen ze naartoe?", questions: [
    { id: "v4", q: "Waar wil je dat jullie organisatie over één tot drie jaar staat?", hint: "Hoe concreet de ambitie is." },
    { id: "v5", q: "Wat is op dit moment het belangrijkste doel om daar te komen?", hint: "Het doel waaraan je de website straks verbindt." },
  ] },
  { num: "Stap 3", title: "De knelpunten", intro: "Wat houdt ze tegen?", questions: [
    { id: "v6", q: "Waar lopen jullie nu het meest tegenaan als je naar dat doel kijkt?", hint: "Het probleem in de woorden van de prospect." },
    { id: "v7", q: "Hoe komen nieuwe klanten nu bij jullie terecht?", hint: "Welke rol online nu al speelt." },
    { id: "v8", q: "Hoe vind je dat jullie nu online overkomen, en wat zou je als eerste veranderen?", hint: "Het gat tussen de huidige en de gewenste uitstraling." },
    { id: "v21", q: "Wie zien jullie als jullie belangrijkste concurrenten, en wat doen zij online beter of slechter?", hint: "Namen en websites die je voor het ontwerp kunt onderzoeken." },
  ] },
  { num: "Stap 4", title: "De rol van de website", intro: "Maak nu de brug: verwijs terug naar het doel en het knelpunt dat je hoorde.", questions: [
    { id: "v9", q: "Stel dat jullie website over een jaar precies werkt zoals je wilt. Wat is er dan veranderd voor jullie organisatie?", hint: "Of de prospect de website koppelt aan het doel uit stap 2." },
    { id: "v10", q: "Wat wil je dat een bezoeker op de website doet?", hint: "De belangrijkste actie op de site." },
    { id: "v11", q: "Wat moet een bezoeker binnen vijf seconden begrijpen of voelen?", hint: "De hoofdboodschap van de homepage." },
  ] },
  { num: "Stap 5", title: "Hoe de prospect het voor zich ziet", intro: "Alle antwoorden mogen hypothetisch zijn.", questions: [
    { id: "v12", q: "Welke stijl wil je uitstralen?", hint: "Woorden die je direct in het ontwerp kunt gebruiken." },
    { id: "v13", q: "Welke website schiet je als eerste te binnen als voorbeeld, en wat spreekt je daarin aan?", hint: "De link, en vooral de reden erachter." },
    { id: "v14", q: "Hoeveel pagina's had je zelf in gedachten?", hint: "Hoe groot de prospect het project ziet." },
    { id: "v15", q: "Welke functies mogen voor jou niet ontbreken?", hint: "Functies die de omvang bepalen, zoals een webshop." },
    { id: "v16", q: "Hoe staat het met jullie domeinnaam en hosting?", hint: "Wat er al geregeld is, en wat nog niet." },
    { id: "v17", q: "Hoe zie je de content voor je: wat lever je zelf aan, en wat moeten wij voor je maken?", hint: "Wie teksten en beeld verzorgt." },
  ] },
  { num: "Stap 6", title: "De investering en timing", intro: "Laat de prospect zelf een bedrag noemen en noem zelf geen prijs.", questions: [
    { id: "v18", q: "Stel, je ziet dit precies voor je. Wat zou je dan voor deze website betalen?", hint: "Het bedrag dat de prospect zelf noemt." },
    { id: "v19", q: "Wanneer zou je het liefst live gaan, en waarom dan?", hint: "Of er een echte aanleiding of deadline is." },
    { id: "v20", q: "Wie beslist er bij jullie mee over een nieuwe website?", hint: "Of je met de juiste persoon praat." },
  ] },
];
export const QUESTION_IDS = STEPS.flatMap((s) => s.questions.map((q) => q.id));
export const TOTAL_QUESTIONS = QUESTION_IDS.length;

export type Values = Record<string, string>;
export const answered = (v: Values) => QUESTION_IDS.filter((id) => (v[id] ?? "").trim()).length;
export type Rank = "Hoog" | "Gemiddeld" | "Laag";
export const rankOf = (n: number): Rank => (n >= 16 ? "Hoog" : n >= 8 ? "Gemiddeld" : "Laag");
export const rankScore = (n: number) => ({ Hoog: 3, Gemiddeld: 2, Laag: 1 }[rankOf(n)] * 100 + n);

export const CONSENT_OK = "Toestemming vastgelegd";
export const WARNING = "Niet bellen zonder aantoonbare toestemming.";
export const needsConsent = (legal: string) => /eenmanszaak|^vof$|v\.o\.f|maatschap/i.test(legal ?? "");
export const showWarning = (c: { legal_form: string; consent: string }) => needsConsent(c.legal_form) && c.consent !== CONSENT_OK;

export function buildPrompt(v: Values) {
  const a = (id: string) => (v[id] ?? "").trim() || "nog niet bekend";
  return [
    "Bouw een interactieve MVP van een website voor onderstaande organisatie. Gebruik alleen de informatie uit deze briefing.",
    'Verzin geen feiten, cijfers, klantquotes, projecten of contactgegevens. Waar "nog niet bekend" staat, gebruik je een duidelijk gemarkeerde plaatshouder.',
    "",
    "BEDRIJFSGEGEVENS",
    "Organisatie: " + a("organisatie"),
    "Huidige website: " + a("site"),
    "Provincie: " + a("provincie"),
    "Branche: " + a("branche"),
    "Wat de organisatie doet: " + a("v1"),
    "",
    "DOELGROEP EN ONDERSCHEID",
    "Doelgroep: " + a("v2"),
    "Waarom klanten voor hen kiezen: " + a("v3"),
    "",
    "AMBITIE EN DOEL",
    "Ambitie voor de komende één tot drie jaar: " + a("v4"),
    "Belangrijkste doel nu: " + a("v5"),
    "",
    "KNELPUNTEN",
    "Grootste knelpunt: " + a("v6"),
    "Hoe nieuwe klanten nu binnenkomen: " + a("v7"),
    "Huidige online uitstraling en eerste verbetering: " + a("v8"),
    "",
    "CONCURRENTEN",
    "Door de organisatie genoemde concurrenten en wat zij online beter of slechter doen: " + a("v21"),
    "Onderzoek vóór het ontwerp de genoemde concurrenten en vergelijkbare bedrijven in dezelfde branche en provincie op het web. Vermeld per bevinding je bron. Verzin geen concurrenten of onderzoeksresultaten; meld het als je iets niet kunt vinden.",
    "",
    "ROL VAN DE WEBSITE",
    "Wat er verandert als de website goed werkt: " + a("v9"),
    "Gewenste actie van de bezoeker: " + a("v10"),
    "Hoofdboodschap binnen vijf seconden: " + a("v11"),
    "",
    "ONTWERP EN OMVANG",
    "Stijl: " + a("v12"),
    "Voorbeeldwebsites en wat daarin aanspreekt: " + a("v13"),
    "Aantal pagina's: " + a("v14"),
    "Functies: " + a("v15"),
    "Contentafspraken: " + a("v17"),
  ].join("\n");
}

export function parseCSV(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const sep = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text.charAt(i + 1) === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export const CSV_COLUMNS = ["bedrijfsnaam", "plaats", "provincie", "branche", "telefoon", "website", "rechtsvorm", "bron", "toestemming"];
export type CsvRow = { name: string; city: string; province: string; branch: string; phone: string; website: string; legal_form: string; source: string; consent: string; error: string };

export function readCompanyCsv(text: string): { rows: CsvRow[]; problem?: string } {
  const rows = parseCSV(text);
  if (rows.length < 2) return { rows: [], problem: "Voeg een kopregel en minstens één bedrijf toe." };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
  const missing = CSV_COLUMNS.filter((c) => !head.includes(c));
  if (missing.length) return { rows: [], problem: "Deze kolommen ontbreken: " + missing.join(", ") + "." };
  const seen = new Set<string>();
  return { rows: rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    const province = PROVINCES.find((p) => p.toLowerCase() === o.provincie.toLowerCase());
    const branch = BRANCHES.find((b) => b.toLowerCase() === o.branche.toLowerCase());
    const key = (o.bedrijfsnaam + "|" + o.plaats).toLowerCase();
    let error = "";
    if (!o.bedrijfsnaam || !o.plaats) error = "Naam of plaats ontbreekt";
    else if (!province) error = "Onbekende provincie";
    else if (!branch) error = "Onbekende branche";
    else if (!o.rechtsvorm) error = "Rechtsvorm ontbreekt";
    else if (!o.bron) error = "Bron ontbreekt";
    else if (seen.has(key)) error = "Dubbel in dit bestand";
    if (!error) seen.add(key);
    return { name: o.bedrijfsnaam, city: o.plaats, province: province ?? o.provincie, branch: branch ?? o.branche, phone: o.telefoon, website: o.website, legal_form: o.rechtsvorm, source: o.bron,
      consent: /^(ja|toestemming vastgelegd)$/i.test(o.toestemming) ? CONSENT_OK : o.toestemming, error };
  }) };
}
