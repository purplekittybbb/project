"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";
import type { ToolDefinition } from "@/lib/tools/registry";
import { buildConnectUrl } from "@/lib/tools/store-gate";

type GateState = "loading" | "anonymous" | "no-store" | "ready";

export function StoreRequiredGate({ tool }: { tool: ToolDefinition }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("loading");
  const connectHref = buildConnectUrl(tool.href);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isAuthConfigured()) {
        if (!cancelled) setState("anonymous");
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        if (!cancelled) setState("anonymous");
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        if (!cancelled) setState("anonymous");
        return;
      }

      const res = await fetch("/api/marketplace/credentials-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { marketplaces?: string[]; connections?: unknown[] };
      const hasStore =
        (json.connections?.length ?? 0) > 0 || (json.marketplaces?.length ?? 0) > 0;

      if (!cancelled) setState(hasStore ? "ready" : "no-store");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(tool.href)}`);
    }
  }, [state, router, tool.href]);

  if (state === "loading" || state === "anonymous") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }

  if (state === "no-store") {
    return (
      <div className="mx-auto max-w-xl">
        <span className="inline-flex rounded-full border border-[var(--tm-copper)]/30 bg-[var(--tm-copper)]/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--tm-copper)]">
          Mağaza Gerekli
        </span>
        <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-foreground">{tool.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{tool.description}</p>
        <div className="mt-8 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-6">
          <p className="text-sm font-medium text-foreground">Bu özellik için mağazanızı bağlayın</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Net kâr, zarar alarmı ve liste kalitesi gerçek satış verinizle çalışır. Trendyol, Hepsiburada
            veya N11 hesabınızı bir kez bağlamanız yeterli.
          </p>
          <Link
            href={connectHref}
            className="tm-btn-primary mt-6 inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
          >
            Mağazayı bağla
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">{tool.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{tool.description}</p>
      <div className="mt-8 rounded-[var(--tm-r-ui)] border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-sm text-emerald-900">Mağazanız bağlı. Bu aracı panelde kullanabilirsiniz.</p>
        <Link
          href={tool.dashboardHref ?? "/dashboard"}
          className="tm-btn-primary mt-4 inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
        >
          Panele git
        </Link>
      </div>
    </div>
  );
}
