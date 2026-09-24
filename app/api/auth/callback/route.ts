import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { safeNextPath } from "@/lib/auth/safe-next-path";

/**
 * Supabase Auth email-link landing.
 * Handles both PKCE `?code=` and legacy `?token_hash=&type=` confirm links.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"), "/connect");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.redirect(new URL("/login?error=config", url.origin));
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL(next, url.origin));

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        toSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession:", error.message);
      return NextResponse.redirect(
        new URL(`/dogrula-email?error=${encodeURIComponent("link")}`, url.origin),
      );
    }
    return response;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "email" | "recovery" | "invite" | "magiclink" | "email_change",
      token_hash: tokenHash,
    });
    if (error) {
      console.error("[auth/callback] verifyOtp:", error.message);
      return NextResponse.redirect(
        new URL(`/dogrula-email?error=${encodeURIComponent("link")}`, url.origin),
      );
    }
    return response;
  }

  return NextResponse.redirect(new URL("/dogrula-email?error=link", url.origin));
}
