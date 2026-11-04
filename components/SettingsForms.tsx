"use client";
import { useState, type FormEvent } from "react";
import PasswordField from "@/components/PasswordField";
import { passwordMessage } from "@/lib/password";

type Message = { text: string; error: boolean };
const EMPTY: Message = { text: "", error: false };

async function post(url: string, body: unknown) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, error: String(data.error ?? "Dat is niet gelukt. Probeer het opnieuw."), data };
  } catch {
    return { ok: false, error: "Geen verbinding. Probeer het opnieuw.", data: {} };
  }
}

export default function SettingsForms({ name, email, pendingEmail, result }: { name: string; email: string; pendingEmail: string | null; result: "bevestigd" | "fout" | null }) {
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState(EMPTY);
  const [emailBusy, setEmailBusy] = useState(false);
  const [requested, setRequested] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [passwordResult, setPasswordResult] = useState(EMPTY);
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    const res = await post("/api/account/email", { email: newEmail, current: emailPassword });
    setEmailBusy(false);
    if (!res.ok) { setEmailMessage({ text: res.error, error: true }); return; }
    setRequested(newEmail.trim());
    setNewEmail(""); setEmailPassword("");
    setEmailMessage({ text: `Bevestig de wijziging via de link in de mail naar ${newEmail.trim()}. Krijg je ook een mail op je huidige adres, bevestig die dan ook. Tot die tijd blijft je huidige adres gelden.`, error: false });
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    const problem = passwordMessage(next);
    if (problem) { setPasswordResult({ text: problem, error: true }); return; }
    if (next !== repeat) { setPasswordResult({ text: "De twee nieuwe wachtwoorden zijn niet gelijk.", error: true }); return; }
    if (next === current) { setPasswordResult({ text: "Kies een nieuw wachtwoord dat afwijkt van je huidige.", error: true }); return; }
    setPasswordBusy(true);
    const res = await post("/api/account/password", { current, next, repeat });
    setPasswordBusy(false);
    if (!res.ok) { setPasswordResult({ text: res.error, error: true }); return; }
    setCurrent(""); setNext(""); setRepeat("");
    setPasswordResult({ text: res.data.othersSignedOut ? "Je wachtwoord is gewijzigd. Je bent op andere apparaten uitgelogd." : "Je wachtwoord is gewijzigd. Uitloggen op andere apparaten is niet gelukt, dus log daar zelf uit.", error: false });
  }
  const pending = requested ?? pendingEmail;
  return (
    <div className="settings-grid">
      <section className="notes" aria-labelledby="accountTitle">
        <h2 id="accountTitle">Jouw account</h2>
        <dl className="read-list">
          <div><dt>Naam</dt><dd className="read-value">{name}</dd></div>
          <div><dt>E-mailadres</dt><dd className="read-value" id="currentEmail">{email}</dd></div>
        </dl>
        {result === "fout" && <p className="warn-box" role="status">De bevestigingslink is ongeldig of verlopen. Vraag de wijziging opnieuw aan.</p>}
        {result === "bevestigd" && !pendingEmail && <p className="status" role="status">Je e-mailadres is gewijzigd. Log voortaan in met {email}.</p>}
        {result === "bevestigd" && pendingEmail && <p className="status" role="status">Deze link is bevestigd. Open ook de bevestigingslink in de andere mail.</p>}
        {pending && <p className="hint" id="pendingEmail">Wacht op bevestiging: {pending}</p>}
      </section>
      <form className="notes" aria-labelledby="emailTitle" noValidate onSubmit={changeEmail}>
        <h2 id="emailTitle">E-mailadres wijzigen</h2>
        <div className="q"><label htmlFor="newEmail">Nieuw e-mailadres</label><input id="newEmail" type="email" autoComplete="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
        <PasswordField id="emailPassword" label="Huidig wachtwoord" value={emailPassword} onChange={setEmailPassword} current />
        <div className="actions"><button className="btn" type="submit" disabled={emailBusy}>{emailBusy ? "Bezig" : "E-mailadres wijzigen"}</button></div>
        {emailMessage.text && <p className={"status" + (emailMessage.error ? " err" : "")} id="emailStatus" role="status">{emailMessage.text}</p>}
      </form>
      <form className="notes" aria-labelledby="passwordTitle" noValidate onSubmit={changePassword}>
        <h2 id="passwordTitle">Wachtwoord wijzigen</h2>
        <PasswordField id="currentPassword" label="Huidig wachtwoord" value={current} onChange={setCurrent} current />
        <PasswordField id="newPassword" label="Nieuw wachtwoord" value={next} onChange={setNext} hint="Minstens 10 tekens, met 1 cijfer en 1 speciaal teken." checkRules />
        <PasswordField id="repeatPassword" label="Herhaal nieuw wachtwoord" value={repeat} onChange={setRepeat} />
        <div className="actions"><button className="btn" type="submit" disabled={passwordBusy}>{passwordBusy ? "Bezig" : "Wachtwoord wijzigen"}</button></div>
        {passwordResult.text && <p className={"status" + (passwordResult.error ? " err" : "")} id="passwordStatus" role="status">{passwordResult.text}</p>}
      </form>
    </div>
  );
}
