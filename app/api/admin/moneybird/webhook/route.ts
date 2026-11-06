import { NextResponse, type NextRequest } from "next/server";
import { createWebhook, listWebhooks, moneybirdReady } from "@/lib/moneybird";
import { syncOpenEstimates } from "@/lib/moneybirdSync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const target = (request: NextRequest) => `${request.nextUrl.origin}/api/moneybird/webhook`;

async function active(request: NextRequest) {
  const admin = createAdminClient();
  const { data } = await admin.from("moneybird_webhooks").select("id, url");
  const mine = (data ?? []).filter((h) => h.url === target(request));
  if (!mine.length) return false;
  const remote = await listWebhooks();
  return remote.some((r) => mine.some((h) => h.id === String(r.id)) && r.url === target(request));
}

export async function GET(request: NextRequest) {
  if (!(await requireMaster())) return fail(403, "Geen toegang.");
  if (!moneybirdReady()) return NextResponse.json({ ready: false, active: false });
  try { return NextResponse.json({ ready: true, active: await active(request) }); }
  catch (e) { return fail(502, e instanceof Error ? e.message : "Moneybird is nu niet bereikbaar."); }
}

// Meldt de leadtool één keer aan bij Moneybird en haalt meteen de huidige stand op.
export async function POST(request: NextRequest) {
  if (!(await requireMaster())) return fail(403, "Geen toegang.");
  if (!moneybirdReady()) return fail(400, "De Moneybird-gegevens ontbreken nog in Vercel.");
  if (!target(request).startsWith("https://") && !process.env.MONEYBIRD_API_URL) return fail(400, "Dit kan alleen vanaf het echte adres van de leadtool.");
  const admin = createAdminClient();
  // Ook als aanmelden niet lukt, worden de offertes wel gecontroleerd.
  let linkError = "";
  try {
    if (!(await active(request))) {
      const hook = await createWebhook(target(request));
      if (!hook?.id || !hook.token) return fail(502, "Moneybird gaf geen bevestiging terug.");
      const { error } = await admin.from("moneybird_webhooks").upsert({ id: String(hook.id), token: hook.token, url: target(request) });
      if (error) return fail(500, "De koppeling staat in Moneybird, maar kon hier niet worden opgeslagen. Probeer het opnieuw.");
    }
  } catch (e) {
    linkError = e instanceof Error ? e.message : "Moneybird is nu niet bereikbaar.";
  }
  try {
    const result = await syncOpenEstimates(admin);
    if (linkError) return NextResponse.json({ error: `${linkError} De offertes zijn wel nu gecontroleerd: ${result.checked} bekeken, ${result.changed} verkoopstatus${result.changed === 1 ? "" : "sen"} bijgewerkt.` }, { status: 502 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return fail(502, linkError || (e instanceof Error ? e.message : "Moneybird is nu niet bereikbaar."));
  }
}
