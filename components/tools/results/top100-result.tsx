"use client";

import { fmtInt, fmtTry } from "@/lib/tools/format-tr";

interface Props {
  data: Record<string, unknown>;
  mode?: string;
}

export function Top100ResultPanel({ data, mode }: Props) {
  const items = (data.items as Array<{ rank: number; title: string; price: number; reviewCount?: number }>) ?? [];
  const priceStats = data.priceStats as { min: number; p50: number; max: number } | undefined;
  const isPreview = mode === "preview" || data.mode === "preview";
  const confidence = data.aggregateConfidence as number | undefined;

  return (
    <div className="space-y-4">
      {isPreview && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Önizleme modu — canlı tarama için sunucuda tarayıcı oturumu gerekir.
        </p>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        {priceStats && (
          <>
            <span>Fiyat aralığı: {fmtTry(priceStats.min)} – {fmtTry(priceStats.max)}</span>
            <span>Medyan: {fmtTry(priceStats.p50)}</span>
          </>
        )}
        {confidence != null && <span>Güven: {confidence}/100</span>}
        <span>{fmtInt(items.length)} ürün listelendi</span>
      </div>
      <div className="overflow-x-auto rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3 text-right">Fiyat</th>
              <th className="px-4 py-3 text-right">Yorum</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.rank} className="border-t border-border">
                <td className="px-4 py-2 font-mono">{item.rank}</td>
                <td className="max-w-xs truncate px-4 py-2" title={item.title}>{item.title}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtTry(item.price)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {item.reviewCount != null ? fmtInt(item.reviewCount) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
