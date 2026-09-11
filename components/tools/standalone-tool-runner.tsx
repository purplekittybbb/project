"use client";

import { useState } from "react";
import { GUEST_DAILY_LIMIT } from "@/lib/tools/limits";
import type { StandaloneToolId } from "@/lib/tools/registry";
import { IndexCheckResultPanel } from "@/components/tools/results/index-check-result";
import { PriceTrackResultPanel } from "@/components/tools/results/price-track-result";
import { Top100ResultPanel } from "@/components/tools/results/top100-result";
import { VisibilityResultPanel } from "@/components/tools/results/visibility-result";

interface StandaloneToolRunnerProps {
  toolId: StandaloneToolId;
  title: string;
  description: string;
}

function ResultPanel({
  toolId,
  data,
  mode,
}: {
  toolId: StandaloneToolId;
  data: Record<string, unknown>;
  mode?: string;
}) {
  switch (toolId) {
    case "visibility":
      return <VisibilityResultPanel data={data} mode={mode} />;
    case "index-check":
      return <IndexCheckResultPanel data={data} mode={mode} />;
    case "price-track":
      return <PriceTrackResultPanel data={data} mode={mode} />;
    case "top100":
      return <Top100ResultPanel data={data} mode={mode} />;
    default:
      return null;
  }
}

export function StandaloneToolRunner({ toolId, title, description }: StandaloneToolRunnerProps) {
  const [query, setQuery] = useState("");
  const [marketplace, setMarketplace] = useState("trendyol");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(null);
  const [resultMode, setResultMode] = useState<string | undefined>();
  const [quota, setQuota] = useState<{ limit: number; remaining: number; used: number } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResultData(null);

    try {
      const res = await fetch(`/api/tools/${toolId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, marketplace }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: Record<string, unknown>;
        mode?: string;
        quota?: { limit: number; remaining: number; used: number };
      };

      if (!res.ok) {
        setError(json.error ?? "Sorgu başarısız.");
        if (json.quota) setQuota(json.quota);
        return;
      }

      const payload = (json.data ?? json) as Record<string, unknown>;
      setResultData(payload);
      setResultMode(json.mode ?? (payload.mode as string | undefined));
      if (json.quota) setQuota(json.quota);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800">
        Ücretsiz Dene
      </span>
      <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Giriş yapmadan günde {GUEST_DAILY_LIMIT} sorgu (IP bazlı). Giriş yaptıysanız limit daha yüksektir.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-6">
        <div>
          <label htmlFor="query" className="block text-sm font-medium text-foreground">
            Ürün adı, anahtar kelime veya pazaryeri linki
          </label>
          <input
            id="query"
            type="text"
            required
            minLength={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ör. bluetooth kulaklık veya Trendyol ürün linki"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="marketplace" className="block text-sm font-medium text-foreground">
            Pazaryeri
          </label>
          <select
            id="marketplace"
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
            <option value="n11">N11</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="tm-btn-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium disabled:opacity-60"
        >
          {loading ? "Sorgulanıyor…" : "Sorgula"}
        </button>
        {quota && (
          <p className="text-xs text-muted-foreground">
            Bugün: {quota.used}/{quota.limit} sorgu — kalan: {quota.remaining}
          </p>
        )}
      </form>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {resultData && (
        <div className="mt-6">
          <ResultPanel toolId={toolId} data={resultData} mode={resultMode} />
        </div>
      )}
    </div>
  );
}
