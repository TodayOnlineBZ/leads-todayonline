"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Turnstile from "@/components/Turnstile";
import { turnstileSiteKey } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("fout") === "link") {
      setError("Deze link is verlopen of al gebruikt. Log in of vraag een nieuwe link aan.");
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (turnstileSiteKey && !token) { setError("Wacht tot de beveiligingscontrole klaar is."); return; }
    setBusy(true); setError("");
    const { error: err } = await createClient().auth.signInWithPassword({ email, password, options: { captchaToken: token || undefined } });
    setBusy(false);
    if (err) {
      setError(/not confirmed/i.test(err.message) ? "Bevestig eerst je e-mailadres via de link in je mail." : "Dit e-mailadres of wachtwoord klopt niet.");
      setResetKey((k) => k + 1);
      return;
    }
    window.location.href = "/";
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Inloggen</h2>
      <div className="q"><label htmlFor="email">E-mailadres</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="q"><label htmlFor="password">Wachtwoord</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <Turnstile onToken={setToken} resetKey={resetKey} />
      <p className={"status" + (error ? " err" : "")} role="status">{error}</p>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Bezig met inloggen" : "Inloggen"}</button>
      <p className="switch"><Link className="link" href="/wachtwoord-vergeten">Wachtwoord vergeten?</Link></p>
      <p className="switch">Nog geen account? <Link className="link" href="/registreren">Account aanmaken</Link></p>
    </form>
  );
}
