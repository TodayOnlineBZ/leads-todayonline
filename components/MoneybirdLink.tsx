"use client";
import { useEffect, useState } from "react";
import BusyButton from "@/components/BusyButton";

// Eén keer aanzetten: daarna meldt Moneybird zelf wanneer een offerte verstuurd, geaccepteerd of afgewezen is.
export default function MoneybirdLink() {
  const [state, setState] = useState<{ ready: boolean; active: boolean } | null>(null);
  const [message, setMessage] = useState({ text: "", error: false });
  useEffect(() => {
    fetch("/api/admin/moneybird/webhook").then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) setState(d); else setMessage({ text: String(d.error ?? "De koppeling kon niet worden gecontroleerd."), error: true });
    }).catch(() => setMessage({ text: "Geen verbinding. Ververs de pagina.", error: true }));
  }, []);
  async function connect() {
    setMessage({ text: "", error: false });
    const r = await fetch("/api/admin/moneybird/webhook", { method: "POST" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setMessage({ text: String(d.error ?? "Dat is niet gelukt. Probeer het opnieuw."), error: true }); return; }
    const wasActive = state?.active;
    setState({ ready: true, active: true });
    setMessage({ text: `${wasActive ? "Bijgewerkt." : "Aangezet."} ${d.checked} offerte${d.checked === 1 ? "" : "s"} gecontroleerd, ${d.changed} verkoopstatus${d.changed === 1 ? "" : "sen"} bijgewerkt.`, error: false });
  }
  return (
    <section className="notes" aria-labelledby="mbTitle" id="moneybirdLinkCard">
      <h2 id="mbTitle">Moneybird</h2>
      <p className="hint">Verstuur je een offerte in Moneybird, of accepteert of weigert de klant die, dan zet de leadtool de verkoopstatus zelf op Offerte verstuurd, Offerte geaccepteerd of Afgewezen. Een status die je zelf al verder hebt gezet, blijft staan.</p>
      {!state && !message.text && <p className="hint">Koppeling controleren…</p>}
      {state && !state.ready && <p className="hint">De Moneybird-gegevens ontbreken nog in Vercel.</p>}
      {state?.ready && state.active && <p className="status" id="mbActive">De koppeling staat aan.</p>}
      {state?.ready && (
        <div className="actions"><BusyButton className={"btn" + (state.active ? " alt" : "")} id="mbConnect" type="button" busyText={state.active ? "Bijwerken…" : "Aanzetten…"} onAction={connect}>{state.active ? "Statussen nu bijwerken" : "Automatische status aanzetten"}</BusyButton></div>
      )}
      {message.text && <p className={"status" + (message.error ? " err" : "")} role="status">{message.text}</p>}
    </section>
  );
}
