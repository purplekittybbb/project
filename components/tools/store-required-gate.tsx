"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";
import { loadUserRowsWithStatus } from "@/lib/supabase/user-data";
import type { ToolDefinition } from "@/lib/tools/registry";
import { buildConnectUrl } from "@/lib/tools/store-gate";

type GateState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "load-error"; message: string }
  | { kind: "no-store" }
  | { kind: "no-data"; message: string }
  | { kind: "ready" };

export function StoreRequiredGate({ tool }: { tool: ToolDefinition }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const connectHref = buildConnectUrl(tool.href);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isAuthConfigured()) {
        if (!cancelled) setState({ kind: "anonymous" });
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        if (!cancelled) setState({ kind: "anonymous" });
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        if (!cancelled) setState({ kind: "anonymous" });
        return;
      }

      const { rows, error: loadError } = await loadUserRowsWithStatus();
      if (loadError) {
        if (!cancelled) {
          setState({
            kind: "load-error",
            message: "Satış verileri yüklenemedi. Oturumu yenileyip tekrar deneyin.",
          });
        }
        return;
      }

      if (rows.length > 0) {
        if (!cancelled) setState({ kind: "ready" });
        return;
      }

      const res = await fetch("/api/marketplace/credentials-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (!cancelled) {
          setState({
            kind: "load-error",
            message: "Mağaza bağlantı durumu okunamadı. Oturumu yenileyip tekrar deneyin.",
          });
        }
        return;
      }
      const json = (await res.json()) as { marketplaces?: string[]; connections?: unknown[] };
      const hasCredentials =
        (json.connections?.length ?? 0) > 0 || (json.marketplaces?.length ?? 0) > 0;

      if (!cancelled) {
        setState(
          hasCredentials
            ? {
                kind: "no-data",
                message:
                  "Mağaza bağlı ancak henüz sipariş verisi yok — senkron bekleyin veya CSV yükleyin.",
              }
            : { kind: "no-store" },
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.kind === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(tool.href)}`);
    }
  }, [state, router, tool.href]);

  if (state.kind === "loading" || state.kind === "anonymous") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }

  if (state.kind === "load-error") {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">{tool.title}</h1>
        <div className="mt-8 tm-field-error-box rounded-[var(--tm-r-ui)] p-6">
          <p className="text-sm font-medium">{state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="tm-btn-primary mt-4 inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "no-store" || state.kind === "no-data") {
    return (
      <div className="mx-auto max-w-xl">
        <span className="inline-flex rounded-full border border-[var(--tm-copper)]/30 bg-[var(--tm-copper)]/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--tm-copper)]">
          {state.kind === "no-store" ? "Mağaza Gerekli" : "Veri Gerekli"}
        </span>
        <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-foreground">{tool.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{tool.description}</p>
        <div className="mt-8 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-6">
          <p className="text-sm font-medium text-foreground">
            {state.kind === "no-data"
              ? state.message
              : "Bu özellik için satış verisi gerekli"}
          </p>
          {state.kind === "no-store" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Trendyol/Hepsiburada/N11 hesabınızı bağlayın veya CSV yükleyin — mağaza bağlantısı olmadan da CSV ile
              devam edebilirsiniz.
            </p>
          )}
          <Link
            href={connectHref}
            className="tm-btn-primary mt-6 inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
          >
            Veri ekle / mağaza bağla
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">{tool.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{tool.description}</p>
      <div className="mt-8 rounded-[var(--tm-r-ui)] border fin-border-profit-subtle fin-bg-profit-subtle p-6">
        <p className="text-sm fin-profit">Verileriniz hazır. Bu aracı panelde kullanabilirsiniz.</p>
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
