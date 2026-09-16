"use client";

/**
 * Hakediş Mutabakatı — gerçek, kullanıcı girişli mutabakat.
 *
 * Rakip analizinde (KarPanel) öne çıkan en güçlü fark: pazaryerinin GERÇEKTEN
 * ödediği tutar ile motorun hesapladığı beklenen tutarın karşılaştırılması.
 * Bu panel, kullanıcının kendi pazaryeri panelinden gördüğü gerçek hakediş
 * tutarını girmesini sağlar ve bunu "Temsili" bir modelle değil, GERÇEK bir
 * mutabakatla karşılaştırır. Girilmeden önce üstteki "Hakediş Doğrulama"
 * kartı zaten dürüstçe "Temsili" etiketiyle gösteriliyor (lib/engine.ts) —
 * bu panel o boşluğu gerçek veriyle dolduran ikinci adımdır.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, PencilLine } from "lucide-react";
import {
  currentPeriodLabel,
  loadAllSettlementPayouts,
  saveSettlementPayout,
  type SettlementPayout,
} from "@/lib/supabase/settlement";

function money(v: number, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

interface Props {
  marketplace: string;
  marketplaceLabel: string;
  expectedPayout: number;
  currency: string;
  authConfigured: boolean;
}

export function SettlementReconciliationPanel({
  marketplace,
  marketplaceLabel,
  expectedPayout,
  currency,
  authConfigured,
}: Props) {
  const period = currentPeriodLabel();
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<SettlementPayout | null>(null);
  const [editing, setEditing] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!authConfigured || marketplace === "combined") {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadAllSettlementPayouts().then((rows) => {
      if (cancelled) return;
      const match = rows.find((r) => r.marketplace === marketplace && r.periodLabel === period) ?? null;
      setEntry(match);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authConfigured, marketplace, period]);

  if (!authConfigured || marketplace === "combined") return null;

  async function handleSave() {
    const value = Number(amountInput.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      setError("Geçerli bir tutar girin.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: saveError } = await saveSettlementPayout(marketplace, period, value, currency);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setEntry({ marketplace, periodLabel: period, actualAmount: value, currency, note: null, updatedAt: new Date().toISOString() });
    setEditing(false);
  }

  if (loading) return null;

  const gap = entry ? expectedPayout - entry.actualAmount : 0;
  const hasGap = Math.abs(gap) > 0.5;

  return (
    <div className="mt-3 border border-zinc-800/70 bg-zinc-900/30 px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">
          Hakediş Mutabakatı · {period}
        </div>
        {entry && !editing && (
          <button
            type="button"
            onClick={() => {
              setAmountInput(String(entry.actualAmount));
              setEditing(true);
            }}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Gerçek tutarı düzenle"
          >
            <PencilLine size={12} />
          </button>
        )}
      </div>

      {!entry || editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-500 font-mono text-[12px]">
            {marketplaceLabel}&apos;den bu ay gerçekte aldığınız tutar:
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="ör. 48250"
            className="w-32 bg-zinc-950 border border-zinc-800 px-2 py-1 text-sm font-mono tabular-nums text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !amountInput}
            className="h-7 px-3 bg-zinc-100 text-zinc-950 text-[12px] font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-zinc-600 hover:text-zinc-300 text-[12px] font-mono"
            >
              Vazgeç
            </button>
          )}
          {error && <span className="fin-loss text-[11px] font-mono w-full">{error}</span>}
        </div>
      ) : (
        <div>
          <div className="font-mono text-sm flex items-baseline gap-3 flex-wrap">
            <span className="text-zinc-500">Beklenen</span>
            <span className="tabular-nums text-zinc-200">{money(expectedPayout, currency)}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500 inline-flex items-center gap-1">
              <CheckCircle2 size={11} className="fin-profit" />
              Gerçek
            </span>
            <span className="tabular-nums text-zinc-200">{money(entry.actualAmount, currency)}</span>
          </div>
          <div className={`mt-1.5 font-mono text-[12px] tabular-nums font-medium ${hasGap ? (gap > 0 ? "fin-loss" : "fin-profit") : "text-zinc-500"}`}>
            {!hasGap
              ? `${marketplaceLabel} tam mutabık ✓`
              : gap > 0
                ? `${marketplaceLabel} ${money(gap, currency)} eksik ödemiş görünüyor`
                : `Gerçek ödeme, beklenenden ${money(-gap, currency)} fazla`}
          </div>
        </div>
      )}
    </div>
  );
}
