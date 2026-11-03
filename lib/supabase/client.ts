import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "@/lib/config";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey);
}
