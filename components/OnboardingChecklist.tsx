"use client";

/**
 * Başlangıç kontrol listesi — yeni bir hesabın ürünü tam olarak kullanmaya
 * başlaması için gereken adımları gösterir (rakip analizinde önerilen
 * "onboarding checklist / ilerleme çubuğu"). Sahibi kapatabilir; tüm adımlar
 * tamamlanınca kendiliğinden gizlenir. İlerleme, sunucuda hiçbir yere
 * yazılmaz — yalnızca bu tarayıcıda hatırlanır (localStorage), bu yüzden
 * kritik bir veri değil, salt bir UI kolaylığıdır.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { loadAllSettlementPayouts } from "@/lib/supabase/settlement";

const DISMISS_KEY = "tm_onboarding_dismissed";
const EXPORT_KEY = "tm_export_used";

/** export-csv.ts'nin çağırdığı, "en az bir kez dışa aktarma yapıldı" işareti. */
export function markExportUsed(): void {
  try {
    localStorage.setItem(EXPORT_KEY, "1");
  } catch {
    // localStorage yoksa (gizli sekme vs.) sessizce yok say — kritik değil.
  }
}

interface Props {
  authConfigured: boolean;
  hasMarketplaceConnected: boolean;
  hasRealData: boolean;
  onGoToSettlement: () => void;
  onGoToProducts: () => void;
}

export function OnboardingChecklist({
  authConfigured,
  hasMarketplaceConnected,
  hasRealData,
  onGoToSettlement,
  onGoToProducts,
}: Props) {
  const [dismissed, setDismissed] = useState(true); // SSR-safe default; localStorage read on mount
  const [hasSettlementEntry, setHasSettlementEntry] = useState(false);
  const [hasExported, setHasExported] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      setHasExported(localStorage.getItem(EXPORT_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!authConfigured) return;
    let cancelled = false;
    loadAllSettlementPayouts().then((rows) => {
      if (!cancelled) setHasSettlementEntry(rows.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [authConfigured]);

  if (!ready || !authConfigured || dismissed) return null;

  const steps = [
    { done: hasMarketplaceConnected, label: "Bir pazaryeri bağlayın", onClick: undefined },
    { done: hasRealData, label: "İlk gerçek satış verinizi görün", onClick: undefined },
    { done: hasSettlementEntry, label: "Gerçek hakediş tutarınızı girin", onClick: onGoToSettlement },
    { done: hasExported, label: "Bir raporu dışa aktarın", onClick: onGoToProducts },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // her şey tamam — kendiliğinden gizlen

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // yok say
    }
    setDismissed(true);
  }

  return (
    <div className="mb-12 border border-zinc-900 bg-zinc-950/50">
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-900">
        <div className="flex items-center gap-3">
          <span className="text-zinc-300 text-sm font-medium">Başlangıç kontrol listesi</span>
          <span className="text-zinc-600 text-[11px] font-mono tabular-nums">
            {doneCount}/{steps.length}
          </span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-zinc-600 hover:text-zinc-300 transition-colors"
          title="Kapat"
        >
          <X size={14} />
        </button>
      </div>
      <div className="h-1 bg-zinc-900">
        <div
          className="h-full bg-[var(--tm-copper)] transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ul className="px-5 py-4 space-y-2.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            {s.done ? (
              <CheckCircle2 size={15} className="fin-profit shrink-0" />
            ) : (
              <Circle size={15} className="text-zinc-700 shrink-0" />
            )}
            {s.onClick && !s.done ? (
              <button
                type="button"
                onClick={s.onClick}
                className="text-zinc-400 hover:text-zinc-200 transition-colors underline decoration-zinc-800 underline-offset-4 text-left"
              >
                {s.label}
              </button>
            ) : (
              <span className={s.done ? "text-zinc-500 line-through" : "text-zinc-400"}>{s.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
