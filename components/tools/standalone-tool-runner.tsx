"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

const POLL_INTERVAL_MS = 2500;
/** Hard stop so a stuck worker never spins forever. */
const MAX_POLL_MS = 90_000;

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

type ToolApiJson = {
  error?: string;
  data?: Record<string, unknown>;
  mode?: string;
  toolId?: string;
  quota?: { limit: number; remaining: number; used: number };
  upgradeHint?: string | null;
};

function extractJobId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const jobId = (data as { jobId?: unknown }).jobId;
  return typeof jobId === "string" && jobId.length > 0 ? jobId : null;
}

export function StandaloneToolRunner({ toolId, title, description }: StandaloneToolRunnerProps) {
  const [query, setQuery] = useState("");
  const [marketplace, setMarketplace] = useState("trendyol");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(null);
  const [resultMode, setResultMode] = useState<string | undefined>();
  const [quota, setQuota] = useState<{ limit: number; remaining: number; used: number } | null>(null);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null);
  const [pollJobId, setPollJobId] = useState<string | null>(null);
  const pollStartedAt = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  function applyFinishedResult(json: ToolApiJson) {
    setQueueStatus(null);
    setPollJobId(null);
    pollStartedAt.current = null;
    setUpgradeHint(null);
    const payload = (json.data ?? json) as Record<string, unknown>;
    const scrapeError =
      typeof payload.error === "string" && payload.error.trim().length > 0 ? payload.error : null;
    // Panel owns scrape failures (shows keyword + honest message). Outer alert is for HTTP/network only.
    if (scrapeError) {
      setError(null);
    } else {
      setError(null);
    }
    setResultData(payload);
    setResultMode(json.mode ?? (payload.mode as string | undefined));
    if (json.quota) setQuota(json.quota);
    setLoading(false);
  }

  async function pollJobOnce(jobId: string, abandon = false): Promise<"continue" | "done"> {
    const qs = new URLSearchParams({ jobId });
    if (abandon) qs.set("abandon", "1");
    const res = await fetch(`/api/tools/${toolId}?${qs.toString()}`, {
      method: "GET",
    });
    const json = (await res.json()) as ToolApiJson;

    if (json.quota) setQuota(json.quota);

    if (!res.ok) {
      setQueueStatus(null);
      setPollJobId(null);
      pollStartedAt.current = null;
      setError(json.error ?? "Tarama tamamlanamadı. Lütfen tekrar deneyin.");
      setLoading(false);
      return "done";
    }

    if (json.mode === "queued" && !abandon) {
      const msg =
        (typeof json.data?.message === "string" && json.data.message) ||
        "Sonucun hazırlanıyor…";
      setQueueStatus(msg);
      return "continue";
    }

    applyFinishedResult(json);
    return "done";
  }

  useEffect(() => {
    if (!pollJobId || !loading) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const tick = async () => {
      if (stopped || cancelledRef.current) return;
      const started = pollStartedAt.current ?? Date.now();
      if (Date.now() - started > MAX_POLL_MS) {
        try {
          await pollJobOnce(pollJobId, true);
        } catch {
          setQueueStatus(null);
          setPollJobId(null);
          pollStartedAt.current = null;
          setError("Tarama beklenenden uzun sürdü. Birazdan tekrar deneyin.");
          setLoading(false);
        }
        return;
      }
      try {
        const outcome = await pollJobOnce(pollJobId);
        if (stopped || cancelledRef.current) return;
        if (outcome === "continue") {
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        }
      } catch {
        if (stopped || cancelledRef.current) return;
        setQueueStatus(null);
        setPollJobId(null);
        pollStartedAt.current = null;
        setError("Bağlantı hatası. Lütfen tekrar deneyin.");
        setLoading(false);
      }
    };

    timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll loop keyed on job id
  }, [pollJobId, loading, toolId]);

  /** Slot-full without jobId — quietly re-POST a few times. */
  const MAX_QUEUE_RETRIES = 5;
  const slotRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (slotRetryTimer.current) clearTimeout(slotRetryTimer.current);
    };
  }, []);

  async function runQuery(attempt: number) {
    try {
      const res = await fetch(`/api/tools/${toolId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, marketplace }),
      });
      const json = (await res.json()) as ToolApiJson;

      if (!res.ok) {
        setError(json.error ?? "Sorgu başarısız.");
        if (json.quota) setQuota(json.quota);
        setUpgradeHint(res.status === 429 ? (json.upgradeHint ?? null) : null);
        setLoading(false);
        return;
      }

      if (json.mode === "queued") {
        const jobId = extractJobId(json.data);
        if (jobId) {
          setQueueStatus(
            (typeof json.data?.message === "string" && json.data.message) ||
              "Sonucun hazırlanıyor…",
          );
          if (json.quota) setQuota(json.quota);
          pollStartedAt.current = Date.now();
          setPollJobId(jobId);
          return;
        }
        if (attempt >= MAX_QUEUE_RETRIES) {
          setQueueStatus(null);
          setError("Şu anda yoğunluk çok yüksek. Lütfen birazdan tekrar deneyin.");
          setLoading(false);
          return;
        }
        const wait = (json.data?.retryAfterSeconds as number | undefined) ?? 8;
        setQueueStatus(
          (typeof json.data?.message === "string" && json.data.message) ||
            "Şu anda yoğunluk var, sırada bekleniyor…",
        );
        if (slotRetryTimer.current) clearTimeout(slotRetryTimer.current);
        slotRetryTimer.current = setTimeout(() => void runQuery(attempt + 1), wait * 1000);
        return;
      }

      applyFinishedResult(json);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResultData(null);
    setQueueStatus(null);
    setUpgradeHint(null);
    setPollJobId(null);
    pollStartedAt.current = null;
    await runQuery(0);
  }

  const buttonLabel = loading
    ? queueStatus
      ? "Sonuç hazırlanıyor…"
      : "Sorgulanıyor…"
    : "Sorgula";

  return (
    <div className="mx-auto max-w-3xl">
      <span className="inline-flex rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Ücretsiz Dene
      </span>
      <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Giriş yapmadan günde {GUEST_DAILY_LIMIT} sorgu (IP bazlı). Giriş yaptıysanız limit daha yüksektir, Profesyonel pakette çok daha yüksektir.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Önbellekteki sonuçlar anında gelir. Yeni anahtar kelimelerde tarama arka planda yapılır — genelde birkaç saniye sürer.
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
          {buttonLabel}
        </button>
        {quota && (
          <p className="text-xs text-muted-foreground">
            Bugün: {quota.used}/{quota.limit} sorgu — kalan: {quota.remaining}
          </p>
        )}
      </form>

      {queueStatus && !error && (
        <div
          className="mt-6 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/50 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          {queueStatus}
        </div>
      )}

      {error && (
        <div className="mt-6 tm-field-error-box rounded-[var(--tm-r-ui)]" role="alert">
          <p>{error}</p>
          {upgradeHint && (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span>{upgradeHint}</span>
              <Link
                href="/pricing"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Paketleri görün
              </Link>
            </p>
          )}
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
