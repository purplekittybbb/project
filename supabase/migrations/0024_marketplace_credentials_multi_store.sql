-- 0024 — marketplace_credentials: multi-store support
--
-- Current schema has unique(user_id, marketplace) which limits each user to
-- one store per marketplace. Professional sellers commonly run 2+ Trendyol
-- shops under the same iyzico/email account.
--
-- CHANGE:
--   DROP: unique(user_id, marketplace)
--   ADD:  store_label text not null default '' — human-readable label, e.g.
--         "Ana Mağaza", "Outlet", "Trendyol 2"
--   ADD:  unique(user_id, marketplace, store_label) — allows multiple stores
--         as long as each has a distinct label within the same marketplace.
--
-- BACKWARD COMPATIBILITY:
--   Existing rows: store_label defaults to '' (empty string).
--   The old unique constraint is dropped; the new one replaces it.
--   An empty store_label is still valid — it means "default/only store".
--
-- STATUS: NOT YET APPLIED — show to user before applying.

alter table public.marketplace_credentials
  add column if not exists store_label text not null default '';

-- Drop old unique constraint that prevented multi-store
alter table public.marketplace_credentials
  drop constraint if exists marketplace_credentials_user_id_marketplace_key;

-- New constraint: unique per (user, marketplace, store_label)
-- This means the same user CAN have two Trendyol stores as long as labels differ.
alter table public.marketplace_credentials
  add constraint marketplace_credentials_user_marketplace_label_key
  unique (user_id, marketplace, store_label);
