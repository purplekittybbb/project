"use client";

import { fmtInt, fmtTry } from "@/lib/tools/format-tr";

interface Props {
  data: Record<string, unknown>;
  mode?: string;
}

export function PriceTrackResultPanel({ data, mode }: Props) {
  const prices = (data.prices as Array<{ title: string; price: number; rank: number }>) ?? [];
  const stats = data.stats as { min: number; max: number; median: number; p25: number; p75: number } | undefined;
  const isPreview = mode === "preview" || data.mode === "preview";

  return (
    <div className="space-y-4">
      {isPreview && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Önizleme modu — canlı tarama için sunucuda tarayıcı oturumu gerekir.
        </p>
      )}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Min", stats.min],
            ["P25", stats.p25],
            ["Medyan", stats.median],
            ["P75", stats.p75],
            ["Max", stats.max],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{fmtTry(Number(val))}</p>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)]">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Sıra</th>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3 text-right">Fiyat</th>
            </tr>
          </thead>
          <tbody>
            {prices.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Sonuç yok</td></tr>
            ) : (
              prices.map((p) => (
                <tr key={p.rank} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">{fmtInt(p.rank)}</td>
                  <td className="px-4 py-2">{p.title}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtTry(p.price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
