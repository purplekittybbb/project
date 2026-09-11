"use client";

import { fmtInt } from "@/lib/tools/format-tr";

const STATUS_TR: Record<string, string> = {
  first_page: "İlk sayfada indeksli",
  deep_page: "Derin sayfada indeksli",
  not_indexed: "Arama sonuçlarında yok",
};

interface Props {
  data: Record<string, unknown>;
  mode?: string;
}

export function IndexCheckResultPanel({ data, mode }: Props) {
  const status = String(data.status ?? "not_indexed");
  const isPreview = mode === "preview" || data.mode === "preview";

  return (
    <div className="space-y-4">
      {isPreview && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Önizleme modu — canlı tarama için sunucuda tarayıcı oturumu gerekir.
        </p>
      )}
      <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Index durumu</p>
        <p className="mt-2 font-heading text-xl font-semibold">{STATUS_TR[status] ?? status}</p>
        {data.rank != null && (
          <p className="mt-1 text-sm text-muted-foreground">Tahmini sıra: {fmtInt(Number(data.rank))}</p>
        )}
      </div>
      <dl className="grid gap-3 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Pazaryeri</dt><dd>{String(data.marketplace ?? "—")}</dd></div>
        <div><dt className="text-muted-foreground">Anahtar kelime</dt><dd>{String(data.keyword ?? "—")}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Ürün</dt><dd>{String(data.targetTitle ?? "—")}</dd></div>
      </dl>
    </div>
  );
}
