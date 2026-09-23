"use client";

/**
 * Dev/admin visual monitor for BullMQ + Dead Letter Queue + scrape leases.
 * Calls GET /api/admin/queues with CRON_SECRET from a local prompt (never baked in).
 */

import { useCallback, useState } from "react";

type DeadLetterItem = {
  id: string;
  toolId: string;
  marketplace: string;
  keyword: string;
  originalJobId: string;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
};

type QueuePayload = {
  queueName: string;
  dlqName?: string;
  redisConfigured: boolean;
  bullmq: {
    ok: boolean;
    redis?: boolean;
    counts?: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
    } | null;
    dlqWaiting?: number | null;
    message?: string;
    error?: string;
  };
  postgresLeases: { available: boolean; rows: Array<{ marketplace: string; started_at: string }>; error?: string };
  recentFailed: Array<{ id: string; failedReason?: string; attemptsMade?: number }>;
  deadLetters?: DeadLetterItem[];
  backoff: { sequence: number[] };
};

export default function AdminQueuesPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<QueuePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/queues", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Yetkisiz — CRON_SECRET yanlış." : `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData((await res.json()) as QueuePayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [secret]);

  const counts = data?.bullmq?.counts;
  const deadLetters = data?.deadLetters ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <h1 className="text-xl font-semibold tracking-tight">Kuyruk izleme · BullMQ + DLQ</h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-xl">
        Geliştirme / admin paneli. Secret tarayıcıda tutulmaz — her oturumda CRON_SECRET
        girin. Kalıcı başarısız scrape işleri Dead Letter Queue&apos;da incelenir.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 items-end">
        <label className="block text-xs text-zinc-500">
          CRON_SECRET
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mt-1 block w-72 border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || !secret}
          className="h-10 px-4 bg-zinc-100 text-zinc-950 text-sm font-medium disabled:opacity-40"
        >
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm fin-loss">{error}</p>}

      {data && (
        <div className="mt-8 space-y-6">
          <div className="text-xs font-mono text-zinc-500">
            queue={data.queueName}
            {data.dlqName ? ` · dlq=${data.dlqName}` : ""} · redis={String(data.redisConfigured)} ·
            backoff={data.backoff.sequence.join("→")}ms
            {typeof data.bullmq.dlqWaiting === "number" ? ` · dlqJobs=${data.bullmq.dlqWaiting}` : ""}
          </div>

          {counts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {(
                [
                  ["waiting", counts.waiting, "Queued"],
                  ["active", counts.active, "Active"],
                  ["delayed", counts.delayed, "Delayed"],
                  ["completed", counts.completed, "Completed"],
                  ["failed", counts.failed, "Failed"],
                  ["paused", counts.paused, "Paused"],
                ] as const
              ).map(([key, n, label]) => (
                <div key={key} className="border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
                  <div className="mt-1 font-mono text-2xl tabular-nums">{n}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-400/90">
              {data.bullmq.message ?? data.bullmq.error ?? "BullMQ sayaçları yok."}
            </p>
          )}

          <div>
            <h2 className="text-sm font-medium text-zinc-300">
              Dead Letter Queue{" "}
              <span className="text-zinc-600 font-mono text-xs">
                ({data.dlqName ?? "truemargin-scrape-dlq"})
              </span>
            </h2>
            <p className="mt-1 text-xs text-zinc-600">
              Tüm retry&apos;lar (2s→4s→8s) tükendikten sonra buraya düşen kalıcı hatalar.
            </p>
            {deadLetters.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-600">DLQ boş.</p>
            ) : (
              <ul className="mt-3 space-y-2 font-mono text-xs text-zinc-400">
                {deadLetters.map((j) => (
                  <li key={j.id} className="border border-zinc-900 px-3 py-2 space-y-0.5">
                    <div>
                      #{j.id} · orig={j.originalJobId} · {j.toolId}/{j.marketplace}
                    </div>
                    <div className="text-zinc-500">
                      “{j.keyword}” · attempts={j.attemptsMade} · {j.failedAt}
                    </div>
                    <div className="fin-loss">{j.failedReason}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-zinc-300">Postgres scrape_leases</h2>
            {!data.postgresLeases.available ? (
              <p className="mt-2 text-xs text-zinc-600">
                {data.postgresLeases.error ?? "Service role / tablo yok"}
              </p>
            ) : (
              <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-400">
                {data.postgresLeases.rows.length === 0 && <li>Boş</li>}
                {data.postgresLeases.rows.map((r, i) => (
                  <li key={i}>
                    {r.marketplace} · {r.started_at}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.recentFailed.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-300">Son failed (ana kuyruk)</h2>
              <ul className="mt-2 space-y-2 font-mono text-xs text-zinc-400">
                {data.recentFailed.map((j) => (
                  <li key={j.id} className="border border-zinc-900 px-3 py-2">
                    #{j.id} attempts={j.attemptsMade ?? "?"} — {j.failedReason ?? "—"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
