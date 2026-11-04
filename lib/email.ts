const APP_URL = (process.env.APP_URL ?? "https://leads.todayonline.nl").replace(/\/$/, "");
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? "bart@todayonline.nl";
const FROM = "TodayOnline <no-reply@todayonline.nl>";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function layout(title: string, paragraphs: string[], button: string, link: string) {
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;${font}font-size:16px;line-height:24px;color:#15261e;">${p}</p>`).join("");
  return `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background-color:#f5f7f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7f4;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #d5ddd7;border-radius:8px;border-collapse:separate;">
<tr><td style="background-color:#0f3d2e;padding:24px 32px;border-radius:8px 8px 0 0;"><div style="${font}font-size:18px;line-height:22px;font-weight:bold;color:#f5f7f4;">Today<span style="color:#f6a266;">Online</span></div><div style="${font}font-size:14px;line-height:20px;color:#f5f7f4;padding-top:2px;">Leadsysteem</div></td></tr>
<tr><td style="padding:32px;"><h1 style="margin:0 0 16px;${font}font-size:24px;line-height:30px;font-weight:bold;color:#15261e;">${title}</h1>${body}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td bgcolor="#0f3d2e" style="border-radius:6px;"><a href="${link}" style="display:inline-block;padding:12px 20px;${font}font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${button}</a></td></tr></table>
</td></tr></table></td></tr></table></body></html>`;
}

// Geeft false terug als de mail niet weg kon. De aanroeper bepaalt wat dat betekent.
async function send(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error("Mail niet verstuurd: RESEND_API_KEY ontbreekt"); return false; }
  try {
    const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("Mail niet verstuurd: Resend gaf status", res.status);
    return res.ok;
  } catch {
    console.error("Mail niet verstuurd: Resend was niet bereikbaar");
    return false;
  }
}

export function sendApprovedEmail(to: string, name: string) {
  const link = `${APP_URL}/login`;
  return send(to, "Je account is goedgekeurd",
    layout("Je account is goedgekeurd", [`Hoi ${escapeHtml(name)},`, "Bart heeft je account voor het leadsysteem van TodayOnline geactiveerd. Je kunt nu inloggen en aan de slag."], "Inloggen", link),
    `Hoi ${name},\n\nBart heeft je account voor het leadsysteem van TodayOnline geactiveerd. Log in via ${link}`);
}

export function sendPendingNotification(name: string, email: string) {
  const link = `${APP_URL}/`;
  return send(NOTIFY_EMAIL, "Nieuw account wacht op goedkeuring",
    layout("Nieuw account wacht op goedkeuring", [`<strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) heeft een account aangemaakt en het e-mailadres bevestigd.`, "Keur het account goed of weiger het onder het tabblad Gebruikers."], "Naar het leadsysteem", link),
    `${name} (${email}) heeft een account aangemaakt en het e-mailadres bevestigd. Keur het account goed of weiger het onder Gebruikers: ${link}`);
}

export function sendPasswordChangedEmail(to: string) {
  const link = `${APP_URL}/login`;
  return send(to, "Je wachtwoord is gewijzigd",
    layout("Je wachtwoord is gewijzigd", ["Het wachtwoord van je account voor het leadsysteem van TodayOnline is zojuist gewijzigd.", "Was jij dit niet? Neem dan direct contact op met Bart via bart@todayonline.nl."], "Inloggen", link),
    `Het wachtwoord van je account voor het leadsysteem van TodayOnline is zojuist gewijzigd. Was jij dit niet? Neem dan direct contact op met Bart via bart@todayonline.nl.`);
}
