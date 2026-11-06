import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "@/lib/config";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey, {
    // Een hangend verzoek mag nooit een knop blijven laten draaien.
    global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(String(url).includes("/storage/v1/object/lead-files") ? 600_000 : 60_000) }) },
  });
}
