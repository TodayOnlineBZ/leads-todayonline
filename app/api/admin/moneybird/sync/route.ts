import { NextResponse, type NextRequest } from "next/server";
import { moneybirdReady } from "@/lib/moneybird";
import { syncOpenEstimates } from "@/lib/moneybirdSync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMaster } from "@/lib/supabase/requireMaster";

// Haalt de stand van de offertes op, voor het geval een melding van Moneybird is gemist.
export async function POST(request: NextRequest) {
  const master = await requireMaster();
  if (!master) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  if (!moneybirdReady()) return NextResponse.json({ checked: 0, changed: 0 });
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await syncOpenEstimates(createAdminClient(), body.leadId ? String(body.leadId) : undefined));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Moneybird is nu niet bereikbaar." }, { status: 502 });
  }
}
