-- 0022 — user_transactions: add product_name column
--
-- PURPOSE: Stores the human-readable product title from the marketplace API
-- (e.g. Trendyol's productName field on order lines). Used by the visibility
-- scan cron as the search keyword instead of the internal SKU code.
--
-- WHY IT'S NEEDED:
--   The visibility cron (app/api/cron/scan-visibility) previously used the SKU
--   code (e.g. "SKU-0042") as the Trendyol search keyword. Searching for a SKU
--   code returns 0 results — the fix is to search by the product's actual title.
--   Trendyol's Orders API already returns productName on each order line; this
--   migration provides the column to persist it.
--
-- BACKFILL NOTE:
--   Existing rows will have product_name = NULL. The cron falls back to sku
--   when product_name is NULL (safe degradation). New rows from the next sync
--   will populate product_name automatically.
--
-- STATUS: NOT YET APPLIED — apply only after approval.

alter table public.user_transactions
  add column if not exists product_name text;

-- Partial index: only index non-null values to keep index small
create index if not exists user_transactions_product_name_idx
  on public.user_transactions(user_id, product_name)
  where product_name is not null;
