import { NextResponse, type NextRequest } from "next/server";
import { checkCurrentPassword, PASSWORD_MESSAGES, requireAccountUser } from "@/lib/account";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const account = await requireAccountUser();
  if (!account) return fail(403, "Log opnieuw in en rond de tweestapsverificatie af.");
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const current = String(body.current ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail(400, "Vul een geldig e-mailadres in.");
  if (email === account.email.toLowerCase()) return fail(400, "Dit is al je huidige e-mailadres.");
  if (!current) return fail(400, "Vul je huidige wachtwoord in.");
  const check = await checkCurrentPassword(account.user.id, account.email, current);
  if (check !== "ok") return fail(...PASSWORD_MESSAGES[check]);
  const { error } = await account.supabase.auth.updateUser({ email });
  // Een adres dat al bestaat krijgt hetzelfde antwoord, zodat niemand zo kan achterhalen wie een account heeft.
  if (error && error.code !== "email_exists") return fail(error.status === 429 ? 429 : 400, error.status === 429 ? "Er zijn net te veel mails verstuurd. Probeer het later opnieuw." : "Aanvragen is niet gelukt. Probeer het opnieuw.");
  return NextResponse.json({ ok: true });
}
