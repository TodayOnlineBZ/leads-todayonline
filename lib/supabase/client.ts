import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "@/lib/config";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey, {
    // Een hangend verzoek mag nooit een knop blijven laten draaien.
    global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(60_000) }) },
  });
}
