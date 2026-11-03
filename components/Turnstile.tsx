"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import { turnstileSiteKey } from "@/lib/config";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

// resetKey verhogen vraagt een nieuwe controle aan; een token werkt maar één keer.
export default function Turnstile({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  const mount = useCallback(() => {
    if (!box.current || !window.turnstile || widget.current || !turnstileSiteKey) return;
    widget.current = window.turnstile.render(box.current, {
      sitekey: turnstileSiteKey,
      language: "nl",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
  }, [onToken]);

  useEffect(() => {
    mount();
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [mount]);

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
      onToken("");
    }
  }, [resetKey, onToken]);

  if (!turnstileSiteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={mount} />
      <div ref={box} />
    </>
  );
}
