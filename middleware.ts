import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, supabaseKey, supabaseUrl } from "@/lib/config";

// Ververst de inlogsessie. De echte toegangscontrole zit in de database.
export async function middleware(request: NextRequest) {
  // voorstel.todayonline.nl toont alleen voorstellen, nooit de leadtool of de inlog.
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (host === (process.env.PROPOSAL_HOST ?? "voorstel.todayonline.nl")) {
    const { pathname } = request.nextUrl;
    if (pathname === "/logo.png") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/v/onbekend" : pathname.startsWith("/v/") ? pathname : "/v" + pathname;
    return NextResponse.rewrite(url);
  }
  let response = NextResponse.next({ request });
  if (!isConfigured) return response;
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
