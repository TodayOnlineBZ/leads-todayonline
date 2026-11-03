import { redirect } from "next/navigation";
import LeadApp from "@/components/LeadApp";
import { isConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isConfigured) {
    return (
      <div className="gutter"><div className="login">
        <h2>Nog niet gekoppeld</h2>
        <p>De app staat online, maar Supabase is nog niet gekoppeld. Volg de stappen in de README.</p>
      </div></div>
    );
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id, name, email, role, status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active") redirect("/wachten");
  return <LeadApp me={profile} />;
}
