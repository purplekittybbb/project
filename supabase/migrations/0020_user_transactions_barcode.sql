-- 0020 — user_transactions: add barcode column
-- Enables barcode-based cross-marketplace product matching (lib/quality/barcode.ts).
-- Trendyol API already returns barcode — populated via next sync after this migration.
-- STATUS: NOT YET APPLIED — apply only after approval.
alter table public.user_transactions add column if not exists barcode text;
create index if not exists user_transactions_barcode_idx on public.user_transactions(user_id, barcode) where barcode is not null;
