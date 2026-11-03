import { createClient } from "@/lib/supabase/server";

export async function requireMaster() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  return profile?.role === "master" && profile?.status === "active" ? user : null;
}
