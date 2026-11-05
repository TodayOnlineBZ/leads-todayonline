import type { Values } from "@/lib/domain";

const BASE = process.env.MONEYBIRD_API_URL ?? "https://moneybird.com/api/v2";

// Dit id is niet geheim; alleen het token is dat wel.
const ADMINISTRATION = process.env.MONEYBIRD_ADMINISTRATION_ID ?? "260520987503625612";
export const moneybirdReady = () => !!process.env.MONEYBIRD_TOKEN;

async function mb<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await fetch(`${BASE}/${ADMINISTRATION}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${process.env.MONEYBIRD_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const label = res.status === 401 ? "Het Moneybird-token is ongeldig." : res.status === 403 ? "Het Moneybird-token heeft niet genoeg rechten." : res.status === 429 ? "Moneybird krijgt nu te veel verzoeken. Probeer het zo opnieuw." : `Moneybird gaf status ${res.status}.`;
    const detail = await res.json().then((d) => (d?.error ? JSON.stringify(d.error).slice(0, 200) : "")).catch(() => "");
    throw new Error(detail ? `${label} ${detail}` : label);
  }
  return res.json() as Promise<T>;
}

type Contact = { id: string; company_name: string | null; email?: string | null; send_estimates_to_email?: string | null; chamber_of_commerce?: string | null; address1?: string | null; zipcode?: string | null; city?: string | null };
const clean = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, "");
const same = (a: unknown, b: string) => clean(a) === clean(b);

function differences(contact: Contact, values: Values, email: string) {
  const out: string[] = [];
  const known = contact.send_estimates_to_email || contact.email || "";
  if (!known.split(",").some((part) => same(part, email))) out.push(`e-mailadres (${known || "leeg"} in Moneybird, ${email} in de leadtool)`);
  const check = (label: string, inMb: unknown, inLead: string | undefined) => {
    if ((inLead ?? "").trim() && !same(inMb, inLead as string)) out.push(`${label} (${String(inMb ?? "").trim() || "leeg"} in Moneybird, ${(inLead as string).trim()} in de leadtool)`);
  };
  check("bedrijfsnaam", contact.company_name, values.organisatie);
  check("KvK-nummer", contact.chamber_of_commerce, values.kvk);
  check("adres", contact.address1, values.adres);
  check("postcode", contact.zipcode, values.postcode);
  check("plaats", contact.city, values.plaats);
  return out.length ? `Het bestaande contact is niet aangepast. Dit wijkt af: ${out.join("; ")}.` : "";
}

// Alleen een exacte overeenkomst telt: een offerte mag nooit bij het verkeerde bedrijf terechtkomen.
export async function findOrCreateContact(values: Values, email: string) {
  const company = (values.organisatie ?? "").trim();
  const kvk = (values.kvk ?? "").replace(/\s/g, "");
  if (kvk) {
    const found = await mb<Contact[]>(`/contacts.json?per_page=100&query=${encodeURIComponent(kvk)}`);
    const matches = found.filter((c) => same(c.chamber_of_commerce, kvk));
    if (matches.length > 1) throw new Error(`Er staan ${matches.length} contacten met KvK-nummer ${kvk} in Moneybird. Voeg ze eerst samen.`);
    if (matches[0]) return { id: matches[0].id, created: false, warning: differences(matches[0], values, email) };
  }
  const byCompany = await mb<Contact[]>(`/contacts.json?per_page=100&query=${encodeURIComponent(company)}`);
  const named = byCompany.filter((c) => same(c.company_name, company));
  if (named.length > 1) throw new Error(`Er staan ${named.length} contacten met de naam ${company} in Moneybird. Voeg ze eerst samen.`);
  if (named[0]) return { id: named[0].id, created: false, warning: differences(named[0], values, email) };
  const person = (values.contact ?? "").trim();
  const [firstname, ...rest] = person.split(/\s+/);
  const created = await mb<Contact>("/contacts.json", { method: "POST", body: { contact: {
    company_name: company,
    country: "NL",
    delivery_method: "Email",
    send_estimates_to_email: email,
    send_invoices_to_email: email,
    ...(kvk ? { chamber_of_commerce: kvk } : {}),
    ...((values.adres ?? "").trim() ? { address1: values.adres.trim() } : {}),
    ...((values.postcode ?? "").trim() ? { zipcode: values.postcode.trim() } : {}),
    ...((values.plaats ?? "").trim() ? { city: values.plaats.trim() } : {}),
    ...(person ? { send_estimates_to_attention: person, send_invoices_to_attention: person } : {}),
    ...((values.telefoon ?? "").trim() ? { phone: values.telefoon.trim() } : {}),
    ...(firstname && rest.length ? { contact_person: { firstname, lastname: rest.join(" ") } } : {}),
  } } });
  return { id: created.id, created: true, warning: "" };
}

export async function createDraftEstimate(input: { contactId: string; company: string; priceCents: number; discountPercent: number; dueDays: number; documentUrl: string; mvpUrl: string }) {
  const rates = await mb<{ id: string; percentage: string | null; active?: boolean }[]>(`/tax_rates.json?filter=${encodeURIComponent("percentage:21,tax_rate_type:sales_invoice,active:true")}`);
  const taxRate = rates.find((r) => Number(r.percentage) === 21);
  if (!taxRate) throw new Error("Het btw-tarief van 21% is niet gevonden in Moneybird.");
  const estimate = await mb<{ id: string; total_price_excl_tax: string; total_price_incl_tax: string }>("/estimates.json", { method: "POST", body: { estimate: {
    contact_id: input.contactId,
    reference: `Nieuwe website ${input.company}`.slice(0, 200),
    language: "nl",
    discount: input.discountPercent,
    first_due_interval: input.dueDays,
    prices_are_incl_tax: false,
    pre_text: "Geachte {recipient.name},\n\nHierbij ontvangt u van ons de prijsopgave {document.estimate_id} voor de nieuwe website.\n\nPersoonlijke uitwerking, met onze aanpak en planning:\n" + input.documentUrl + "\n\nEerste opzet van uw nieuwe homepage:\n" + input.mvpUrl,
    post_text: "Betaling: 50% na akkoord op de offerte en 50% na livegang van de website.\n\nOptioneel onderhoud: € 35 per maand, exclusief btw, voor standaard hosting, domeinnaam, onderhoud en wijzigingen waar nodig. Bij grotere aanpassingen nemen we contact op om te kijken wat er precies moet gebeuren. Dit onderhoud is geen onderdeel van het totaalbedrag van deze offerte. Kiest u ervoor, dan wordt het jaarlijks vooraf gefactureerd en voor het eerst meegenomen op de tweede factuur na livegang.\n\nMet vriendelijke groet,\n\nBart Ziemerink\nTodayOnline",
    details_attributes: [{
      description: "Bouw van de website, oplevering en standaard SEO-optimalisatie",
      amount: "1",
      price: (input.priceCents / 100).toFixed(2),
      tax_rate_id: taxRate.id,
      ...(process.env.MONEYBIRD_LEDGER_ACCOUNT_ID ? { ledger_account_id: process.env.MONEYBIRD_LEDGER_ACCOUNT_ID } : {}),
    }],
  } } });
  return { id: estimate.id, url: `https://moneybird.com/${ADMINISTRATION}/estimates/${estimate.id}`, totalExcl: estimate.total_price_excl_tax };
}
