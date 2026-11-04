"use client";
import BusyButton, { LoadingNote, SignOutButton } from "@/components/BusyButton";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { factorId: string; qr: string; secret: string };

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";
  return /^\/(?![\/\\])/.test(next) ? next : "/";
}

// Supabase levert een SVG als data-adres; correct gecodeerd laadt die in elke browser.
function qrSource(qr: string) {
  const marker = "data:image/svg+xml;utf-8,";
  return qr.startsWith(marker) ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr.slice(marker.length)) : qr;
}

export default function TwoFactorPage() {
  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [factorId, setFactorId] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { window.location.href = "/login"; return; }
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.currentLevel === "aal2") { window.location.href = nextPath(); return; }
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError || !factors) { if (!cancelled) { setError("2FA kon niet worden geladen. Ververs de pagina."); setMode("verify"); } return; }
      const verified = factors.totp.find((f) => f.status === "verified");
      if (verified) { if (!cancelled) { setFactorId(verified.id); setMode("verify"); } return; }
      // Ruim een eerdere, niet afgeronde poging op voordat je een nieuwe QR-code maakt.
      for (const f of factors.all.filter((x) => x.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator-app" });
      if (cancelled) return;
      if (enrollError || !data) { setError("De QR-code kon niet worden gemaakt. Ververs de pagina."); setMode("enroll"); return; }
      setFactorId(data.id);
      setEnrollment({ factorId: data.id, qr: qrSource(data.totp.qr_code), secret: data.totp.secret });
      setMode("enroll");
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) { setError("Vul de code van 6 cijfers uit je app in."); return; }
    setBusy(true); setError("");
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: clean });
    if (verifyError) { setBusy(false); setCode(""); setError("Deze code klopt niet of is verlopen. Vul de nieuwste code uit je app in."); return; }
    window.location.href = nextPath();
  }

  if (mode === "loading") return <div className="panel"><h2>Tweestapsverificatie</h2><p><LoadingNote text="Laden" /></p></div>;

  return (
    <div className="panel">
    <form className="panel" onSubmit={submit}>
      {mode === "enroll" ? (
        <>
          <h2>Stel tweestapsverificatie in</h2>
          <p>Dit is verplicht om je gegevens te beschermen. Je hoeft dit maar één keer in te stellen.</p>
          <ol className="steps-2fa">
            <li>Installeer een authenticator-app op je telefoon, zoals Google Authenticator of Microsoft Authenticator.</li>
            <li>Scan deze QR-code met de app.</li>
            <li>Vul de code van 6 cijfers uit de app hieronder in.</li>
          </ol>
          {enrollment && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qr-2fa" src={enrollment.qr} alt="QR-code voor je authenticator-app" width="200" height="200" />
              <details className="breakdown">
                <summary>Lukt scannen niet?</summary>
                <p className="hint">Voer deze sleutel handmatig in je app in:</p>
                <code className="secret-2fa">{enrollment.secret}</code>
              </details>
            </>
          )}
        </>
      ) : (
        <>
          <h2>Vul je code in</h2>
          <p>Open je authenticator-app en vul de code van 6 cijfers in.</p>
        </>
      )}
      <div className="q">
        <label htmlFor="code">Code uit je app</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <p className={"status" + (error ? " err" : "")} role="status">{error}</p>
      <BusyButton className="btn" type="submit" busy={busy} disabled={!factorId} busyText="Controleren…">{mode === "enroll" ? "Activeren" : "Bevestigen"}</BusyButton>
      {mode === "verify" && <p className="hint">Telefoon kwijt? Vraag Bart om je tweestapsverificatie te resetten.</p>}
    </form>
    <SignOutButton className="link" />
    </div>
  );
}
