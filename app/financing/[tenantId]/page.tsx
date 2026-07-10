"use client";

/**
 * FINANCING SCREEN — /financing/[tenantId]  (Ekran 3, the "unlock")
 *
 * "Because we see your real margin, we can price you correctly." Shows the approved
 * limit + take-rate from the explainable underwriting model, its decision trace
 * (rationale), and a side-by-side backtest vs a margin-blind incumbent that
 * over-lends to the silent-loser seller. Fed live by lib/engine (getFinancing).
 */

import { use, useState } from "react";
import Link from "next/link";
import { getSellers, getFinancing } from "@/lib/engine";
import { ExplainPanel } from "@/components/explain-panel";

const PROFIT = "#0B7A4B";
const EROSION = "#B4432E";

function money(n: number, currency: string) {
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
  return currency === "USD" ? `$${s}` : `₺${s}`;
}
const pct1 = (n: number) => `${n.toFixed(1)}%`;

export default function FinancingPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId: routeTenant } = use(params);
  const sellers = getSellers();
  const initial = sellers.some((s) => s.tenantId === routeTenant) ? routeTenant : "seller-b";
  const [tenantId, setTenantId] = useState(initial);
  const [explainOpen, setExplainOpen] = useState(false);

  const fin = getFinancing(tenantId) ?? getFinancing("seller-b")!;
  const { decision, ourOutcome, incumbentDecision, incumbentOutcome, report, currency, label } = fin;
  const approved = decision.approvedLimit > 0;

  const lossReduction = Math.round(report.lossReductionPct * 100);
  const chargeOffOurs = report.trueMargin.chargeOffRate * 100;
  const chargeOffInc = report.incumbent.chargeOffRate * 100;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="font-heading text-lg font-bold tracking-tight text-foreground">
            [BRAND]
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href={`/reveal/${tenantId}`} className="transition-colors hover:text-foreground">
              ← Reveal
            </Link>
            <Link href="/" className="transition-colors hover:text-foreground">
              Overview
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
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
          {/* LEFT: the unlock — approved limit + take-rate + decision trace */}
          <section>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {approved ? "Approved limit" : "Underwriting decision"}
            </div>
            <div
              className="tnum mt-2 font-heading text-6xl font-bold leading-none tracking-tight sm:text-7xl"
              style={{ color: approved ? PROFIT : EROSION }}
            >
              {approved ? money(decision.approvedLimit, currency) : "Declined"}
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              {approved ? (
                <>
                  Priced at a take-rate of{" "}
                  <span className="tnum font-medium text-foreground">{pct1(decision.takeRate * 100)}</span> (target band
                  3–6%). Sized to real contribution profit, not a revenue snapshot.
                </>
              ) : (
                <>
                  This seller’s true margin can’t service new debt, so the model advances{" "}
                  <span className="tnum font-medium text-foreground">{money(0, currency)}</span>. A revenue-snapshot
                  lender would not see this — and would lend anyway.
                </>
              )}
            </p>

            <button
              onClick={() => setExplainOpen(true)}
              className="mt-6 inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Why this limit? →
            </button>

            <div className="mt-8">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Decision trace</div>
              <ol className="mt-3 space-y-2">
                {decision.rationale.map((r, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/80">
                    <span className="tnum shrink-0 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                Rule-based and explainable (EU AI Act) — the decision is recorded immutably as a decision trace.
              </p>
            </div>
          </section>

          {/* RIGHT: backtest — us vs incumbent */}
          <section>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Backtest — us vs incumbent
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <ModelCard
                title="TrueMargin"
                subtitle="prices on real margin"
                limit={money(decision.approvedLimit, currency)}
                take={approved ? pct1(decision.takeRate * 100) : "—"}
                outcome={ourOutcome.isLoan ? (ourOutcome.impaired ? "Impaired" : "Performing") : "Declined"}
                outcomeColor={ourOutcome.impaired ? EROSION : PROFIT}
                loss={money(ourOutcome.loss, currency)}
                highlight
              />
              <ModelCard
                title="Incumbent"
                subtitle="revenue snapshot only"
                limit={money(incumbentDecision.approvedLimit, currency)}
                take={pct1(incumbentDecision.takeRate * 100)}
                outcome={incumbentOutcome.isLoan ? (incumbentOutcome.impaired ? "Impaired" : "Performing") : "Declined"}
                outcomeColor={incumbentOutcome.impaired ? EROSION : PROFIT}
                loss={money(incumbentOutcome.loss, currency)}
              />
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card p-5">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Portfolio (N=3)
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <Metric label="Charge-off (us)" value={pct1(chargeOffOurs)} color={PROFIT} />
                <Metric label="Charge-off (incumbent)" value={pct1(chargeOffInc)} color={EROSION} />
                <Metric label="Loss reduction" value={`${lossReduction}%`} color={PROFIT} />
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                N=3 design partners — proof of mechanism, not a statistical loss-rate. The incumbent over-advances to
                the silent-loser seller because it can’t see true margin; repayment can only come from real
                contribution, so its simulated charge-off is higher exactly where the margin engine flags risk.
              </p>
            </div>
          </section>
        </div>
      </main>

      <ExplainPanel open={explainOpen} onClose={() => setExplainOpen(false)} decision={decision} sellerLabel={label} />
    </div>
  );
}

function ModelCard({
  title,
  subtitle,
  limit,
  take,
  outcome,
  outcomeColor,
  loss,
  highlight,
}: {
  title: string;
  subtitle: string;
  limit: string;
  take: string;
  outcome: string;
  outcomeColor: string;
  loss: string;
  highlight?: boolean;
}) {
  return (
    <div className={"rounded-xl border p-4 " + (highlight ? "border-primary/40 bg-card" : "border-border bg-card")}>
      <div className="font-heading text-sm font-bold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Limit" value={limit} />
        <Row label="Take-rate" value={take} />
        <Row label="Outcome" value={<span style={{ color: outcomeColor }}>{outcome}</span>} />
        <Row label="Sim. loss" value={<span className="tnum" style={{ color: loss === "₺0" || loss === "$0" ? undefined : outcomeColor }}>{loss}</span>} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <dd className="tnum font-heading text-xl font-bold" style={{ color }}>
        {value}
      </dd>
      <dt className="mt-1 text-xs leading-tight text-muted-foreground">{label}</dt>
    </div>
  );
}
