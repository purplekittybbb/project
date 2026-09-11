/**
 * N11 hakediş (settlement-line) comparator.
 *
 * Compares the engine's documented deductions against a seller-pasted
 * panel payout. This is the remaining ±5% check from the official-fee work:
 * we cannot read a live N11 seller account here; the seller supplies one
 * hakediş line (satış tutarı, kategori oranı, panel hakediş).
 *
 * Hakediş in the N11 panel is typically:
 *   satış (KDV dahil) − komisyon − pazarlama − pazaryeri − stopaj
 * Seller COGS / own shipping are NOT in that line — they are excluded here.
 */

import { computeCommission } from "../calc/commission";
import {
  REPRESENTATIVE_N11_FEES,
  computeN11DocumentedExtraFees,
} from "./n11";

export const N11_HAKEDIS_TOLERANCE = 0.05;

export interface N11HakedisLine {
  /** KDV dahil satış tutarı (panel). */
  grossRevenue: number;
  /** Satıcının panelindeki kategori komisyon oranı (0.10 = %10). */
  publishedCommissionRate: number;
  /** Mal KDV oranı. Default 0.20. */
  vatRate?: number;
  /** Panel "hakediş" / net ödeme (COGS ve satıcı kargosu hariç). */
  panelPayout: number;
}

export interface N11HakedisCompareResult {
  enginePayout: number;
  panelPayout: number;
  commission: number;
  extrasTotal: number;
  absDiff: number;
  pctDiff: number;
  within5Pct: boolean;
}

export function compareN11HakedisLine(line: N11HakedisLine): N11HakedisCompareResult {
  const vatRate = line.vatRate ?? REPRESENTATIVE_N11_FEES.vatRate;
  const { commission, commissionVat } = computeCommission(line.grossRevenue, {
    rate: line.publishedCommissionRate,
    basis: REPRESENTATIVE_N11_FEES.commissionBasis,
    vatRate,
    commissionVatRate: vatRate,
  });
  const extras = computeN11DocumentedExtraFees(line.grossRevenue, vatRate);
  const enginePayout = line.grossRevenue - commission - commissionVat - extras.total;
  const absDiff = Math.abs(enginePayout - line.panelPayout);
  const denom = Math.abs(line.panelPayout) > 0 ? Math.abs(line.panelPayout) : Math.abs(enginePayout) || 1;
  const pctDiff = absDiff / denom;

  return {
    enginePayout,
    panelPayout: line.panelPayout,
    commission,
    extrasTotal: extras.total,
    absDiff,
    pctDiff,
    within5Pct: pctDiff < N11_HAKEDIS_TOLERANCE,
  };
}
