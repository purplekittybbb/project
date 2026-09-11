/**
 * Guest profit calculator — wraps lib/calc/net-profit with marketplace fee presets.
 */

import { computeNetProfit, type NetProfitResult } from "@/lib/calc/net-profit";
import { computeN11DocumentedExtraFees } from "@/lib/adapters/n11";
import type { InternalCategory } from "@/lib/domain/internal-category";
import {
  commissionRuleFor,
  feeConfigFor,
  type GuestMarketplace,
} from "./marketplace-fees";

export interface GuestProfitInput {
  marketplace: GuestMarketplace;
  category: InternalCategory;
  /** VAT-inclusive sale price (TRY). */
  salePrice: number;
  unitCost: number;
  shipping: number;
  /** Return rate 0–100 (percent). */
  returnRatePercent: number;
  adSpend?: number;
  packaging?: number;
}

export interface GuestProfitResult extends NetProfitResult {
  marketplace: GuestMarketplace;
  category: InternalCategory;
  commissionRatePct: number;
  paymentFees: number;
  n11ExtraFees?: number;
}

export function calcGuestProfit(input: GuestProfitInput): GuestProfitResult {
  const fees = feeConfigFor(input.marketplace);
  const rule = commissionRuleFor(input.marketplace, input.category);
  const grossRevenue = Math.max(0, input.salePrice);
  const paymentFees = grossRevenue * fees.paymentFeeRate;

  let extraFees = 0;
  if (input.marketplace === "n11") {
    extraFees = computeN11DocumentedExtraFees(grossRevenue, fees.vatRate).total;
  }

  const result = computeNetProfit({
    grossRevenue,
    cogs: Math.max(0, input.unitCost),
    shipping: Math.max(0, input.shipping),
    adSpend: Math.max(0, input.adSpend ?? 0),
    paymentFees,
    returnRatePercent: Math.min(100, Math.max(0, input.returnRatePercent)) / 100,
    commissionRule: rule,
    extraFees,
    packagingCost: Math.max(0, input.packaging ?? 0),
  });

  return {
    ...result,
    marketplace: input.marketplace,
    category: input.category,
    commissionRatePct: rule.rate * 100,
    paymentFees,
    n11ExtraFees: input.marketplace === "n11" ? extraFees : undefined,
  };
}
