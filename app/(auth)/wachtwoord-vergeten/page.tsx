"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import Turnstile from "@/components/Turnstile";
import { turnstileSiteKey } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (turnstileSiteKey && !token) { setMessage("Wacht tot de beveiligingscontrole klaar is."); setIsError(true); return; }
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      captchaToken: token || undefined,
      redirectTo: window.location.origin + "/wachtwoord",
    });
    setResetKey((k) => k + 1);
    setIsError(Boolean(error));
    setMessage(error ? "Dat is niet gelukt. Probeer het later opnieuw." : "Als dit adres bij ons bekend is, ontvang je een e-mail met een link.");
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Wachtwoord vergeten</h2>
      <div className="q"><label htmlFor="email">E-mailadres</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <Turnstile onToken={setToken} resetKey={resetKey} />
      <p className={"status" + (isError ? " err" : "")} role="status">{message}</p>
      <button className="btn" type="submit">Stuur de link</button>
      <p className="switch"><Link className="link" href="/login">Terug naar inloggen</Link></p>
    </form>
  );
}
