"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  answered, BRANCHES, centsToInput, commissionLabel, formatEuro, parseEuroToCents, QUOTE_REQUIRED, SALE_CLASS, SALE_STATUSES, buildPitch, buildPrompt, PITCH_QUESTIONS, CSV_COLUMNS, PROVINCES, rankOf, rankScore, readCompanyCsv, showWarning, STEPS, TOTAL_QUESTIONS,
  WARNING, websiteLink, type CsvRow, type SaleStatus, type Values,
} from "@/lib/domain";

type Profile = { id: string; name: string; email: string; role: string; status: string };
type Note = { id: string; lead_id: string; author_id: string; author_name: string; body: string; created_at: string; edited_at: string | null };
type LeadCompany = { id: string; legal_form: string; source: string; consent: string; do_not_call: boolean; release_count: number; last_release_reason: string | null };
type Lead = { id: string; owner_id: string; company_id: string | null; values: Values; created_at: string; updated_at: string; company: LeadCompany | null; notes: Note[]; archived_at: string | null; archived_by_name: string | null; archive_reason: string | null; archive_note: string | null; sale_status: SaleStatus; quote_amount_cents: number | null; commission_percent: number | null; commission_cents: number | null; sale_events?: SaleEvent[] };
type SaleEvent = { id: string; old_status: string; new_status: string; old_amount_cents: number | null; new_amount_cents: number | null; changed_by_name: string; created_at: string };
type SearchRow = { id: string; name: string; city: string; phone: string | null; website: string; legal_form: string; source: string; consent: string; do_not_call: boolean; release_count: number; last_release_reason: string | null; province: string; branch: string; lead_id: string | null; owner_id: string | null; owner_name: string | null; owner_status: string | null };
type View = "form" | "search" | "list" | "users" | "released";

