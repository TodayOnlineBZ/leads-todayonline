import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Verwerkt de links uit de e-mails: bevestigen, uitnodigen en wachtwoord herstellen.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  // Alleen paden binnen deze app, zodat een link niet naar een andere site kan sturen.
  const next = /^\/(?![\/\\])/.test(nextParam) ? nextParam : "/";
  const supabase = await createClient();
  let failed = true;
  if (tokenHash && type) failed = Boolean((await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error);
  else if (code) failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  return NextResponse.redirect(origin + (failed ? "/login?fout=link" : next));
}
