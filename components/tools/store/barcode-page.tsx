"use client";

import { useCallback, useMemo, useState } from "react";
import type { CanonicalProduct } from "@/lib/domain/canonical";
import { MARKETPLACE_LABELS } from "@/lib/engine";
import { buildBarcodeAnalysis } from "@/lib/tools/barcode-analysis";
import { fmtPct, fmtTry } from "@/lib/tools/format-tr";
import type { useStoreToolData } from "./use-store-tool-data";

type Ready = Extract<ReturnType<typeof useStoreToolData>, { status: "ready" }>;

function marketplaceLabel(id: string): string {
  return MARKETPLACE_LABELS[id as keyof typeof MARKETPLACE_LABELS] ?? id;
}

function ProductComparisonCard({ product }: { product: CanonicalProduct }) {
  const multi = product.marketplaceListings.length > 1;
  return (
    <article className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{product.canonicalTitle}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">Barkod: {product.barcode}</p>
        </div>
        {product.priceInconsistency && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
            Fiyat farkı {fmtTry(product.priceSpread)}
          </span>
        )}
      </div>
      {product.priceInconsistency && (
        <p className="mt-2 text-sm text-amber-900">{product.priceInconsistency.suggestion}</p>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="pb-2 pr-4">Pazaryeri</th>
              <th className="pb-2 pr-4">SKU</th>
              <th className="pb-2 pr-4 text-right">Birim fiyat</th>
              <th className="pb-2 text-right">Net marj</th>
              <th className="pb-2 pl-2">Durum</th>
            </tr>
          </thead>
          <tbody>
            {product.marketplaceListings.map((l) => (
              <tr key={`${l.marketplace}-${l.sku}`} className="border-t border-border">
                <td className="py-2 pr-4">{marketplaceLabel(l.marketplace)}</td>
                <td className="py-2 pr-4 font-mono text-xs">{l.sku}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">
                  {l.currentPrice != null ? fmtTry(l.currentPrice) : "—"}
                </td>
                <td className={`py-2 text-right font-mono tabular-nums ${(l.trueMarginPct ?? 0) < 0 ? "fin-loss" : ""}`}>
                  {l.trueMarginPct != null ? fmtPct(l.trueMarginPct) : "—"}
                </td>
                <td className="py-2 pl-2 text-xs">
                  {l.isLoser ? "Zarar" : multi ? "Listede" : "Tek kanal"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function BarcodeStorePage({
  data,
  onRefresh,
}: {
  data: Ready;
  onRefresh: () => Promise<void>;
}) {
  const [csvText, setCsvText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const analysis = useMemo(
    () => buildBarcodeAnalysis(data.rows, data.view.skus),
    [data.rows, data.view.skus],
  );

  const handleUpload = useCallback(async () => {
    setUploading(true);
    setUploadMsg(null);
    setUploadError(null);
    try {
      const res = await fetch("/api/tools/barcode/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const json = (await res.json()) as {
        error?: string;
        updatedSkus?: number;
        productCount?: number;
        warnings?: string[];
      };
      if (!res.ok) {
        setUploadError(json.error ?? "Yükleme başarısız.");
        return;
      }
      setUploadMsg(
        `${json.updatedSkus ?? 0} SKU güncellendi · ${json.productCount ?? 0} barkod grubu analiz edildi.`,
      );
      setCsvText("");
      await onRefresh();
    } catch {
      setUploadError("Bağlantı hatası.");
    } finally {
      setUploading(false);
    }
  }, [csvText, onRefresh]);

  const { stats, products } = analysis;

  return (
    <div className="space-y-8">
      <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/30 p-4 text-sm">
        <p>
          <strong>{stats.rowsWithBarcode}</strong> / {stats.totalRows} satırda barkod var ·{" "}
          <strong>{stats.multiMarketplaceBarcodes}</strong> çapraz pazaryeri eşleşmesi
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Trendyol ve N11 senkronu barkodu otomatik doldurur. Hepsiburada veya eksik alanlar için CSV yükleyin.
        </p>
      </div>

      <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-5">
        <h2 className="text-sm font-semibold">CSV ile barkod eşleştir</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          İki sütun: <code className="text-xs">sku,barkod</code> (veya stok_kodu / ean)
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={5}
          placeholder={"sku,barkod\nT-SKU-1,8683772071724\nH-SKU-2,8683772071724"}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={uploading || !csvText.trim()}
          onClick={() => void handleUpload()}
          className="tm-btn-primary mt-3 inline-flex h-9 items-center px-4 text-sm disabled:opacity-50"
        >
          {uploading ? "Yükleniyor…" : "CSV yükle"}
        </button>
        {uploadMsg && <p className="mt-2 text-sm text-emerald-800">{uploadMsg}</p>}
        {uploadError && <p className="mt-2 text-sm text-red-700">{uploadError}</p>}
      </div>

      {stats.rowsWithBarcode === 0 ? (
        <div className="rounded-[var(--tm-r-ui)] border border-dashed border-[var(--tm-mist)] p-8 text-center">
          <p className="font-medium text-foreground">Barkod bulunamadı</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Mağazanızı senkron edin veya yukarıdan SKU–barkod CSV dosyanızı yükleyin. Barkod olmadan
            çapraz pazaryeri karşılaştırması yapılamaz.
          </p>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-[var(--tm-r-ui)] border border-dashed border-[var(--tm-mist)] p-8 text-center">
          <p className="font-medium text-foreground">Eşleşen ürün grubu yok</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Barkodlar kayıtlı ancak gruplanacak geçerli liste bulunamadı. CSV ile eksik SKU eşleşmelerini tamamlayın.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {stats.multiMarketplaceBarcodes === 0 && (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Henüz aynı barkodun birden fazla pazaryerinde listelendiği bir eşleşme yok. İkinci kanalı
              bağlayıp senkron edin veya CSV ile barkod ekleyin.
            </p>
          )}
          {products.map((p) => (
            <ProductComparisonCard key={p.barcode} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
