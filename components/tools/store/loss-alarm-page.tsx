"use client";

import { detectLossAlarms } from "@/lib/calc/loss-alarm";
import { fmtPct } from "@/lib/tools/format-tr";
import type { useStoreToolData } from "./use-store-tool-data";

type Ready = Extract<ReturnType<typeof useStoreToolData>, { status: "ready" }>;

const LEVEL_LABEL: Record<string, string> = {
  "silent-loss": "Sessiz zarar",
  loss: "Zarar",
  "thin-margin": "İnce marj",
  "return-risk": "İade riski",
};

export function LossAlarmStorePage({ data }: { data: Ready }) {
  const alarms = detectLossAlarms(data.view.skus);

  if (alarms.length === 0) {
    return (
      <p className="tm-capsule-profit rounded-[var(--tm-r-ui)] p-4 text-sm fin-profit">
        Şu an alarm veren SKU yok — tüm ürünler eşik değerlerin içinde.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Ürün</th>
            <th className="px-4 py-3">Alarm</th>
            <th className="px-4 py-3 text-right">Gerçek marj</th>
            <th className="px-4 py-3">Açıklama</th>
          </tr>
        </thead>
        <tbody>
          {alarms.map((a) => (
            <tr key={a.sku} className="border-t border-border">
              <td className="px-4 py-2">{data.skuEconomics.get(a.sku)?.productTitle ?? a.sku}</td>
              <td className="px-4 py-2">
                <span className="fin-bg-loss-subtle rounded-full px-2 py-0.5 text-xs font-medium fin-loss">
                  {LEVEL_LABEL[a.level] ?? a.level}
                </span>
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums fin-loss">{fmtPct(a.trueMarginPct)}</td>
              <td className="px-4 py-2 text-muted-foreground">{a.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
