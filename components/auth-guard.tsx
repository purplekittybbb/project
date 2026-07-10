"use client";

/**
 * Client-side route guard.
 *
 * Because auth runs in the browser (supabase-js persists the session in
 * localStorage), protection is enforced here rather than in middleware.
 *
 * - Session present  → render the protected content.
 * - No session       → redirect to /login.
 * - Supabase not configured (no env keys) → treat as open (demo mode) so the
 *   app still works for anyone who cloned the repo without keys.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

type Status = "checking" | "authed" | "guest";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const supabase = getSupabaseClient();

    // Demo mode: no keys → don't block access.
    if (!supabase) {
      setStatus("authed");
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setStatus("authed");
      } else {
        setStatus("guest");
        router.replace("/login");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        setStatus("authed");
      } else {
        setStatus("guest");
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (status === "checking") {
    return (
      <div className="h-screen w-full bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">
          <span className="inline-block w-1.5 h-1.5 bg-zinc-600 animate-pulse" />
          Verifying session
        </div>
      </div>
    );
  }

  if (status === "guest") {
    // Redirect already dispatched; render nothing to avoid a flash of content.
    return null;
  }

  return <>{children}</>;
}
