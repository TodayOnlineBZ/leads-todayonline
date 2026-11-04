import { createClient as createPlainClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

// Alleen de ingelogde gebruiker zelf, goedgekeurd en met voltooide tweestapsverificatie.
export async function requireAccountUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel !== "aal2") return null;
  const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (profile?.status !== "active") return null;
  return { supabase, user, email: user.email };
}

export type PasswordCheck = "ok" | "wrong" | "blocked" | "unavailable";

// Controleert het wachtwoord met een losse sessie, die meteen weer wordt ingetrokken.
export async function checkCurrentPassword(userId: string, email: string, password: string): Promise<PasswordCheck> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error: countError } = await admin.from("password_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if (countError) return "unavailable";
  if ((count ?? 0) >= MAX_FAILURES) return "blocked";
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const temp = createPlainClient(supabaseUrl, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await temp.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    // Alleen een echte foute invoer telt als poging; een storing niet.
    if (error && error.status !== 400) return "unavailable";
    await admin.from("password_attempts").insert({ user_id: userId });
    return (count ?? 0) + 1 >= MAX_FAILURES ? "blocked" : "wrong";
  }
  await admin.auth.admin.signOut(data.session.access_token, "local");
  await admin.from("password_attempts").delete().eq("user_id", userId);
  return "ok";
}

export const PASSWORD_MESSAGES: Record<Exclude<PasswordCheck, "ok">, [number, string]> = {
  wrong: [400, "Je huidige wachtwoord klopt niet."],
  blocked: [429, "Te veel foute pogingen. Probeer het over 15 minuten opnieuw."],
  unavailable: [503, "Het controleren is nu niet gelukt. Probeer het later opnieuw."],
};