const nlDate = (at: string) => new Date(at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const nlDateTime = (at: string) => new Date(at).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const lastNote = (l: Lead) => [...l.notes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
const INFO_FIELDS: [string, string, string][] = [["organisatie", "Organisatie (verplicht)", "text"], ["contact", "Contactpersoon", "text"], ["telefoon", "Telefoonnummer", "tel"], ["email", "E-mailadres", "email"], ["site", "Huidige website", "text"]];

export default function LeadApp({ me }: { me: Profile }) {
  const master = me.role === "master";
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>("list");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [values, setValues] = useState<Values>({});
  const [status, setStatus] = useState({ text: "", error: false });
  const [promptText, setPromptText] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingOwner, setPendingOwner] = useState<string | null>(null);
  const [pitchQuestion, setPitchQuestion] = useState(0);
  const nextPitchQuestion = () => setPitchQuestion((old) => old + 1 + Math.floor(Math.random() * (PITCH_QUESTIONS.length - 1)));

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("leads").select("*, company:companies!leads_company_id_fkey(id, legal_form, source, consent, do_not_call, release_count, last_release_reason), notes:lead_notes(*), sale_events:lead_sale_events(*)");
    if (error) { setLoadError("De leads konden niet worden geladen. Ververs de pagina of probeer het later opnieuw."); setLoading(false); return; }
    setLeads((data ?? []) as unknown as Lead[]);
    if (master) {
      const res = await supabase.from("profiles").select("id, name, email, role, status").order("created_at");
      if (res.error) setLoadError("De gebruikers konden niet worden geladen.");
      else setProfiles(res.data as Profile[]);
    }
    setLoadError(""); setLoading(false);
  }, [supabase, master]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPitchQuestion(Math.floor(Math.random() * PITCH_QUESTIONS.length)); }, []);

  const activeLeads = leads.filter((l) => !l.archived_at);
  const releasedLeads = leads.filter((l) => l.archived_at);
  const current = currentId ? activeLeads.find((l) => l.id === currentId) ?? null : null;
  const count = answered(values), rank = rankOf(count);
  const ownerName = (id: string) => (id === me.id ? me.name : profiles.find((p) => p.id === id)?.name ?? "Onbekend");
  const ownerRemoved = (id: string) => profiles.find((p) => p.id === id)?.status === "removed";
  const activeUsers = profiles.filter((p) => p.status === "active");
  const waiting = profiles.filter((p) => p.status === "pending").length;

  function go(v: View) { setView(v); window.scrollTo(0, 0); }
  function openLead(lead: Lead, withPrompt = false) {
    setCurrentId(lead.id); setValues(lead.values); setStatus({ text: "", error: false }); setReleasing(false); nextPitchQuestion();
    setPromptText(withPrompt ? buildPrompt(lead.values) : null);
    go("form");
  }
  function newLead() {
    setCurrentId(null); setValues({}); setStatus({ text: "", error: false }); setPromptText(null); setReleasing(false); nextPitchQuestion(); window.scrollTo(0, 0);
  }
  async function save() {
    if (!(values.organisatie ?? "").trim()) { setStatus({ text: "Vul eerst de naam van de organisatie in.", error: true }); return; }
    const query = currentId
      ? supabase.from("leads").update({ values }).eq("id", currentId).select("id").single()
      : supabase.from("leads").insert({ values, owner_id: me.id }).select("id").single();
    const { data, error } = await query;
    if (error || !data) { setStatus({ text: "Opslaan is niet gelukt. Je antwoorden staan nog hier, dus probeer het opnieuw.", error: true }); return; }
    setCurrentId(data.id);
    await load();
    setStatus({ text: `Opgeslagen: ${values.organisatie} (ranking ${rank}).`, error: false });
  }
  async function reassign(leadId: string, owner: string) {
    const { error } = await supabase.from("leads").update({ owner_id: owner }).eq("id", leadId);
    if (error) { setStatus({ text: "Toewijzen is niet gelukt.", error: true }); return false; }
    await load();
    setStatus({ text: "Lead toegewezen aan " + ownerName(owner) + ".", error: false });
    return true;
  }

  async function afterRelease(lead: Lead) {
    await load();
    if (currentId === lead.id) newLead();
    setStatus({ text: "", error: false });
    setNotice((lead.values.organisatie ?? "Het bedrijf") + " staat weer in de lijst en is beschikbaar voor iedereen.");
    go("list");
  }

  const set = (id: string, v: string) => setValues((old) => ({ ...old, [id]: v }));
  let number = 0;

  return (
    <>
      <header className="top gutter"><div className="inner wide">
        <img className="brand-logo" src="/logo.png" alt="TodayOnline" width="660" height="132" />
        <h1>Leadsysteem</h1>
        <p>Kwalificeer prospects tijdens het bellen. Elke lead komt onder de ingelogde salesmedewerker te staan.</p>
      </div></header>
      <div className="bar gutter"><div className="inner wide">
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" type="button" aria-selected={view === "form"} onClick={() => go("form")}>Gesprek</button>
          <button className="tab" role="tab" type="button" aria-selected={view === "search"} onClick={() => go("search")}>Bedrijven zoeken</button>
          <button className="tab" role="tab" type="button" aria-selected={view === "list"} onClick={() => go("list")}>Bedrijven ({activeLeads.length})</button>
          {master && <button className="tab" role="tab" type="button" aria-selected={view === "users"} onClick={() => go("users")}>Gebruikers{waiting ? ` (${waiting} wacht)` : ""}</button>}
          {master && <button className="tab" role="tab" type="button" aria-selected={view === "released"} onClick={() => go("released")}>Teruggezet ({releasedLeads.length})</button>}
        </div>
        <div className="who"><span>Ingelogd als <strong>{me.name}{master ? " (master)" : ""}</strong></span>
          <form action="/auth/signout" method="post"><button className="btn alt small" type="submit">Uitloggen</button></form>
        </div>
      </div></div>
      <main className="gutter">
        {loadError && <div className="inner wide"><p className="warn-box">{loadError}</p></div>}

        {view === "form" && (
          <div className="inner">
            <div className="strip"><span>{count} van {TOTAL_QUESTIONS} beantwoord</span><div className="track"><div className="fill" style={{ width: (count / TOTAL_QUESTIONS) * 100 + "%" }} /></div><span className={"pill " + rank}>{rank}</span></div>
            {master && current && (
              <div className="owner-box">
                <label className="lbl" htmlFor="ownerSelect">Salesmedewerker van deze lead</label>
                <select id="ownerSelect" value={current.owner_id} onChange={(e) => { if (current.sale_status === "Offerte geaccepteerd") setPendingOwner(e.target.value); else void reassign(current.id, e.target.value); }}>
                  {ownerRemoved(current.owner_id) && <option value={current.owner_id}>{ownerName(current.owner_id)} (verwijderd): kies een nieuwe</option>}
                  {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                {pendingOwner && (
                  <div className="confirm-box" role="group" aria-label="Bevestig toewijzing">
                    <span className="small">Deze offerte is geaccepteerd. De commissie van {formatEuro(current.commission_cents)} gaat dan naar {ownerName(pendingOwner)}. Weet je het zeker?</span>
                    <div className="actions">
                      <button className="btn small" type="button" onClick={() => { const owner = pendingOwner; setPendingOwner(null); void reassign(current.id, owner); }}>Bevestigen</button>
                      <button className="btn alt small" type="button" onClick={() => setPendingOwner(null)}>Annuleren</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {current && <SalePanel key={current.id} lead={current} master={master} reload={load} />}
            {current?.company && (
              <div className="owner-box">
                <span className="lbl">Herkomst van dit bedrijf</span>
                <span className="small">Rechtsvorm: {current.company.legal_form} · Bron: {current.company.source} · Toestemming: {current.company.consent}</span>
                {current.company.release_count > 0 && <span className="small">Eerder {current.company.release_count}× teruggezet. Laatste reden: {current.company.last_release_reason}.</span>}
                {current.company.do_not_call ? <p className="warn-box">Niet meer bellen: dit bedrijf wil niet meer gebeld worden.</p> : showWarning(current.company) && <p className="warn-box">{WARNING}</p>}
              </div>
            )}
            <Notes me={me} lead={current} reload={load} />
            <div className="script">
              <span className="eyebrow">Zo open je het gesprek</span>
              <p id="pitch">&quot;{buildPitch(values, pitchQuestion)}&quot;</p>
              <div><button className="link" type="button" onClick={nextPitchQuestion}>Andere openingsvraag</button></div>
            </div>
            <section className="step">
              <div className="step-head"><h2>Gegevens</h2></div>
              <div className="fields">
                {INFO_FIELDS.map(([id, label, type]) => (
                  <div className="q" key={id}><label htmlFor={id}>{label}</label><input id={id} type={type} autoComplete="off" value={values[id] ?? ""} onChange={(e) => set(id, e.target.value)} /></div>
                ))}
                <div className="q"><label htmlFor="provincie">Provincie</label><select id="provincie" value={values.provincie ?? ""} onChange={(e) => set("provincie", e.target.value)}><option value="">Kies een provincie</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
                <div className="q"><label htmlFor="branche">Branche</label><select id="branche" value={values.branche ?? ""} onChange={(e) => set("branche", e.target.value)}><option value="">Kies een branche</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select></div>
              </div>
            </section>
            <div style={{ display: "grid", gap: 28 }}>
              {STEPS.map((step) => (
                <section className="step" key={step.num}>
                  <div className="step-head"><span className="eyebrow">{step.num}</span><h2>{step.title}</h2><p>{step.intro}</p></div>
                  {step.questions.map((q) => {
                    number += 1;
                    return (
                      <div className="q" key={q.id}>
                        <label className="qlabel" htmlFor={q.id}><span className="n">{number}</span><span>{q.q}</span></label>
                        <p className="hint indent">Let op: {q.hint}</p>
                        <textarea className="indent-box" id={q.id} value={values[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
            <section className="step">
              <div className="step-head"><span className="eyebrow">Afronden</span><h2>Volgende stap</h2><p>Vraag: &quot;Wat zou je ervan vinden als we op basis van dit gesprek vrijblijvend een eerste ontwerp voor je maken?&quot;</p></div>
              <div className="q"><label htmlFor="reactie">Reactie op het voorstel</label><textarea id="reactie" value={values.reactie ?? ""} onChange={(e) => set("reactie", e.target.value)} /></div>
              <div className="q"><label htmlFor="notitie">Overige notities</label><textarea id="notitie" value={values.notitie ?? ""} onChange={(e) => set("notitie", e.target.value)} /></div>
            </section>
            <div className="actions">
              <button className="btn" type="button" onClick={() => void save()}>Opslaan</button>
              {current && <button className="btn alt" type="button" onClick={() => setPromptText(buildPrompt(values))}>Exporteer als MVP-prompt</button>}
              <button className="btn alt" type="button" onClick={newLead}>Nieuw gesprek</button>
              {current?.company_id && !releasing && !QUOTE_REQUIRED.includes(current.sale_status) && <button className="btn alt" type="button" onClick={() => setReleasing(true)}>Terugzetten in de lijst</button>}
            </div>
            {current?.company_id && QUOTE_REQUIRED.includes(current.sale_status) && <p className="hint">Terugzetten kan niet zolang de status {current.sale_status} is. {master ? "Wijzig eerst de verkoopstatus." : "De master moet eerst de status wijzigen."}</p>}
            {current?.company_id && releasing && !QUOTE_REQUIRED.includes(current.sale_status) && (
              <ReleasePanel lead={current} onCancel={() => setReleasing(false)} onDone={() => void afterRelease(current)}
                beforeRelease={async () => !(await supabase.from("leads").update({ values }).eq("id", current.id)).error} />
            )}
            <p className={"status" + (status.error ? " err" : "")} role="status">{status.text}</p>
            {promptText !== null && <PromptBox text={promptText} />}
          </div>
        )}

        {view === "list" && (
          <ListView me={me} leads={activeLeads} loading={loading} profiles={profiles} ownerName={ownerName} ownerRemoved={ownerRemoved} onOpen={openLead} onReleased={(l) => void afterRelease(l)} notice={notice} />
        )}
        {view === "search" && (
          <SearchView me={me} activeUsers={activeUsers} leads={activeLeads} reload={load} onOpen={openLead} />
        )}
        {view === "users" && master && (
          <UsersView me={me} profiles={profiles} leads={activeLeads} reload={load} />
        )}
        {view === "released" && master && <ReleasedView leads={releasedLeads} ownerName={ownerName} />}
      </main>
    </>
  );
}

function PromptBox({ text }: { text: string }) {
  const [note, setNote] = useState("");
  return (
    <div className="q">
      <label htmlFor="exportBox">MVP-prompt</label>
      <textarea id="exportBox" readOnly value={text} style={{ minHeight: 320 }} />
      <div className="actions">
        <button className="btn" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(text); setNote("Prompt gekopieerd."); }
          catch { (document.getElementById("exportBox") as HTMLTextAreaElement | null)?.select(); setNote("Kopieer de geselecteerde tekst handmatig."); }
        }}>Kopieer prompt</button>
        <span role="status">{note}</span>
      </div>
    </div>
  );
}

function Notes({ me, lead, reload }: { me: Profile; lead: Lead | null; reload: () => Promise<void> }) {
  const supabase = useMemo(() => createClient(), []);
  const master = me.role === "master";
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState("");
  const notes = lead ? [...lead.notes].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];

  const guard = async (call: PromiseLike<{ error: unknown }>, message: string) => {
    const { error: err } = await call;
    setError(err ? message : "");
    if (!err) await reload();
    return !err;
  };
  async function add() {
    if (!lead || !input.trim()) { setError("Schrijf eerst een notitie."); return; }
    // De database vult de auteur en de tijd zelf in; deze waarden worden overschreven.
    if (await guard(supabase.from("lead_notes").insert({ lead_id: lead.id, body: input.trim(), author_id: me.id, author_name: me.name }), "De notitie kon niet worden opgeslagen.")) setInput("");
  }
  return (
    <section className="notes" aria-labelledby="notesTitle">
      <h3 id="notesTitle">Notities</h3>
      {!lead && <p className="hint">Sla het gesprek eerst op. Daarna kun je hier bijhouden wat er is besproken.</p>}
      {lead && (
        <div className="q">
          <label htmlFor="noteInput">Wat is er besproken of uitgewisseld?</label>
          <textarea id="noteInput" value={input} onChange={(e) => setInput(e.target.value)} />
          <div className="actions"><button className="btn" type="button" onClick={() => void add()}>Notitie toevoegen</button></div>
        </div>
      )}
      {error && <p className="status err" role="status">{error}</p>}
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <span className="note-meta">{n.author_name} · {nlDateTime(n.created_at)}{n.edited_at ? " · bewerkt" : ""}</span>
              {editing?.id === n.id ? (
                <>
                  <textarea aria-label="Notitie bewerken" value={editing.body} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} />
                  <div className="actions">
                    <button className="btn small" type="button" onClick={async () => {
                      if (!editing.body.trim()) return;
                      if (await guard(supabase.from("lead_notes").update({ body: editing.body.trim() }).eq("id", n.id), "Bewerken is niet gelukt.")) setEditing(null);
                    }}>Opslaan</button>
                    <button className="btn alt small" type="button" onClick={() => setEditing(null)}>Annuleren</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="note-text">{n.body}</p>
                  <div className="note-actions">
                    {(master || n.author_id === me.id) && <button className="link" type="button" onClick={() => setEditing({ id: n.id, body: n.body })}>Bewerken</button>}
                    {master && <button className="link" type="button" onClick={() => {
                      if (confirmDelete !== n.id) { setConfirmDelete(n.id); return; }
                      setConfirmDelete(null);
                      void guard(supabase.from("lead_notes").delete().eq("id", n.id), "Verwijderen is niet gelukt.");
                    }}>{confirmDelete === n.id ? "Klik nogmaals om te verwijderen" : "Verwijderen"}</button>}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type SortKey = "organisatie" | "telefoon" | "provincie" | "rank" | "status" | "quote" | "commission" | "owner" | "contactAt";
const NEWEST_FIRST: SortKey[] = ["rank", "status", "quote", "commission", "contactAt"];
const statusIndex = (status: string) => SALE_STATUSES.indexOf(status as SaleStatus);
const sumCents = (list: Lead[], pick: (l: Lead) => number | null) => list.reduce((total, l) => total + Number(pick(l) ?? 0), 0);

function SaleSummary({ leads, active, onSelect }: { leads: Lead[]; active: string; onSelect: (status: string) => void }) {
  const possible = sumCents(leads.filter((l) => l.sale_status === "Offerte verstuurd"), (l) => l.commission_cents);
  const expected = sumCents(leads.filter((l) => l.sale_status === "Offerte geaccepteerd"), (l) => l.commission_cents);
  return (
    <section className="sale-summary" aria-label="Overzicht per verkoopstatus">
      {SALE_STATUSES.map((status) => {
        const list = leads.filter((l) => l.sale_status === status);
        return (
          <button key={status} type="button" className={"sale-card " + SALE_CLASS[status]} aria-pressed={active === status} onClick={() => onSelect(active === status ? "" : status)}>
            <span className="sale-card-label">{status}</span>
            <span className="sale-card-count">{list.length}</span>
            <span className="sale-card-amount">{formatEuro(sumCents(list, (l) => l.quote_amount_cents))}</span>
          </button>
        );
      })}
      <div className="commission-card"><span className="sale-card-label">Mogelijke commissie</span><span className="sale-card-count">{formatEuro(possible)}</span><span className="sale-card-amount">Offertes die uitstaan</span></div>
      <div className="commission-card won"><span className="sale-card-label">Verwachte commissie</span><span className="sale-card-count">{formatEuro(expected)}</span><span className="sale-card-amount">Geaccepteerde offertes</span></div>
    </section>
  );
}

function SalesBreakdown({ leads, ownerName }: { leads: Lead[]; ownerName: (id: string) => string }) {
  const owners = [...new Set(leads.map((l) => l.owner_id))].sort((a, b) => ownerName(a).localeCompare(ownerName(b)));
  if (!owners.length) return null;
  return (
    <details className="breakdown">
      <summary>Uitsplitsing per salesmedewerker</summary>
      <div className="table-box"><table>
        <thead><tr><th className="plain">Salesmedewerker</th>{SALE_STATUSES.map((s) => <th className="plain" key={s}>{s}</th>)}<th className="plain">Mogelijke commissie</th><th className="plain">Verwachte commissie</th></tr></thead>
        <tbody>{owners.map((id) => {
          const own = leads.filter((l) => l.owner_id === id);
          return (
            <tr key={id}>
              <td>{ownerName(id)}</td>
              {SALE_STATUSES.map((s) => { const list = own.filter((l) => l.sale_status === s); return <td className="num" key={s}>{list.length}<span className="small">{formatEuro(sumCents(list, (l) => l.quote_amount_cents))}</span></td>; })}
              <td className="num">{formatEuro(sumCents(own.filter((l) => l.sale_status === "Offerte verstuurd"), (l) => l.commission_cents))}</td>
              <td className="num">{formatEuro(sumCents(own.filter((l) => l.sale_status === "Offerte geaccepteerd"), (l) => l.commission_cents))}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </details>
  );
}

function SalePanel({ lead, master, reload }: { lead: Lead; master: boolean; reload: () => Promise<void> }) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<string>(lead.sale_status);
  const [amount, setAmount] = useState(centsToInput(lead.quote_amount_cents));
  const [message, setMessage] = useState({ text: "", error: false });
  const [busy, setBusy] = useState(false);
  const events = [...(lead.sale_events ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function save() {
    const cents = parseEuroToCents(amount);
    if (cents !== null && Number.isNaN(cents)) { setMessage({ text: "Vul een geldig bedrag in, bijvoorbeeld 2000 of 2.000,50.", error: true }); return; }
    if (QUOTE_REQUIRED.includes(status) && cents === null) { setMessage({ text: "Vul eerst het offertebedrag in.", error: true }); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_lead_sale", { p_lead: lead.id, p_status: status, p_amount_cents: cents });
    if (error) { setBusy(false); setMessage({ text: "Opslaan is niet gelukt. Ververs de pagina en probeer het opnieuw.", error: true }); return; }
    await reload();
    setBusy(false);
    setMessage({ text: "Verkoopstatus opgeslagen.", error: false });
  }
  return (
    <section className="notes sale-panel" aria-labelledby="saleTitle">
      <h3 id="saleTitle">Verkoop</h3>
      {master ? (
        <>
          <div className="fields">
            <div className="q"><label htmlFor="saleStatus">Verkoopstatus</label><select id="saleStatus" value={status} onChange={(e) => setStatus(e.target.value)}>{SALE_STATUSES.map((v) => <option key={v}>{v}</option>)}</select></div>
            <div className="q"><label htmlFor="saleAmount">Offertebedrag in euro&apos;s, exclusief btw</label><input id="saleAmount" inputMode="decimal" autoComplete="off" placeholder="Bijvoorbeeld 2000" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <div className="actions"><button className="btn" id="saveSale" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Bezig met opslaan" : "Verkoopstatus opslaan"}</button></div>
          {message.text && <p className={"status" + (message.error ? " err" : "")} role="status">{message.text}</p>}
        </>
      ) : null}
      <dl className="sale-facts">
        <div><dt>Status</dt><dd><span className={"pill " + SALE_CLASS[lead.sale_status]}>{lead.sale_status}</span></dd></div>
        <div><dt>Offertebedrag, excl. btw</dt><dd>{formatEuro(lead.quote_amount_cents)}</dd></div>
        <div><dt>{commissionLabel(lead.sale_status)}</dt><dd>{lead.commission_cents == null ? "-" : formatEuro(lead.commission_cents) + " (" + Number(lead.commission_percent) + "%)"}</dd></div>
      </dl>
      {master && events.length > 0 && (
        <details className="breakdown">
          <summary>Geschiedenis ({events.length})</summary>
          <ul className="note-list">{events.map((e) => (
            <li key={e.id}><span className="note-meta">{e.changed_by_name} · {nlDateTime(e.created_at)}</span><p className="note-text">{e.old_status} → {e.new_status}{e.old_amount_cents !== e.new_amount_cents ? ` · ${formatEuro(e.old_amount_cents)} → ${formatEuro(e.new_amount_cents)}` : ""}</p></li>
          ))}</ul>
        </details>
      )}
    </section>
  );
}

function ListView({ me, leads, loading, profiles, ownerName, ownerRemoved, onOpen, onReleased, notice }: { me: Profile; leads: Lead[]; loading: boolean; profiles: Profile[]; ownerName: (id: string) => string; ownerRemoved: (id: string) => boolean; onOpen: (l: Lead, withPrompt?: boolean) => void; onReleased: (l: Lead) => void; notice: string }) {
  const master = me.role === "master";
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const releaseLead = releaseId ? leads.find((l) => l.id === releaseId) : undefined;
  const [query, setQuery] = useState("");
  const [sales, setSales] = useState("");
  const [province, setProvince] = useState("");
  const [branch, setBranch] = useState("");
  const [saleStatus, setSaleStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: "rank", dir: -1 });
  const columns: [SortKey, string][] = [["organisatie", "Bedrijf"], ["telefoon", "Telefoon"], ["provincie", "Regio en branche"], ["rank", "Ranking"], ["status", "Verkoopstatus"], ["quote", "Offertebedrag"], ["commission", "Commissie"], ...(master ? [["owner", "Salesmedewerker"] as [SortKey, string]] : []), ["contactAt", "Laatste contact"]];
  const sortValue = (l: Lead): string | number => {
    switch (sort.key) {
      case "rank": return rankScore(answered(l.values));
      case "status": return statusIndex(l.sale_status);
      case "quote": return Number(l.quote_amount_cents ?? 0);
      case "commission": return Number(l.commission_cents ?? 0);
      case "owner": return ownerName(l.owner_id).toLowerCase();
      case "contactAt": return lastNote(l)?.created_at ?? "";
      default: return (l.values[sort.key] ?? "").toLowerCase();
    }
  };
  const q = query.trim().toLowerCase();
  const scoped = leads.filter((l) => !sales || l.owner_id === sales);
  const list = scoped
    .filter((l) => !saleStatus || l.sale_status === saleStatus)
    .filter((l) => !province || l.values.provincie === province)
    .filter((l) => !branch || l.values.branche === branch)
    .filter((l) => !q || ["organisatie", "contact", "telefoon"].some((k) => (l.values[k] ?? "").toLowerCase().includes(q)))
    .sort((a, b) => { const x = sortValue(a), y = sortValue(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  const salesOptions = profiles.filter((p) => p.status === "active" || leads.some((l) => l.owner_id === p.id));

  return (
    <div className="inner wide" id="viewList">
      <div className="step-head"><h2>{master ? "Alle bedrijven" : "Mijn bedrijven"}</h2><p>{master ? "Je ziet de leads van alle salesmedewerkers en kunt ze openen en bewerken." : "Je ziet alleen je eigen bedrijven en je eigen commissie."}</p></div>
      <SaleSummary leads={scoped} active={saleStatus} onSelect={setSaleStatus} />
      {master && <SalesBreakdown leads={leads} ownerName={ownerName} />}
      <div className="filters">
        <div className="q"><label htmlFor="search">Zoeken</label><input id="search" placeholder="Bedrijf, contact of telefoon" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        {master && <div className="q"><label htmlFor="filterSales">Salesmedewerker</label><select id="filterSales" value={sales} onChange={(e) => setSales(e.target.value)}><option value="">Alle salesmedewerkers</option>{salesOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        <div className="q"><label htmlFor="filterSale">Verkoopstatus</label><select id="filterSale" value={saleStatus} onChange={(e) => setSaleStatus(e.target.value)}><option value="">Alle statussen</option>{SALE_STATUSES.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="q"><label htmlFor="filterProv">Provincie</label><select id="filterProv" value={province} onChange={(e) => setProvince(e.target.value)}><option value="">Alle provincies</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="q"><label htmlFor="filterBranch">Branche</label><select id="filterBranch" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Alle branches</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select></div>
      </div>
      {notice && <p className="status" role="status">{notice}</p>}
      {releaseLead && <ReleasePanel lead={releaseLead} onCancel={() => setReleaseId(null)} onDone={() => { setReleaseId(null); onReleased(releaseLead); }} />}
      <div className="table-box"><table>
        <thead><tr>
          {columns.map(([key, label]) => (
            <th key={key} aria-sort={sort.key === key ? (sort.dir > 0 ? "ascending" : "descending") : undefined}>
              <button type="button" onClick={() => setSort(sort.key === key ? { key, dir: -sort.dir } : { key, dir: NEWEST_FIRST.includes(key) ? -1 : 1 })}>{label}{sort.key === key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</button>
            </th>
          ))}
          <th className="plain">Acties</th>
        </tr></thead>
        <tbody>
          {list.map((l) => {
            const n = answered(l.values), r = rankOf(n), note = lastNote(l);
            return (
              <tr key={l.id}>
                <td><button className="link" type="button" onClick={() => onOpen(l)}>{l.values.organisatie}</button><span className="small">{l.values.contact || "Geen contactpersoon"}</span></td>
                {l.company?.do_not_call ? <td className="blocked">Geblokkeerd</td> : <td className="num">{l.values.telefoon || "-"}</td>}
                <td><span className="small">{l.values.provincie || "-"}</span><span className="small">{l.values.branche || "-"}</span></td>
                <td><span className={"pill " + r}>{r}</span><span className="small">{n} van {TOTAL_QUESTIONS}</span></td>
                <td><span className={"pill " + SALE_CLASS[l.sale_status]}>{l.sale_status}</span></td>
                <td className="num">{formatEuro(l.quote_amount_cents)}</td>
                <td className="num">{formatEuro(l.commission_cents)}{l.commission_cents != null && <span className="small">{l.sale_status === "Offerte verstuurd" ? "Mogelijk" : "Verwacht"}</span>}</td>
                {master && <td className={ownerRemoved(l.owner_id) ? "removed" : ""}>{ownerName(l.owner_id)}{ownerRemoved(l.owner_id) ? " (verwijderd)" : ""}</td>}
                <td className="last-note">{note ? <><span className="small">{nlDate(note.created_at)}</span><span>{note.body.length > 60 ? note.body.slice(0, 60).trim() + "..." : note.body}</span></> : "-"}<span className="small">Gewijzigd {nlDate(l.updated_at)}</span></td>
                <td><div className="row-actions compact">
                  <button className="btn alt small" type="button" onClick={() => onOpen(l, true)}>MVP-prompt</button>
                  {l.company_id && !QUOTE_REQUIRED.includes(l.sale_status) && <button className="btn alt small" type="button" onClick={() => { setReleaseId(l.id); window.scrollTo(0, 0); }}>Terugzetten in de lijst</button>}
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length === 0 && <p className="empty">{loading ? "Bezig met laden." : leads.length ? "Geen bedrijven gevonden. Pas je filters aan." : "Nog geen bedrijven. Neem er een in behandeling via Bedrijven zoeken of sla een nieuw gesprek op."}</p>}
      </div>
    </div>
  );
}

function SearchView({ me, activeUsers, leads, reload, onOpen }: { me: Profile; activeUsers: Profile[]; leads: Lead[]; reload: () => Promise<void>; onOpen: (l: Lead) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const master = me.role === "master";
  const [province, setProvince] = useState("");
  const [branch, setBranch] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [name, setName] = useState("");
  const [legalForm, setLegalForm] = useState("");
  const [legalForms, setLegalForms] = useState<string[]>([]);
  const [confirmDnc, setConfirmDnc] = useState<string | null>(null);
  const [pendingAssign, setPendingAssign] = useState<{ id: string; owner: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [message, setMessage] = useState({ text: "", error: false });
  const hasFilter = Boolean(province || branch || name || legalForm);
  const allMode = showAll && hasFilter;

  const fetchRows = useCallback(async (exclude: string[] = []) => {
    const { data, error } = allMode
      ? await supabase.rpc("search_companies", { p_province: province || null, p_branch: branch || null, p_name: name || null, p_legal_form: legalForm || null })
      : await supabase.rpc("random_companies", { p_province: province || null, p_branch: branch || null, p_exclude: exclude, p_name: name || null, p_legal_form: legalForm || null });
    if (error) { setMessage({ text: "De bedrijven konden niet worden geladen. Ververs de pagina of probeer het opnieuw.", error: true }); setRows([]); return; }
    setRows(data as SearchRow[]);
  }, [supabase, province, branch, name, legalForm, allMode]);
  useEffect(() => { void fetchRows(); }, [fetchRows]);
  useEffect(() => {
    const timer = setTimeout(() => setName(nameInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [nameInput]);
  const loadLegalForms = useCallback(async () => {
    const { data } = await supabase.rpc("company_legal_forms");
    if (data) setLegalForms(data as string[]);
  }, [supabase]);
  useEffect(() => { void loadLegalForms(); }, [loadLegalForms]);

  async function claim(row: SearchRow) {
    const { data, error } = await supabase.rpc("claim_company", { p_company: row.id });
    if (error) {
      setMessage({ text: "Dit bedrijf kon niet worden overgenomen. Het is mogelijk net door een collega geclaimd.", error: true });
      if (allMode) await fetchRows(); else setRows((old) => (old ?? []).filter((r) => r.id !== row.id));
      return;
    }
    const { data: lead } = await supabase.from("leads").select("*, company:companies!leads_company_id_fkey(id, legal_form, source, consent, do_not_call, release_count, last_release_reason), notes:lead_notes(*)").eq("id", data as string).single();
    await reload();
    if (lead) onOpen(lead as unknown as Lead);
  }
  async function setDnc(row: SearchRow, value: boolean) {
    const { error } = await supabase.rpc("set_do_not_call", { p_company: row.id, p_value: value });
    setConfirmDnc(null);
    setMessage(error ? { text: "Deze status kon niet worden gewijzigd.", error: true } : { text: value ? row.name + " staat nu op Niet meer bellen." : row.name + " is hersteld.", error: false });
    // De rij blijft staan, zodat zichtbaar is wat er is gewijzigd.
    if (!error) {
      if (value) setRows((old) => (old ?? []).map((r) => (r.id === row.id ? { ...r, do_not_call: true, phone: null } : r)));
      else await fetchRows();
    }
    await reload();
  }
  async function assign(row: SearchRow, owner: string) {
    if (!row.lead_id) return;
    const { error } = await supabase.from("leads").update({ owner_id: owner }).eq("id", row.lead_id);
    setMessage(error ? { text: "Toewijzen is niet gelukt.", error: true } : { text: row.name + " is opnieuw toegewezen.", error: false });
    await fetchRows(); await reload();
  }
  const clearMessage = () => setMessage({ text: "", error: false });

  return (
    <div className="inner wide" id="viewSearch">
      <div className="step-head"><h2>Bedrijven zoeken</h2><p>{allMode ? "Alle bedrijven binnen je filter, ook die in behandeling of geblokkeerd zijn." : "Een willekeurige selectie van beschikbare bedrijven. Filteren hoeft niet, maar kan wel."}</p></div>
      <div className="filters">
        <div className="q"><label htmlFor="searchProv">Provincie</label><select id="searchProv" value={province} onChange={(e) => { setProvince(e.target.value); clearMessage(); }}><option value="">Alle provincies</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="q"><label htmlFor="searchBranch">Branche</label><select id="searchBranch" value={branch} onChange={(e) => { setBranch(e.target.value); clearMessage(); }}><option value="">Alle branches</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select></div>
        <div className="q"><label htmlFor="searchLegal">Rechtsvorm</label><select id="searchLegal" value={legalForm} onChange={(e) => { setLegalForm(e.target.value); clearMessage(); }}><option value="">Alle rechtsvormen</option>{legalForms.map((f) => <option key={f}>{f}</option>)}</select></div>
        <div className="q"><label htmlFor="searchName">Naam</label><input id="searchName" autoComplete="off" placeholder="Zoek op bedrijfsnaam" value={nameInput} onChange={(e) => { setNameInput(e.target.value); clearMessage(); }} /></div>
      </div>
      <div className="actions">
        {!allMode && <button className="btn alt" id="newSelection" type="button" onClick={() => { clearMessage(); void fetchRows((rows ?? []).map((r) => r.id)); }}>Nieuwe selectie</button>}
        <label className="check" htmlFor="showAll"><input id="showAll" type="checkbox" checked={showAll} disabled={!hasFilter} onChange={(e) => setShowAll(e.target.checked)} /><span>Ook bedrijven tonen die in behandeling of geblokkeerd zijn{hasFilter ? "" : " (kies eerst een filter)"}</span></label>
      </div>
      <p className="hint">{!rows ? "Bezig met laden." : allMode ? rows.length + " bedrijven gevonden" + (rows.length === 200 ? ". Dit zijn de eerste 200 op naam; verfijn je filter." : ".") : rows.length + " willekeurige bedrijven."}</p>
      <p className={"status" + (message.error ? " err" : "")} role="status">{message.text}</p>
      {rows && rows.length > 0 && (
        <div className="table-box"><table>
          <thead><tr>{["Bedrijfsnaam", "Plaats", "Provincie en branche", "Algemeen nummer", "Website", "Rechtsvorm", "Status", "Actie"].map((h) => <th className="plain" key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => {
              const taken = Boolean(c.owner_id), mine = c.owner_id === me.id;
              const ownLead = c.lead_id ? leads.find((l) => l.id === c.lead_id) : undefined;
              return (
                <tr key={c.id}>
                  <td>{c.name}{showWarning(c) && <span className="warn">{WARNING}</span>}{c.release_count > 0 && <span className="small">Eerder {c.release_count}× teruggezet. Laatste reden: {c.last_release_reason}.</span>}</td>
                  <td>{c.city}</td>
                  <td><span className="small">{c.province}</span><span className="small">{c.branch}</span></td>
                  {c.do_not_call ? <td className="blocked">Geblokkeerd</td> : <td className="num">{c.phone || "-"}</td>}
                  <td className="site-cell"><WebsiteLink value={c.website} /></td>
                  <td>{c.legal_form}</td>
                                    <td>{c.do_not_call ? <span className="pill dnc">Niet meer bellen</span> : taken ? <span className="pill taken">In behandeling bij {c.owner_name}</span> : <span className="pill free">Beschikbaar</span>}</td>
                  <td><div className="row-actions">
                    {!c.do_not_call && !taken && <button className="btn small" type="button" onClick={() => void claim(c)}>Neem in behandeling</button>}
                    {ownLead && <button className="btn alt small" type="button" onClick={() => onOpen(ownLead)}>Open lead</button>}
                    {taken && !mine && !master && <span className="small">Geclaimd door een collega</span>}
                    {taken && master && (
                      <>
                        <label className="small" htmlFor={"assign-" + c.id}>Toewijzen aan</label>
                        <select id={"assign-" + c.id} value={c.owner_id ?? ""} onChange={(e) => { if (ownLead?.sale_status === "Offerte geaccepteerd") setPendingAssign({ id: c.id, owner: e.target.value }); else void assign(c, e.target.value); }}>
                          {c.owner_status === "removed" && <option value={c.owner_id ?? ""}>{c.owner_name} (verwijderd)</option>}
                          {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                        {pendingAssign?.id === c.id && (
                          <div className="confirm-box" role="group" aria-label={"Bevestig toewijzing van " + c.name}>
                            <span className="small">Deze offerte is geaccepteerd. De commissie gaat mee naar {activeUsers.find((u) => u.id === pendingAssign.owner)?.name}.</span>
                            <div className="actions">
                              <button className="btn small" type="button" onClick={() => { const owner = pendingAssign.owner; setPendingAssign(null); void assign(c, owner); }}>Bevestigen</button>
                              <button className="btn alt small" type="button" onClick={() => setPendingAssign(null)}>Annuleren</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {!c.do_not_call && (!taken || mine || master) && (confirmDnc === c.id ? (
                      <div className="confirm-box" role="group" aria-label={"Bevestig niet meer bellen voor " + c.name}>
                        <span className="small">Weet je het zeker? {master ? "Je kunt dit later herstellen." : "Alleen de master kan dit herstellen."}</span>
                        <div className="actions">
                          <button className="btn small" type="button" onClick={() => void setDnc(c, true)}>Bevestigen</button>
                          <button className="btn alt small" type="button" onClick={() => setConfirmDnc(null)}>Annuleren</button>
                        </div>
                      </div>
                    ) : <button className="link" type="button" onClick={() => setConfirmDnc(c.id)}>Markeer als niet meer bellen</button>)}
                    {c.do_not_call && master && <button className="link" type="button" onClick={() => void setDnc(c, false)}>Status herstellen</button>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      {rows && rows.length === 0 && <p className="empty">{hasFilter ? "Geen bedrijven gevonden binnen deze filters." : "Er zijn nu geen beschikbare bedrijven."}{master ? " Importeer hieronder een lijst." : ""}</p>}
      {master && <ImportBox onDone={async () => { await fetchRows(); await loadLegalForms(); }} />}
    </div>
  );
}

const RELEASE_REASONS = ["Niet bereikt", "Verkeerde persoon gesproken", "Geen interesse", "Anders"];

function ReleasePanel({ lead, onCancel, onDone, beforeRelease }: { lead: Lead; onCancel: () => void; onDone: () => void; beforeRelease?: () => Promise<boolean> }) {
  const supabase = useMemo(() => createClient(), []);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!reason) { setError("Kies een reden."); return; }
    if (reason === "Anders" && !note.trim()) { setError("Geef een toelichting bij Anders."); return; }
    setBusy(true); setError("");
    if (beforeRelease && !(await beforeRelease())) { setBusy(false); setError("Je antwoorden konden niet worden opgeslagen. Het bedrijf is niet teruggezet."); return; }
    const { error: err } = await supabase.rpc("release_lead", { p_lead: lead.id, p_reason: reason, p_note: reason === "Anders" ? note.trim() : null });
    setBusy(false);
    if (err) { setError("Terugzetten is niet gelukt. Ververs de pagina en probeer het opnieuw."); return; }
    onDone();
  }
  return (
    <section className="owner-box release-panel" aria-labelledby={"release-" + lead.id}>
      <h3 id={"release-" + lead.id}>{lead.values.organisatie} terugzetten in de lijst?</h3>
      <p className="hint">Het bedrijf wordt weer beschikbaar voor iedereen. Deze lead verdwijnt uit het overzicht. De antwoorden en notities blijven bewaard, maar de volgende beller ziet ze niet.</p>
      <div className="q"><label htmlFor="releaseReason">Reden</label><select id="releaseReason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Kies een reden</option>{RELEASE_REASONS.map((r) => <option key={r}>{r}</option>)}</select></div>
      {reason === "Anders" && <div className="q"><label htmlFor="releaseNote">Toelichting</label><textarea id="releaseNote" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>}
      {error && <p className="status err" role="status">{error}</p>}
      <div className="actions">
        <button className="btn" id="confirmRelease" type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Bezig met terugzetten" : "Bevestig terugzetten"}</button>
        <button className="btn alt" type="button" onClick={onCancel}>Annuleren</button>
      </div>
    </section>
  );
}

function ReleasedView({ leads, ownerName }: { leads: Lead[]; ownerName: (id: string) => string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = [...leads].sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""));
  const open = list.find((l) => l.id === openId);
  return (
    <div className="inner wide">
      <div className="step-head"><h2>Teruggezet</h2><p>Alleen zichtbaar met de master-inlog. Deze gesprekken zijn bewaard en kunnen niet meer worden gewijzigd.</p></div>
      <div className="table-box"><table>
        <thead><tr>{["Bedrijfsnaam", "Gebeld door", "Verkoopstatus", "Offerte", "Commissie", "Reden", "Toelichting", "Teruggezet door", "Datum", ""].map((h) => <th className="plain" key={h}>{h}</th>)}</tr></thead>
        <tbody>{list.map((l) => (
          <tr key={l.id}>
            <td>{l.values.organisatie}</td><td>{ownerName(l.owner_id)}</td><td><span className={"pill " + SALE_CLASS[l.sale_status]}>{l.sale_status}</span></td><td className="num">{formatEuro(l.quote_amount_cents)}</td><td className="num">{formatEuro(l.commission_cents)}</td><td>{l.archive_reason}</td><td>{l.archive_note || "-"}</td><td>{l.archived_by_name}</td>
            <td className="num">{l.archived_at ? nlDateTime(l.archived_at) : "-"}</td>
            <td><button className="btn alt small" type="button" onClick={() => setOpenId(openId === l.id ? null : l.id)}>{openId === l.id ? "Sluiten" : "Bekijken"}</button></td>
          </tr>
        ))}</tbody>
      </table>
      {list.length === 0 && <p className="empty">Er zijn nog geen bedrijven teruggezet.</p>}
      </div>
      {open && (
        <section className="notes" aria-labelledby="archiveTitle">
          <h3 id="archiveTitle">{open.values.organisatie}</h3>
          <p className="hint">{answered(open.values)} van {TOTAL_QUESTIONS} vragen beantwoord.</p>
          {STEPS.flatMap((step) => step.questions).filter((q) => (open.values[q.id] ?? "").trim()).map((q) => (
            <div className="q" key={q.id}><span className="lbl">{q.q}</span><p className="note-text">{open.values[q.id]}</p></div>
          ))}
          {open.notes.length > 0 && <h3>Notities</h3>}
          {open.notes.length > 0 && <ul className="note-list">{[...open.notes].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => (
            <li key={n.id}><span className="note-meta">{n.author_name} · {nlDateTime(n.created_at)}{n.edited_at ? " · bewerkt" : ""}</span><p className="note-text">{n.body}</p></li>
          ))}</ul>}
        </section>
      )}
    </div>
  );
}

function WebsiteLink({ value }: { value: string | null }) {
  const link = websiteLink(value);
  if (!link) return <>{value || "-"}</>;
  return <a className="site-link" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label + " (opent in een nieuw tabblad)"}>{link.label}</a>;
}

function ImportBox({ onDone }: { onDone: () => Promise<void> }) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [message, setMessage] = useState({ text: "", error: false });

  function preview(source: string) {
    const parsed = readCompanyCsv(source);
    if (parsed.problem) { setRows(null); setMessage({ text: parsed.problem, error: true }); return; }
    const ok = parsed.rows.filter((r) => !r.error).length;
    setRows(parsed.rows);
    setMessage({ text: `Voorbeeld van de eerste rijen. ${ok} geldig, ${parsed.rows.length - ok} overgeslagen.`, error: false });
  }
  async function run() {
    const valid = (rows ?? []).filter((r) => !r.error).map((r) => { const { error: _unused, ...rest } = r; void _unused; return rest; });
    const { data, error } = await supabase.rpc("import_companies", { p_rows: valid });
    if (error) { setMessage({ text: "Importeren is niet gelukt. Je lijst is niet opgeslagen.", error: true }); return; }
    setRows(null); setText("");
    setMessage({ text: `${data} bedrijven geïmporteerd. ${valid.length - Number(data)} stonden er al in.`, error: false });
    await onDone();
  }
  const validCount = (rows ?? []).filter((r) => !r.error).length;
  return (
    <section className="import">
      <h3>Bedrijvenlijst importeren</h3>
      <p className="hint">Alleen voor de master-inlog. Importeer alleen lijsten die je voor dit doel mag gebruiken. Kolommen: {CSV_COLUMNS.join(", ")}.</p>
      <div className="q"><label htmlFor="csvFile">CSV-bestand</label><input id="csvFile" type="file" accept=".csv,text/csv" onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { setText(String(reader.result)); preview(String(reader.result)); };
        reader.onerror = () => setMessage({ text: "Dit bestand kon niet worden gelezen. Plak de tekst of kies een ander bestand.", error: true });
        reader.readAsText(f);
      }} /></div>
      <div className="q"><label htmlFor="csvText">Of plak de CSV-tekst</label><textarea id="csvText" value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="actions"><button className="btn alt" type="button" onClick={() => preview(text)}>Toon voorbeeld</button></div>
      <p className={"status" + (message.error ? " err" : "")} role="status">{message.text}</p>
      {rows && (
        <div className="table-box"><table>
          <thead><tr>{["Bedrijfsnaam", "Plaats", "Provincie", "Branche", "Telefoon", "Rechtsvorm", "Bron", "Controle"].map((h) => <th className="plain" key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 5).map((r, i) => (
            <tr key={i}><td>{r.name}</td><td>{r.city}</td><td>{r.province}</td><td>{r.branch}</td><td className="num">{r.phone}</td><td>{r.legal_form}</td><td>{r.source}</td><td className={r.error ? "blocked" : ""}>{r.error || "In orde"}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {validCount > 0 && <div className="actions"><button className="btn" type="button" onClick={() => void run()}>Importeer {validCount} bedrijven</button></div>}
    </section>
  );
}

const STATUS_LABEL: Record<string, [string, string]> = { active: ["Actief", "active"], pending: ["Wacht op goedkeuring", "wait"] };

function UsersView({ me, profiles, leads, reload }: { me: Profile; profiles: Profile[]; leads: Lead[]; reload: () => Promise<void> }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState({ text: "", error: false });
  const list = profiles.filter((p) => p.status !== "removed").sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  async function approve(p: Profile) {
    const res = await fetch("/api/admin/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage({ text: String(data.error ?? "Goedkeuren is niet gelukt."), error: true });
    else if (data.emailSent) setMessage({ text: p.name + " is goedgekeurd en heeft een mail gekregen.", error: false });
    else setMessage({ text: p.name + " is goedgekeurd, maar de mail kon niet worden verstuurd. Laat het deze persoon zelf weten.", error: true });
    await reload();
  }
  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? "" : String(data.error ?? "Dat is niet gelukt.");
  }
  async function resetTwoFactor(p: Profile) {
    const err = await post("/api/admin/reset-2fa", { id: p.id });
    setConfirm(null);
    setMessage(err ? { text: err, error: true } : { text: "De 2FA van " + p.name + " is gereset. Bij de volgende keer inloggen stelt deze persoon 2FA opnieuw in.", error: false });
  }
  async function remove(p: Profile) {
    const err = await post("/api/admin/remove", { id: p.id });
    setConfirm(null);
    setMessage(err ? { text: err, error: true } : { text: p.name + " is verwijderd. De leads kun je onder Bedrijven aan iemand anders toewijzen.", error: false });
    await reload();
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const err = await post("/api/admin/invite", { name, email });
    setMessage(err ? { text: err, error: true } : { text: "Uitnodiging verstuurd naar " + email + ".", error: false });
    if (!err) { setName(""); setEmail(""); await reload(); }
  }

  return (
    <div className="inner wide">
      <div className="step-head"><h2>Gebruikers</h2><p>Nieuwe accounts kunnen pas iets na jouw goedkeuring. De leads van een verwijderde gebruiker blijven bestaan.</p></div>
      <form className="add-user" onSubmit={(e) => void invite(e)}>
        <div className="q"><label htmlFor="newName">Naam</label><input id="newName" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="q"><label htmlFor="newMail">E-mailadres</label><input id="newMail" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn" type="submit">Uitnodigen</button>
      </form>
      <p className={"status" + (message.error ? " err" : "")} role="status">{message.text}</p>
      <div className="table-box"><table>
        <thead><tr>{["Naam", "E-mailadres", "Rol", "Status", "Leads", ""].map((h) => <th className="plain" key={h}>{h}</th>)}</tr></thead>
        <tbody>{list.map((p) => {
          const [label, cls] = STATUS_LABEL[p.status] ?? [p.status, "unconfirmed"];
          const isMaster = p.role === "master" || p.id === me.id;
          return (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.email}</td><td>{p.role === "master" ? "Master" : "Salesmedewerker"}</td>
              <td><span className={"pill " + cls}>{label}</span></td>
              <td className="num">{leads.filter((l) => l.owner_id === p.id).length}</td>
              <td><div className="user-actions">
                {p.status === "pending" && <button className="btn small" type="button" onClick={() => void approve(p)}>Goedkeuren</button>}
                {!isMaster && p.status === "active" && <button className="btn alt small" type="button" onClick={() => { if (confirm !== "2fa" + p.id) setConfirm("2fa" + p.id); else void resetTwoFactor(p); }}>{confirm === "2fa" + p.id ? "Klik nogmaals om 2FA te resetten" : "2FA resetten"}</button>}
                {!isMaster && <button className="btn alt small" type="button" onClick={() => { if (confirm !== p.id) setConfirm(p.id); else void remove(p); }}>{confirm === p.id ? "Klik nogmaals om te bevestigen" : p.status === "pending" ? "Weigeren" : "Verwijderen"}</button>}
              </div></td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}
