"use client";
import { useState, type FormEvent } from "react";
import PasswordField from "@/components/PasswordField";
import { passwordMessage } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";

export default function NewPasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordMessage(password);
    if (problem) { setError(problem); return; }
    const { error: err } = await createClient().auth.updateUser({ password });
    if (err) { setError("Opslaan is niet gelukt. Vraag een nieuwe link aan of kies een sterker wachtwoord."); return; }
    window.location.href = "/";
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Kies een wachtwoord</h2>
      <PasswordField id="password" label="Nieuw wachtwoord" value={password} onChange={setPassword} hint="Minstens 10 tekens, met 1 cijfer en 1 speciaal teken." checkRules />
      <p className={"status" + (error ? " err" : "")} role="status">{error}</p>
      <button className="btn" type="submit">Opslaan</button>
    </form>
  );
}
