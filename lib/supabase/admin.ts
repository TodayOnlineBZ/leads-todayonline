import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/config";

// Omzeilt alle rechten. Alleen gebruiken in serverroutes, na de mastercontrole.
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!secret) throw new Error("SUPABASE_SECRET_KEY ontbreekt");
  return createClient(supabaseUrl, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
