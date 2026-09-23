"use client";

/**
 * REVEAL SCREEN — /reveal/[tenantId]
 * Investor "money moment": perceived → true margin via fee waterfall.
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSellers, getSeller } from "@/lib/engine";
import { FeeWaterfall, type WaterfallStep } from "@/components/fee-waterfall";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";

const fmtPct = (n: number) =>
  `%${n.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

export default function RevealPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId: routeTenant } = use(params);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthConfigured()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) router.replace("/dashboard");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const sellers = useMemo(() => getSellers(), []);
  const initial = sellers.some((s) => s.tenantId === routeTenant) ? routeTenant : "seller-b";
  const [tenantId, setTenantId] = useState(initial);

  const view = getSeller(tenantId) ?? sellers[0];
  const w = view.waterfall;
  const revenue = w.grossRevenue;
  const perceived = view.perceivedMarginPct;
  const trueM = view.trueMarginPct;
  const hiddenPts = perceived - trueM;
  const trueNeg = trueM < 0;

  const steps: WaterfallStep[] = useMemo(() => {
    const asPct = (v: number) => (revenue ? (v / revenue) * 100 : 0);
    const losses = [
      { label: ["KDV"], amt: w.vat },
      { label: ["Komisyon"], amt: w.commission },
      { label: ["Kargo"], amt: w.shipping },
      { label: ["Ambalaj"], amt: w.packaging ?? 0 },
      { label: ["İade"], amt: w.returnsAllocated },
      { label: ["Reklam"], amt: w.adSpendAllocated },
      { label: ["Ödeme"], amt: w.paymentFees },
    ].filter((l) => (l.amt ?? 0) > 0);
    const out: WaterfallStep[] = [
      {
        label: ["Görünen"],
        low: 0,
        high: perceived,
        kind: "start",
        tag: `%${perceived.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`,
      },
    ];
    let cum = perceived;
    for (const l of losses) {
      const p = asPct(l.amt ?? 0);
      out.push({
        label: l.label,
        low: cum - p,
        high: cum,
        kind: "loss",
        tag: `−${p.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
      });
      cum -= p;
    }
    out.push({
      label: ["Gerçek", "marj"],
      low: Math.min(0, trueM),
      high: Math.max(0, trueM),
      kind: "result",
      tag: fmtPct(trueM),
    });
    return out;
  }, [w, revenue, perceived, trueM]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="font-heading text-lg font-bold tracking-tight text-foreground">
            TrueMargin
          </Link>
          <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Genel bakış
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
        <p className="mb-4 text-xs text-muted-foreground">
          Demo yüzeyi · Trendyol kanalı · seed satıcı verisi (gerçek hesap verisi değil)
        </p>
        <div className="mb-10 flex flex-wrap items-center gap-2">
          {sellers.map((s) => {
            const active = s.tenantId === tenantId;
            return (
              <button
                key={s.tenantId}
                onClick={() => setTenantId(s.tenantId)}
                aria-pressed={active}
                className={
                  "h-9 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted")
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Gerçek net marj
            </div>
            <div
              className="tnum mt-2 font-heading text-6xl font-bold leading-none tracking-tight sm:text-7xl"
              style={{ color: trueNeg ? "#B4432E" : "#0B7A4B" }}
            >
              {fmtPct(trueM)}
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              Motor görünen marjı{" "}
              <span className="tnum font-medium text-foreground">{fmtPct(perceived)}</span> olarak okur.
              KDV, komisyon, kargo, ambalaj, iade, reklam ve ödeme ücretleri SKU bazında düşülünce
              gerçek katkı marjı{" "}
              <span className="tnum font-medium" style={{ color: trueNeg ? "#B4432E" : "#0B7A4B" }}>
                {fmtPct(trueM)}
              </span>{" "}
              —{" "}
              <span className="tnum font-medium text-foreground">
                {hiddenPts.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} puan
              </span>{" "}
              fark. Satıcının kendi tahmini:{" "}
              <span className="tnum">
                %{view.perceivedMarginBelief.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
              </span>
              .
            </p>

            <div className="mt-6">
              <FeeWaterfall
                steps={steps}
                caption={`${view.label} · ${view.category} · ciroya göre marj`}
                perceivedPct={perceived}
                truePct={trueM}
                hiddenPts={hiddenPts}
              />
            </div>

            <Link
              href={`/financing/${tenantId}`}
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Bu yüzden fiyatlayabiliyoruz → Finansman
            </Link>
          </section>

          <section>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              SKU kırılımı — sessiz zarar edenler
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">SKU</th>
                    <th className="px-4 py-3 text-right font-medium">Görünen</th>
                    <th className="px-4 py-3 text-right font-medium">Gerçek</th>
                  </tr>
                </thead>
                <tbody>
                  {view.skus.map((r) => (
                    <tr key={r.sku} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span className="tnum font-medium">{r.sku}</span>
                        {r.isSilentLoser && (
                          <span
                            className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ background: "rgba(180,67,46,0.10)", color: "#B4432E" }}
                          >
                            sessiz zarar
                          </span>
                        )}
                      </td>
                      <td
                        className="tnum px-4 py-3 text-right"
                        style={{ color: r.perceivedMarginPct >= 0 ? "#0B7A4B" : "#B4432E" }}
                      >
                        {fmtPct(r.perceivedMarginPct)}
                      </td>
                      <td
                        className="tnum px-4 py-3 text-right"
                        style={{ color: r.trueMarginPct >= 0 ? "#0B7A4B" : "#B4432E" }}
                      >
                        {fmtPct(r.trueMarginPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
