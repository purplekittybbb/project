"use client";

import { fmtInt, fmtRelativeTr, fmtTry } from "@/lib/tools/format-tr";
import { AiConfidenceBlock, confidenceFromScore } from "@/components/trust/AiConfidenceBlock";

interface Props {
  data: Record<string, unknown>;
  mode?: string;
}

export function Top100ResultPanel({ data, mode }: Props) {
  const items = ((data.items as Array<{ rank: number; title: string; price: number; reviewCount?: number }>) ?? []).filter(
    (item) => Number.isFinite(item.price) && item.price > 0,
  );
  const priceStats = data.priceStats as { min: number; p50: number; max: number } | undefined;
  const usableStats =
    priceStats && priceStats.min > 0 && items.length > 0 ? priceStats : undefined;
  const isPreview = mode === "preview" || data.mode === "preview";
  const isStale = mode === "stale";
  const confidence = data.aggregateConfidence as number | undefined;
  // top100's own result type calls this field analysedAt; the cached-scan
  // read/write path passes the same object through, so both spellings are
  // covered (cheap defensive fallback, not a real ambiguity in this codebase).
  const scrapedAt = (data.analysedAt ?? data.scrapedAt) as string | undefined;
  const scrapeError = data.error as string | undefined;
  const empty = items.length === 0;

  return (
    <div className="space-y-4">
      {isPreview && (
        <p className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Önizleme modu — canlı tarama için sunucuda tarayıcı oturumu gerekir.
        </p>
      )}
      {(scrapeError || empty) && (
        <p className="tm-field-error-box rounded-[var(--tm-r-ui)]">
          {scrapeError
            ? "Tarama tamamlanamadı, aşağıdaki liste eksik veya boş olabilir. Lütfen birazdan tekrar deneyin."
            : "Bu aramada ürün/fiyat bulunamadı. Kısa bir ürün adı deneyin."}
        </p>
      )}
      {isStale && (
        <p className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Bu sonuç yakın zamanda alındı, şu anda arka planda güncelleniyor — birkaç dakika sonra tekrar sorgularsanız en güncel veriyi görürsünüz.
        </p>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        {usableStats && (
          <>
            <span>Fiyat aralığı: {fmtTry(usableStats.min)} – {fmtTry(usableStats.max)}</span>
            <span>Medyan: {fmtTry(usableStats.p50)}</span>
          </>
        )}
        <span>{fmtInt(items.length)} ürün listelendi</span>
      </div>
      {confidence != null && items.length > 0 && (
        <AiConfidenceBlock
          level={confidenceFromScore(confidence)}
          why={`Güven skoru ${confidence}/100 — örneklem büyüklüğü (${fmtInt(items.length)} ürün) ve scrape bütünlüğüne göre hesaplandı. Az ürün veya eksik scrape düşük güven üretir.`}
          how={
            <ul className="list-disc space-y-1 pl-4">
              <li>Örneklem: listelenen ürün sayısı</li>
              <li>Scrape: fiyat/başlık alanlarının doluluk oranı</li>
              <li>Skor aralığı: 0–100 (yüksek = daha güvenilir sıralama)</li>
            </ul>
          }
          limitedData={confidence < 40 || items.length < 10}
        >
          <p className="text-sm text-muted-foreground">
            Toplam güven: <span className="font-mono tabular-nums text-foreground">{confidence}/100</span>
          </p>
        </AiConfidenceBlock>
      )}
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
            {empty ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  Sonuç yok
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.rank} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">{item.rank}</td>
                  <td className="max-w-xs truncate px-4 py-2" title={item.title}>{item.title}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtTry(item.price)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {item.reviewCount != null ? fmtInt(item.reviewCount) : "—"}
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
