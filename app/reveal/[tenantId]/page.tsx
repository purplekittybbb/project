"use client";

/**
 * REVEAL SCREEN — /reveal/[tenantId]
 *
 * The "money moment": a seller's perceived margin erodes to its true margin once the
 * full fee waterfall is deducted. Ported into the merged app, fed live by the engine
 * through lib/engine (computeTrueMargin / computePerceivedMargin / perSkuMargins), and
 * styled in the landing's design language (warm background, white cards, Inter Tight
 * headings, tabular figures, the dark-green waterfall instrument).
 *
 * PDF principles: true margin top-left, fee waterfall as a bar chart with a value on
 * every bar, tabular numbers, no gradients/shadows, silent-loser SKU table.
 */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { getSellers, getSeller } from "@/lib/engine";
import { FeeWaterfall, type WaterfallStep } from "@/components/fee-waterfall";

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function RevealPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId: routeTenant } = use(params);
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

  // Build waterfall steps: start at perceived margin, subtract the hidden fees
  // (VAT, shipping, returns, ad spend, payment) as points of revenue, land on true.
  const steps: WaterfallStep[] = useMemo(() => {
    const asPct = (v: number) => (revenue ? (v / revenue) * 100 : 0);
    const losses = [
      { label: ["VAT"], amt: w.vat },
      { label: ["Shipping"], amt: w.shipping },
      { label: ["Returns"], amt: w.returnsAllocated },
      { label: ["Ad", "spend"], amt: w.adSpendAllocated },
      { label: ["Payment"], amt: w.paymentFees },
    ];
    const out: WaterfallStep[] = [
      { label: ["Perceived"], low: 0, high: perceived, kind: "start", tag: `${perceived.toFixed(0)}%` },
    ];
    let cum = perceived;
    for (const l of losses) {
      const p = asPct(l.amt);
      out.push({ label: l.label, low: cum - p, high: cum, kind: "loss", tag: `−${p.toFixed(1)}` });
      cum -= p;
    }
    out.push({
      label: ["True", "margin"],
      low: Math.min(0, trueM),
      high: Math.max(0, trueM),
      kind: "result",
      tag: fmtPct(trueM),
    });
    return out;
  }, [w, revenue, perceived, trueM]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="font-heading text-lg font-bold tracking-tight text-foreground">
            [BRAND]
          </Link>
          <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Overview
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
        {/* seller selector */}
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
          {/* LEFT: true margin (top-left) + waterfall instrument */}
          <section>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">True margin</div>
            <div
              className="tnum mt-2 font-heading text-6xl font-bold leading-none tracking-tight sm:text-7xl"
              style={{ color: trueNeg ? "#B4432E" : "#0B7A4B" }}
            >
              {fmtPct(trueM)}
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              Engine reads a perceived margin of{" "}
              <span className="tnum font-medium text-foreground">{fmtPct(perceived)}</span>. Once VAT, shipping,
              returns, ad spend and payment fees are allocated per SKU, the real contribution margin is{" "}
              <span className="tnum font-medium" style={{ color: trueNeg ? "#B4432E" : "#0B7A4B" }}>
                {fmtPct(trueM)}
              </span>{" "}
              — a <span className="tnum font-medium text-foreground">{hiddenPts.toFixed(1)} pt</span> gap. Seller’s own
              estimate: <span className="tnum">{view.perceivedMarginBelief}%</span>.
            </p>

            <div className="mt-6">
              <FeeWaterfall
                steps={steps}
                caption={`${view.label} · ${view.category} · margin per revenue`}
                perceivedPct={perceived}
                truePct={trueM}
                hiddenPts={hiddenPts}
              />
            </div>

            <Link
              href={`/financing/${tenantId}`}
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Because we see this, we can price you → Financing
            </Link>
          </section>

          {/* RIGHT: silent-loser SKU table */}
          <section>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              SKU breakdown — silent losers
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">SKU</th>
                    <th className="px-4 py-3 text-right font-medium">Perceived</th>
                    <th className="px-4 py-3 text-right font-medium">True</th>
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
                            silent loser
                          </span>
                        )}
                      </td>
                      <td className="tnum px-4 py-3 text-right" style={{ color: r.perceivedMarginPct >= 0 ? "#0B7A4B" : "#B4432E" }}>
                        {fmtPct(r.perceivedMarginPct)}
                      </td>
                      <td className="tnum px-4 py-3 text-right" style={{ color: r.trueMarginPct >= 0 ? "#0B7A4B" : "#B4432E" }}>
                        {fmtPct(r.trueMarginPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-5 max-w-md text-xs leading-relaxed text-muted-foreground">
              Figures are computed live by the engine from representative seed data. Replace the raw settlement rows and
              the reveal, underwriting and backtest all recompute automatically. N=3 design partners — proof of
              mechanism, not a statistical loss-rate.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
