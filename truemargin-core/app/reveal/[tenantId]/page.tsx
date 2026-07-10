"use client";

/**
 * REVEAL SCREEN  —  app/reveal/[tenantId]/page.tsx
 *
 * Runs on top of the untouched engine: computeTrueMargin / computePerceivedMargin /
 * perSkuMargins. PDF principles applied:
 *  - Most critical figure top-left (true margin)
 *  - Every number carries context (perceived -> true gap)
 *  - Fee waterfall = bar chart (not pie), value on each bar (direct labeling)
 *  - Tabular figures, no gradient/shadow/emoji, data-ink ~1
 *  - Rounded numbers
 *
 * Imports are wired to this project's architecture: the UI never touches /src
 * directly — everything goes through the lib/engine bridge.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  SELLERS,
  aggregatePerceivedMargin,
  aggregateTrueMargin,
  perSkuMargins,
  type Transaction,
} from "@/lib/engine";

// ---- colors (same language as the landing; dark green accent) ----
const INK = "#111111";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const PROFIT = "#0A7D4F";
const EROSION = "#B4432E";
const ACCENT = "#0B1F17"; // dark green — matches landing hero

const fmtNum = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// mono + tabular figures (PDF rule) — uses the fonts loaded in layout.tsx
const numStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  fontVariantNumeric: "tabular-nums",
};

export default function RevealPage({ params }: { params: { tenantId: string } }) {
  // Initialise from the route param; fall back to the silent-loser seller for the demo.
  const initial = SELLERS.some((s) => s.tenantId === params.tenantId)
    ? params.tenantId
    : "seller-b";
  const [tenantId, setTenantId] = useState(initial);
  const seller = SELLERS.find((s) => s.tenantId === tenantId) ?? SELLERS[0];
  const txs = seller.transactions;

  const perceived = useMemo(() => aggregatePerceivedMargin(txs), [txs]);
  const trueM = useMemo(() => aggregateTrueMargin(txs), [txs]);
  const skus = useMemo(() => perSkuMargins(txs), [txs]);

  // fee waterfall data
  const fees = useMemo(() => {
    const f = { commission: 0, vat: 0, shipping: 0, returns: 0, ad: 0, pay: 0 };
    let cogs = 0;
    txs.forEach((t: Transaction) => {
      f.commission += t.fees.commission;
      f.vat += t.fees.vat;
      f.shipping += t.fees.shipping;
      f.returns += t.fees.returnsAllocated;
      f.ad += t.fees.adSpendAllocated;
      f.pay += t.fees.paymentFees;
      cogs += t.cogs;
    });
    return { ...f, cogs };
  }, [txs]);

  const gross = trueM.grossRevenue;
  const gap = perceived.marginPct - trueM.marginPct;

  const waterfallRows = [
    { label: "Gross revenue", value: gross, color: INK, positive: true },
    { label: "Commission", value: -fees.commission, color: EROSION },
    { label: "VAT", value: -fees.vat, color: EROSION },
    { label: "Shipping", value: -fees.shipping, color: EROSION },
    { label: "Returns", value: -fees.returns, color: EROSION },
    { label: "Ad spend", value: -fees.ad, color: EROSION },
    { label: "Payment fees", value: -fees.pay, color: EROSION },
    { label: "COGS", value: -fees.cogs, color: MUTED },
  ];

  return (
    <div lang="en" style={{ background: "#FFFFFF", color: INK, minHeight: "100vh", fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "56px 32px" }}>
        {/* back to portfolio */}
        <Link
          href="/"
          style={{ fontSize: 13, color: MUTED, textDecoration: "none", display: "inline-block", marginBottom: 28 }}
        >
          ← Portfolio
        </Link>

        {/* seller selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
          {SELLERS.map((s) => (
            <button
              key={s.tenantId}
              onClick={() => setTenantId(s.tenantId)}
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 500,
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${s.tenantId === tenantId ? ACCENT : LINE}`,
                background: s.tenantId === tenantId ? ACCENT : "#FFFFFF",
                color: s.tenantId === tenantId ? "#FFFFFF" : INK,
                cursor: "pointer",
              }}
            >
              {s.tenantId.replace("seller-", "Seller ").toUpperCase()}
            </button>
          ))}
        </div>

        {/* GRID: top-left = most critical figure (PDF rule) */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 32 }}>
          {/* TOP-LEFT: true margin */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 12 }}>
              True margin
            </div>
            <div
              style={{
                ...numStyle,
                fontSize: 72,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                color: trueM.marginPct >= 0 ? PROFIT : EROSION,
              }}
            >
              {fmtPct(trueM.marginPct)}
            </div>
            {/* context: a bare number is meaningless (PDF rule) */}
            <div style={{ fontSize: 14, color: MUTED, marginTop: 10 }}>
              Seller believes they make{" "}
              <span style={{ ...numStyle, color: INK }}>{fmtPct(seller.perceivedMarginBelief)}</span>{" "}
              —{" "}
              <span style={{ ...numStyle, color: EROSION, fontWeight: 600 }}>
                {gap >= 0 ? "−" : "+"}
                {Math.abs(gap).toFixed(1)} pt
              </span>{" "}
              gap.
            </div>

            {/* fee waterfall */}
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 16 }}>
                Where the margin goes
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {waterfallRows.map((r) => {
                  const w = Math.min(100, (Math.abs(r.value) / gross) * 100);
                  return (
                    <div key={r.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 96px", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 13, color: INK }}>{r.label}</div>
                      <div style={{ height: 8, background: LINE, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${w}%`, background: r.color, borderRadius: 4 }} />
                      </div>
                      {/* direct labeling: value next to the bar */}
                      <div style={{ ...numStyle, fontSize: 12.5, textAlign: "right", color: MUTED }}>
                        {r.value < 0 ? "−" : ""}
                        {fmtNum(Math.abs(r.value))}
                      </div>
                    </div>
                  );
                })}
                {/* net contribution row */}
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 96px", alignItems: "center", gap: 12, paddingTop: 8, borderTop: `1px solid ${LINE}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>Net contribution</div>
                  <div />
                  <div style={{ ...numStyle, fontSize: 12.5, textAlign: "right", fontWeight: 600, color: trueM.netContribution >= 0 ? PROFIT : EROSION }}>
                    {trueM.netContribution < 0 ? "−" : ""}
                    {fmtNum(Math.abs(trueM.netContribution))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT: SKU table — silent losers */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 16 }}>
              SKU breakdown — silent losers
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: MUTED, padding: "0 0 10px", borderBottom: `1px solid ${LINE}` }}>SKU</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: MUTED, padding: "0 0 10px", borderBottom: `1px solid ${LINE}` }}>Perceived</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: MUTED, padding: "0 0 10px", borderBottom: `1px solid ${LINE}` }}>True</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((r) => (
                  <tr key={r.sku}>
                    <td style={{ padding: "11px 0", borderBottom: `1px solid ${LINE}` }}>
                      <span style={{ ...numStyle, fontSize: 12.5 }}>{r.sku}</span>
                      {r.isSilentLoser && (
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#B4432E14", color: EROSION }}>
                          silent loser
                        </span>
                      )}
                    </td>
                    <td style={{ ...numStyle, padding: "11px 0", borderBottom: `1px solid ${LINE}`, textAlign: "right", color: r.perceivedMarginPct >= 0 ? PROFIT : EROSION }}>
                      {fmtPct(r.perceivedMarginPct)}
                    </td>
                    <td style={{ ...numStyle, padding: "11px 0", borderBottom: `1px solid ${LINE}`, textAlign: "right", color: r.trueMarginPct >= 0 ? PROFIT : EROSION }}>
                      {fmtPct(r.trueMarginPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 20, fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
              Figures are computed live by the engine. Seed data is representative; it
              recomputes automatically once real settlement data is loaded.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
