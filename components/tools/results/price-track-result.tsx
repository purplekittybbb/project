"use client";

import { CompetitorPriceBand } from "@/components/dashboard/CompetitorPriceBand";
import { finSignedClass } from "@/lib/design/financial-ui";
import { fmtInt, fmtRelativeTr, fmtTry } from "@/lib/tools/format-tr";

interface Props {
  data: Record<string, unknown>;
  mode?: string;
}

export function PriceTrackResultPanel({ data, mode }: Props) {
  const prices = ((data.prices as Array<{ title: string; price: number; rank: number }>) ?? []).filter(
    (p) => Number.isFinite(p.price) && p.price > 0,
  );
  const stats = data.stats as { min: number; max: number; median: number; p25: number; p75: number } | undefined;
  const usableStats = stats && stats.min > 0 && prices.length > 0 ? stats : undefined;
  const isPreview = mode === "preview" || data.mode === "preview";
  const isStale = mode === "stale";
  const scrapedAt = data.scrapedAt as string | undefined;
  const scrapeError = data.error as string | undefined;
  const keyword = typeof data.keyword === "string" ? data.keyword : undefined;
  const empty = prices.length === 0;
  const median = usableStats?.median;

  return (
    <div className="space-y-4">
      {isPreview && (
        <p className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Önizleme modu — canlı tarama için sunucuda tarayıcı oturumu gerekir.
        </p>
      )}
      {(scrapeError || empty) && (
        <p className="tm-field-error-box rounded-[var(--tm-r-ui)]">
          {scrapeError ??
            "Bu aramada fiyat bulunamadı. Ürün linki yerine kısa bir ürün adı deneyin (ör. tofu soya ezmesi)."}
        </p>
      )}
      {isStale && (
        <p className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Bu sonuç yakın zamanda alındı, şu anda arka planda güncelleniyor — birkaç dakika sonra tekrar sorgularsanız en güncel veriyi görürsünüz.
        </p>
      )}
      {keyword && (
        <p className="text-xs text-muted-foreground">
          Aranan: <span className="font-medium text-foreground">{keyword}</span>
        </p>
      )}
      {usableStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <CompetitorPriceBand label="Min" price={usableStats.min} median={median} />
          <CompetitorPriceBand label="P25" price={usableStats.p25} median={median} />
          <CompetitorPriceBand label="Medyan" price={usableStats.median} />
          <CompetitorPriceBand label="P75" price={usableStats.p75} median={median} />
          <CompetitorPriceBand label="Max" price={usableStats.max} median={median} />
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
            {empty ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  Sonuç yok
                </td>
              </tr>
            ) : (
              prices.map((p) => (
                <tr key={p.rank} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">{fmtInt(p.rank)}</td>
                  <td className="px-4 py-2">{p.title}</td>
                  <td
                    className={
                      median != null && median > 0
                        ? finSignedClass(p.price - median, "px-4 py-2 text-right font-mono")
                        : "px-4 py-2 text-right font-mono tabular-nums"
                    }
                  >
                    {fmtTry(p.price)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {scrapedAt && !empty && (
        <p className="text-xs text-muted-foreground">Veri {fmtRelativeTr(scrapedAt)} alındı.</p>
      )}
    </div>
  );
}
