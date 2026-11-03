"use client";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NewPasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) { setError("Kies een wachtwoord van minstens 10 tekens."); return; }
    const { error: err } = await createClient().auth.updateUser({ password });
    if (err) { setError("Opslaan is niet gelukt. Vraag een nieuwe link aan of kies een sterker wachtwoord."); return; }
    window.location.href = "/";
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Kies een wachtwoord</h2>
      <div className="q"><label htmlFor="password">Nieuw wachtwoord</label><input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} /><p className="hint">Minstens 10 tekens.</p></div>
      <p className={"status" + (error ? " err" : "")} role="status">{error}</p>
      <button className="btn" type="submit">Opslaan</button>
    </form>
  );
}
