"use client";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type FormEvent } from "react";

const TIMEOUT_MS = 90_000;

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

// Toont pas iets als het laden echt even duurt, zodat de cirkel niet flitst.
export function LoadingNote({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(timer);
  }, []);
  return <span className="loading-note" role="status" aria-live="polite">{show && <><Spinner />{text}</>}</span>;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  // Voert de actie uit en houdt zelf de laadstatus bij. Een klik tijdens het laden doet niets.
  onAction?: () => unknown;
  // Voor knoppen waarvan het formulier of de pagina de laadstatus al bijhoudt.
  busy?: boolean;
  busyText?: string;
};

export default function BusyButton({ onAction, busy = false, busyText = "Bezig…", children, disabled, onClick, ...rest }: Props) {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState("");
  const active = busy || pending;

  async function run() {
    if (running.current || !onAction) return;
    setFailed("");
    running.current = true;
    try {
      const result = onAction();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setPending(true);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS); });
        try { await Promise.race([result, timeout]); } finally { clearTimeout(timer); }
      }
    } catch (e) {
      console.error("Actie mislukt:", e instanceof Error ? e.message : e);
      setFailed(e instanceof Error && e.message === "timeout" ? "Dit duurt te lang. Ververs de pagina en controleer of het is gelukt." : "Dat is niet gelukt. Controleer je verbinding en probeer het opnieuw.");
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button {...rest} disabled={disabled || active} aria-busy={active || undefined} onClick={onAction ? () => void run() : onClick}>
        <span className="btn-stack">
          <span className={"btn-face" + (active ? " off" : "")}>{children}</span>
          <span className={"btn-face" + (active ? "" : " off")}><Spinner />{busyText}</span>
        </span>
      </button>
      {failed && <span className="status err btn-error" role="status">{failed}</span>}
    </>
  );
}

export function SignOutButton({ className = "btn alt" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setBusy(false), 15_000);
    return () => clearTimeout(timer);
  }, [busy]);
  // De browser verstuurt het formulier zelf; hier wordt alleen de dubbele klik tegengehouden.
  const start = (e: FormEvent) => { if (busy) e.preventDefault(); else setBusy(true); };
  return <form action="/auth/signout" method="post" onSubmit={start}><BusyButton className={className} type="submit" busy={busy} busyText="Uitloggen…">Uitloggen</BusyButton></form>;
}
