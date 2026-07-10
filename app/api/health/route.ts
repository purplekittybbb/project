import { NextResponse } from "next/server";
import { getSellers, getBacktest } from "@/lib/engine";

/**
 * Proof endpoint: the moved engine is imported and executed inside the Next app.
 * Returns live figures computed by /lib (not hard-coded). Safe to remove once the
 * landing is wired to the engine through real pages.
 */
export function GET() {
  const sellers = getSellers().map((s) => ({
    tenantId: s.tenantId,
    perceivedMarginPct: Number(s.perceivedMarginPct.toFixed(1)),
    trueMarginPct: Number(s.trueMarginPct.toFixed(1)),
  }));
  const { report, ledgerSize } = getBacktest();

  return NextResponse.json({
    ok: true,
    engine: "imported from /lib",
    sellers,
    backtest: {
      lossReductionPct: Number((report.lossReductionPct * 100).toFixed(0)),
      trueMarginLoss: report.trueMargin.totalLoss,
      incumbentLoss: report.incumbent.totalLoss,
    },
    ledgerSize,
  });
}
