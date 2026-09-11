"use client";

/**
 * Loss Alarm Banner — spec §4 "Zarar Uyarısı".
 *
 * Tasarım ilkeleri:
 *   - Net, suçlamayan, aksiyon odaklı metin (spec §7 mikro-metin kuralları).
 *   - Tam rakamlar — "Bir şeyler ters gitti" gibi belirsiz mesaj YASAK.
 *   - --alert-clay rengi, sabit/sakin, hiçbir yanıp sönme yok (spec §4, §8).
 *   - Bölüm 3-30-300: bu banner sayfanın sol üst kısmına, büyük özet sayısının
 *     hemen altına yerleştirilir (dashboard'da).
 */

function fmtMoney(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return currency === "USD" ? `$${formatted}` : `₺${formatted}`;
}

export interface LossAlarmBannerProps {
  /** Count of loss/silent-loss SKUs. */
  lossSkuCount: number;
  /** Total absolute money at risk across loss SKUs (sum of |netContribution| where < 0). */
  totalRisk: number;
  currency: string;
}

export function LossAlarmBanner({ lossSkuCount, totalRisk, currency }: LossAlarmBannerProps) {
  if (lossSkuCount === 0) return null;

  return (
    <div
      className="tm-alarm-banner flex items-start gap-3 px-4 py-3"
      role="alert"
      aria-live="polite"
    >
      {/* Clay dot indicator — no flashing (spec §4) */}
      <span
        className="mt-0.5 inline-block w-2 h-2 rounded-full shrink-0"
        style={{ background: "var(--tm-alert-clay)" }}
        aria-hidden="true"
      />
      <p className="text-[13px] leading-snug" style={{ color: "var(--tm-alert-clay)" }}>
        <strong className="font-semibold">
          {lossSkuCount} ürün{lossSkuCount > 1 ? " zarar ediyor" : " zarar ediyor"}.
        </strong>{" "}
        Toplam risk:{" "}
        <strong className="tnum">{fmtMoney(totalRisk, currency)}</strong>.{" "}
        Her ürünün satırına tıklayarak güvenli fiyatı görebilirsiniz.
      </p>
    </div>
  );
}

// ── Per-SKU mini alarm (SKU tablosunda satır içi kullanım için) ──────────────

export interface SkuLossTagProps {
  level: "silent-loss" | "loss" | "thin-margin" | "return-risk";
}

const TAG_LABELS: Record<SkuLossTagProps["level"], string> = {
  "loss":         "ZARAR",
  "silent-loss":  "GİZLİ ZARAR",
  "thin-margin":  "DÜŞÜK MARJ",
  "return-risk":  "YÜK. İADE",
};

export function SkuLossTag({ level }: SkuLossTagProps) {
  const isLoss = level === "loss" || level === "silent-loss";
  return (
    <span
      className="inline-block text-[9px] px-1.5 py-0.5 tracking-widest font-mono uppercase"
      style={{
        color:           isLoss ? "var(--tm-alert-clay)" : "var(--tm-copper)",
        background:      isLoss
          ? "color-mix(in srgb, var(--tm-alert-clay) 10%, var(--tm-paper))"
          : "color-mix(in srgb, var(--tm-copper) 10%, var(--tm-paper))",
        border:          `1px solid ${isLoss
          ? "color-mix(in srgb, var(--tm-alert-clay) 30%, transparent)"
          : "color-mix(in srgb, var(--tm-copper) 30%, transparent)"}`,
        borderRadius:    "var(--tm-r-data)",
      }}
    >
      {TAG_LABELS[level]}
    </span>
  );
}
