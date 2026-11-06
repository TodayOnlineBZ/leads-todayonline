import { redirect } from "next/navigation";
import MoneybirdLink from "@/components/MoneybirdLink";
import SettingsForms from "@/components/SettingsForms";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("name, status, role").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active") redirect("/wachten");
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel !== "aal2") redirect("/2fa?next=/instellingen");
  const { email: result } = await searchParams;
  return (
    <>
      <header className="top gutter"><div className="inner wide">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo.png" alt="TodayOnline" width="660" height="132" />
        <h1>Instellingen</h1>
      </div></header>
      <main className="gutter"><div className="inner settings">
        <a className="btn alt small settings-back" href="/">← Terug naar het leadsysteem</a>
        <SettingsForms name={profile.name} email={user.email ?? ""} pendingEmail={user.new_email ?? null} result={result === "fout" ? "fout" : result === "bevestigd" ? "bevestigd" : null} />
        {profile.role === "master" && <MoneybirdLink />}
      </div></main>
    </>
  );
}
