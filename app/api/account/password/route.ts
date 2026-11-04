import { NextResponse, type NextRequest } from "next/server";
import { checkCurrentPassword, PASSWORD_MESSAGES, requireAccountUser } from "@/lib/account";
import { sendPasswordChangedEmail } from "@/lib/email";
import { passwordMessage } from "@/lib/password";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const account = await requireAccountUser();
  if (!account) return fail(403, "Log opnieuw in en rond de tweestapsverificatie af.");
  const body = await request.json().catch(() => ({}));
  const current = String(body.current ?? ""), next = String(body.next ?? ""), repeat = String(body.repeat ?? "");
  if (!current) return fail(400, "Vul je huidige wachtwoord in.");
  const problem = passwordMessage(next);
  if (problem) return fail(400, problem);
  if (next !== repeat) return fail(400, "De twee nieuwe wachtwoorden zijn niet gelijk.");
  if (next === current) return fail(400, "Kies een nieuw wachtwoord dat afwijkt van je huidige.");
  const check = await checkCurrentPassword(account.user.id, account.email, current);
  if (check !== "ok") return fail(...PASSWORD_MESSAGES[check]);
  const { error } = await account.supabase.auth.updateUser({ password: next });
  if (error) return fail(400, error.code === "weak_password" ? "Dit wachtwoord is te zwak of komt voor in gelekte lijsten. Kies een ander." : "Wijzigen is niet gelukt. Probeer het opnieuw.");
  const others = await account.supabase.auth.signOut({ scope: "others" });
  await sendPasswordChangedEmail(account.email);
  return NextResponse.json({ ok: true, othersSignedOut: !others.error });
}
