// Standaardteksten van de uitwerking. Per voorstel aan te passen via Teksten bewerken.
export type Maintenance = { tonen: boolean; titel: string; bedrag: string; eenheid: string; tekst: string };
export type PlanStep = { wanneer: string; titel: string; tekst: string };

export const DEFAULT_MAINTENANCE: Maintenance = {
  tonen: true,
  titel: "Optioneel onderhoud",
  bedrag: "€ 35",
  eenheid: "per maand, exclusief btw",
  tekst: "Standaard hosting, domeinnaam, onderhoud en wijzigingen waar nodig. Bij grotere aanpassingen nemen we contact op om te kijken wat er precies moet gebeuren. Jaarlijks vooraf gefactureerd, voor het eerst op de tweede factuur na livegang.",
};
export const DEFAULT_PLANNING: PlanStep[] = [
  { wanneer: "KOMENDE WEEK", titel: "Kennismaken", tekst: "Na akkoord op de offerte plannen we een moment om alles vooraf samen door te nemen." },
  { wanneer: "WEEK 1", titel: "Uitwerken", tekst: "We leggen de inhoud vast en maken het design concreet." },
  { wanneer: "WEEK 2", titel: "Bouwen en feedback", tekst: "De site komt op een testadres te staan, met een feedbackronde voor de laatste aanpassingen." },
  { wanneer: "WEEK 2 TOT 3", titel: "Livegang", tekst: "Zodra we samen tevreden zijn, gaat de nieuwe website live." },
];
export const DEFAULT_PLANNING_INTRO = "We rekenen op 2 tot 3 weken, als de teksten, het beeld en de feedback op tijd beschikbaar zijn.";
export const DEFAULT_PAYMENT: [string, string] = ["Na akkoord op de offerte", "Na livegang van de website"];

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
export function offerClosing(doc: { onderhoud?: Maintenance | null; betaling?: [string, string] | null } | null | undefined) {
  const m = doc?.onderhoud ?? DEFAULT_MAINTENANCE;
  const p = doc?.betaling ?? DEFAULT_PAYMENT;
  const parts = [`Betaling: 50% ${lower(p[0])} en 50% ${lower(p[1])}.`];
  if (m.tonen) parts.push(doc?.onderhoud
    ? `${m.titel}: ${m.bedrag} ${m.eenheid}. ${m.tekst} Dit bedrag is geen onderdeel van het totaal van deze offerte.`.replace(/\s+/g, " ").trim()
    : "Optioneel onderhoud: € 35 per maand, exclusief btw, voor standaard hosting, domeinnaam, onderhoud en wijzigingen waar nodig. Bij grotere aanpassingen nemen we contact op om te kijken wat er precies moet gebeuren. Dit onderhoud is geen onderdeel van het totaalbedrag van deze offerte. Kiest u ervoor, dan wordt het jaarlijks vooraf gefactureerd en voor het eerst meegenomen op de tweede factuur na livegang.");
  return parts.join("\n\n");
}
