"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { ToolDefinition } from "@/lib/tools/registry";
import { useStoreToolData } from "./use-store-tool-data";

export function StoreToolShell({
  tool,
  children,
}: {
  tool: ToolDefinition;
  children: (
    data: Extract<ReturnType<typeof useStoreToolData>, { status: "ready" }>,
    helpers: { refresh: () => Promise<void> },
  ) => ReactNode;
}) {
  const state = useStoreToolData(tool.href);

  async function refresh() {
    if (typeof window !== "undefined") window.location.reload();
  }

  if (state.status === "loading" || state.status === "anonymous") {
    return <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor…</div>;
  }

  if (state.status === "no-store" || state.status === "no-data") {
    return (
      <div className="mx-auto max-w-xl">
        <span className="inline-flex rounded-full border border-[var(--tm-copper)]/30 bg-[var(--tm-copper)]/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--tm-copper)]">
          Mağaza Gerekli
        </span>
        <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight">{tool.title}</h1>
        <p className="mt-3 text-base text-muted-foreground">{tool.description}</p>
        <div className="mt-8 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-6">
          <p className="text-sm font-medium">
            {state.status === "no-store"
              ? "Bu özellik için mağazanızı bağlayın"
              : "Henüz satış veriniz yok — mağazayı bağlayıp senkron edin"}
          </p>
          <Link href={state.connectHref} className="tm-btn-primary mt-4 inline-flex h-10 items-center px-5 text-sm font-medium">
            Mağazayı bağla
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <span className="inline-flex rounded-full border border-[var(--tm-copper)]/30 bg-[var(--tm-copper)]/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--tm-copper)]">
        Mağaza verisi
      </span>
      <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight">{tool.title}</h1>
      <p className="mt-2 text-base text-muted-foreground">{tool.description}</p>
      <div className="mt-8">{children(state, { refresh })}</div>
    </div>
  );
}
