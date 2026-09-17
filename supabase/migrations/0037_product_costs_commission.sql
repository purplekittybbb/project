-- ─────────────────────────────────────────────────────────────────────────────
-- 0037 — product_costs.commission_rate
--
-- Adds the seller's own marketplace commission rate (0..1) to the per-SKU cost
-- profile. The representative per-category commission table (lib/adapters/*)
-- is only an approximation; a seller's real, negotiated rate differs. When this
-- is set (> 0), lib/adapters resolve commission from it instead of the category
-- table (see effectiveCommissionRate + lib/calc/enrich.ts), making "gerçek net
-- kâr" exact rather than approximate. 0 means "use the representative rate".
--
-- Depends on 0015_product_costs. Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- STATUS: written, NOT YET APPLIED to production — apply after 0015.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.product_costs
  add column if not exists commission_rate numeric not null default 0;
