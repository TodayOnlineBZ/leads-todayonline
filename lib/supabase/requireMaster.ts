import { createClient } from "@/lib/supabase/server";

// De database controleert rol, status en na migratie 0005 ook of de sessie 2FA heeft.
export async function requireMaster() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel !== "aal2") return null;
  const { data: isMaster, error } = await supabase.rpc("is_master");
  return !error && isMaster === true ? user : null;
}
