"use client";

/**
 * Client-side route guard (defense in depth alongside proxy.ts).
 *
 * Session cookies are set by createBrowserClient (@supabase/ssr).
 * Proxy enforces auth on the server; this guard covers client navigations.
 *
 * - Valid user  → render children
 * - No user     → /login?next=<current path>
 * - No Supabase → open (demo / clone without keys)
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { allowUnauthedDemoBypass, getSupabaseClient } from "@/lib/supabase/client";

type Status = "checking" | "authed" | "guest" | "misconfigured";

function loginUrlFor(pathname: string | null): string {
  if (!pathname || pathname === "/login" || pathname === "/signup") return "/login";
  return `/login?next=${encodeURIComponent(pathname)}`;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      if (allowUnauthedDemoBypass()) {
        setStatus("authed");
      } else {
        setStatus("misconfigured");
      }
      return;
    }

    let active = true;

    function goLogin() {
      setStatus("guest");
      router.replace(loginUrlFor(pathnameRef.current));
    }

    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data.user) {
          if (!data.user.email_confirmed_at) {
            setStatus("guest");
            router.replace(
              `/dogrula-email${data.user.email ? `?email=${encodeURIComponent(data.user.email)}` : ""}`,
            );
            return;
          }
          setStatus("authed");
        } else {
          goLogin();
        }
      })
      .catch(() => {
        if (active) goLogin();
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "TOKEN_REFRESHED") return;
      if (session?.user) {
        if (!session.user.email_confirmed_at) {
          setStatus("guest");
          router.replace(
            `/dogrula-email${session.user.email ? `?email=${encodeURIComponent(session.user.email)}` : ""}`,
          );
          return;
        }
        setStatus("authed");
      } else if (event === "SIGNED_OUT") {
        goLogin();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (status === "checking") {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="inline-block w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse" />
          Oturum doğrulanıyor…
        </div>
      </div>
    );
  }

  if (status === "misconfigured") {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center px-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Kimlik doğrulama yapılandırılmamış. Lütfen daha sonra tekrar deneyin.
        </p>
      </div>
    );
  }

  if (status === "guest") {
    return null;
  }

  return <>{children}</>;
}
