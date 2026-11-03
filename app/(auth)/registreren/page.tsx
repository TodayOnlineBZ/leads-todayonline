"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import PasswordField from "@/components/PasswordField";
import Turnstile from "@/components/Turnstile";
import { turnstileSiteKey } from "@/lib/config";
import { passwordMessage } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Vul je naam in."); return; }
    const problem = passwordMessage(password);
    if (problem) { setError(problem); return; }
    if (password !== passwordRepeat) { setError("De twee wachtwoorden zijn niet hetzelfde. Vul ze opnieuw in."); return; }
    if (turnstileSiteKey && !token) { setError("Wacht tot de beveiligingscontrole klaar is."); return; }
    setBusy(true); setError("");
    const { error: err } = await createClient().auth.signUp({
      email, password,
      options: { data: { name: name.trim() }, captchaToken: token || undefined, emailRedirectTo: window.location.origin + "/auth/confirm" },
    });
    setBusy(false);
    if (err) {
      setError(/rate limit/i.test(err.message) ? "Er zijn te veel aanmeldingen tegelijk. Probeer het later opnieuw." : /password/i.test(err.message) ? "Dit wachtwoord is niet sterk genoeg. Kies een langer of minder voor de hand liggend wachtwoord." : "Account aanmaken is niet gelukt. Controleer je gegevens en probeer het opnieuw.");
      setResetKey((k) => k + 1);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="panel">
        <span className="eyebrow">Stap 1 van 2</span>
        <h2>Bevestig je e-mailadres</h2>
        <p>We hebben een bevestigingslink gestuurd naar <strong>{email}</strong>. Klik op de link om verder te gaan. Daarna activeert Bart je account.</p>
        <p className="switch"><Link className="link" href="/login">Terug naar inloggen</Link></p>
      </div>
    );
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h2>Account aanmaken</h2>
      <p className="hint">Na het aanmaken bevestig je je e-mailadres. Daarna activeert Bart je account.</p>
      <div className="q"><label htmlFor="name">Naam</label><input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="q"><label htmlFor="email">E-mailadres</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <PasswordField id="password" label="Wachtwoord" value={password} onChange={setPassword} hint="Minstens 10 tekens, met 1 cijfer en 1 speciaal teken." checkRules />
      <PasswordField id="passwordRepeat" label="Herhaal wachtwoord" value={passwordRepeat} onChange={setPasswordRepeat} />
      <Turnstile onToken={setToken} resetKey={resetKey} />
      <p className={"status" + (error ? " err" : "")} role="status">{error}</p>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Bezig met aanmaken" : "Account aanmaken"}</button>
      <p className="switch">Heb je al een account? <Link className="link" href="/login">Inloggen</Link></p>
    </form>
  );
}
