"use client";

import { fmtInt, fmtRelativeTr } from "@/lib/tools/format-tr";

interface Props {
  data: Record<string, unknown>;
  mode?: string;
}

export function VisibilityResultPanel({ data, mode }: Props) {
  const found = Boolean(data.found ?? data.isIndexed);
  const rank = data.rank as number | undefined;
  const keyword = String(data.keyword ?? "—");
  const target = String(data.targetTitle ?? "—");
  const marketplaceRaw = String(data.marketplace ?? "—");
  const marketplace =
    marketplaceRaw === "trendyol"
      ? "Trendyol"
      : marketplaceRaw === "hepsiburada"
        ? "Hepsiburada"
        : marketplaceRaw === "n11"
          ? "N11"
          : marketplaceRaw;
  const isOnFirstPage = Boolean(data.isOnFirstPage);
  const isPreview = mode === "preview" || data.mode === "preview";
  const isStale = mode === "stale";
  const scrapedAt = data.scrapedAt as string | undefined;
  const scrapeError = data.error as string | undefined;

  // Honest failure: never show a "bulunamadı" card when the scrape itself failed.
  if (scrapeError) {
    return (
      <div className="space-y-4">
        <p className="tm-field-error-box rounded-[var(--tm-r-ui)]" role="alert">
          {scrapeError}
        </p>
        <dl className="grid gap-3 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Pazaryeri</dt>
            <dd className="font-medium">{marketplace}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Anahtar kelime</dt>
            <dd className="font-medium">{keyword}</dd>
          </div>
          {target !== "—" && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Hedef ürün</dt>
              <dd className="font-medium">{target}</dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isPreview && (
        <p className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Önizleme modu — canlı tarama için sunucuda tarayıcı oturumu gerekir.
        </p>
      )}
      {isStale && (
        <p className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Bu sonuç yakın zamanda alındı, şu anda arka planda güncelleniyor — birkaç dakika sonra tekrar sorgularsanız en güncel veriyi görürsünüz.
        </p>
      )}
      <div className={`rounded-[var(--tm-r-ui)] border p-5 ${found ? "fin-border-profit-subtle fin-bg-profit-subtle" : "border-border bg-secondary/30"}`}>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Sonuç özeti</p>
        <p className="mt-2 font-heading text-xl font-semibold text-foreground">
          {found && rank ? `${rank}. sırada bulundu` : found ? "Listede görünüyor" : "Bu aramada bulunamadı"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {isOnFirstPage ? "İlk sayfada" : found ? "Derin sayfada" : "İndekste yok veya eşleşme yok"}
        </p>
      </div>
      <dl className="grid gap-3 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Pazaryeri</dt><dd className="font-medium">{marketplace}</dd></div>
        <div><dt className="text-muted-foreground">Anahtar kelime</dt><dd className="font-medium">{keyword}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Hedef ürün</dt><dd className="font-medium">{target}</dd></div>
        {rank != null && <div><dt className="text-muted-foreground">Sıra</dt><dd className="font-mono">{fmtInt(rank)}</dd></div>}
        {data.page != null && <div><dt className="text-muted-foreground">Sayfa</dt><dd className="font-mono">{fmtInt(Number(data.page))}</dd></div>}
      </dl>
      {scrapedAt && (
        <p className="text-xs text-muted-foreground">Veri {fmtRelativeTr(scrapedAt)} alındı.</p>
      )}
    </div>
  );
}
