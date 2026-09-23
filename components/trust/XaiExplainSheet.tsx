"use client";

import { useEffect, useId, type ReactNode } from "react";

export type XaiFactorBar = {
  /** Kısa etiket (Türkçe) */
  label: string;
  /** 0..1 göreli ağırlık (görsel çubuk) */
  weight: number;
  /** Etki yönü / açıklama (örn. "artırdı ×1.12") */
  effect: string;
  /** Pozitif = kâr yönü, negatif = zarar yönü, nötr = gri */
  direction?: "up" | "down" | "neutral";
};

/**
 * PDF §7.2 Seviye 3 — "Detayları Gör" tam sayfa / tam ekran katman.
 * SHAP/LIME tarzı basitleştirilmiş feature-importance: en önemli 3–5 faktör,
 * doğrudan etiketli yatay çubuklar (pasta/3D yok — Data-Ink).
 */
export function XaiExplainSheet({
  open,
  onClose,
  title = "Karar mantığı — Nasıl?",
  subtitle,
  factors,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  factors: XaiFactorBar[];
  /** Opsiyonel ek açıklama (karar ağacı özeti vb.) */
  children?: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxW = Math.max(0.0001, ...factors.map((f) => Math.abs(f.weight)));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[var(--tm-mist)] bg-[var(--tm-paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--tm-mist)] bg-[var(--tm-paper)] px-5 py-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--tm-copper)]">
              XAI · Seviye 3
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight text-[var(--tm-ink)]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] px-3 py-1.5 text-xs text-[var(--tm-ink)] hover:bg-secondary"
          >
            Kapat
          </button>
        </header>

        <div className="flex-1 space-y-6 px-5 py-5">
          <section>
            <h3 className="mb-3 text-[11px] font-sans uppercase tracking-[0.14em] text-muted-foreground">
              Faktör önem sırası (basitleştirilmiş SHAP)
            </h3>
            {factors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Bu karar için ayrıntılı faktör ağırlığı kaydı yok — yalnızca kural tabanlı özet
                mevcut.
              </p>
            ) : (
              <ul className="space-y-3">
                {factors.slice(0, 5).map((f) => {
                  const pct = Math.max(8, (Math.abs(f.weight) / maxW) * 100);
                  const barColor =
                    f.direction === "up"
                      ? "var(--tm-ledger-green)"
                      : f.direction === "down"
                        ? "var(--tm-alert-clay)"
                        : "var(--tm-copper)";
                  return (
                    <li key={f.label} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-[12px]">
                        <span className="font-medium text-[var(--tm-ink)]">{f.label}</span>
                        <span className="shrink-0 font-mono tabular-nums text-[11px]" style={{ color: barColor }}>
                          {f.effect}
                        </span>
                      </div>
                      <div
                        className="h-2 w-full rounded-full"
                        style={{ background: "color-mix(in srgb, var(--tm-ink) 8%, transparent)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {children && (
            <section className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              {children}
            </section>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Bu görünüm, modelin kararını denetçi / analitik kullanıcı için açar. Sayılar kesin muhasebe
            kaydı değildir; kendi işlem verinizle doğrulayın.
          </p>
        </div>
      </div>
    </div>
  );
}
