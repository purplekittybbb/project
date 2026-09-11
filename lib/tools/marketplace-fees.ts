/**
 * Representative marketplace fee configs for guest tools (profit calc, safe price).
 */

import { REPRESENTATIVE_HEPSIBURADA_FEES } from "@/lib/adapters/hepsiburada";
import { REPRESENTATIVE_N11_FEES } from "@/lib/adapters/n11";
import { REPRESENTATIVE_TRENDYOL_FEES } from "@/lib/adapters/trendyol";
import type { CommissionRule } from "@/lib/calc/commission";
import type { FeeConfig } from "@/lib/adapters/marketplace-adapter";
import { resolveCommissionRate } from "@/lib/adapters/marketplace-adapter";
import { INTERNAL_CATEGORIES, type InternalCategory } from "@/lib/domain/internal-category";

export type GuestMarketplace = "trendyol" | "hepsiburada" | "n11";

const FEE_BY_MP: Record<GuestMarketplace, FeeConfig> = {
  trendyol: REPRESENTATIVE_TRENDYOL_FEES,
  hepsiburada: REPRESENTATIVE_HEPSIBURADA_FEES,
  n11: REPRESENTATIVE_N11_FEES,
};

export function feeConfigFor(marketplace: GuestMarketplace): FeeConfig {
  return FEE_BY_MP[marketplace];
}

export function commissionRuleFor(
  marketplace: GuestMarketplace,
  category: InternalCategory,
): CommissionRule {
  const fees = feeConfigFor(marketplace);
  return {
    rate: resolveCommissionRate(fees, category),
    basis: fees.commissionBasis,
    vatRate: fees.vatRate,
    commissionVatRate:
      fees.commissionBasis === "vat-included" ? 0 : fees.vatRate,
  };
}

export { INTERNAL_CATEGORIES };
