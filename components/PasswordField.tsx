"use client";
import { useState } from "react";
import { passwordMessage } from "@/lib/password";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  checkRules?: boolean;
  current?: boolean;
};

export default function PasswordField({ id, label, value, onChange, hint, checkRules = false, current = false }: Props) {
  const [visible, setVisible] = useState(false);
  const problem = checkRules && value ? passwordMessage(value) : "";
  return (
    <div className="q">
      <label htmlFor={id}>{label}</label>
      <div className="password-wrap">
        <input id={id} type={visible ? "text" : "password"} autoComplete={current ? "current-password" : "new-password"} required minLength={current ? undefined : 10} value={value} onChange={(e) => onChange(e.target.value)} />
        <button className="password-toggle" type="button" aria-label={visible ? label + " verbergen" : label + " tonen"} aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
      {problem && <p className="field-error" role="status">{problem}</p>}
    </div>
  );
}
