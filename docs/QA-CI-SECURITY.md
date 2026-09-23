# TrueMargin — CI / QA güvenlik katmanı (özet)

## 1. RLS tenant izolasyonu
- `tests/supabase/rls-tenant-isolation.test.ts`
- Migration: `0038_rls_hardening_free_tier.sql`, `0039_force_rls_tenant_tables.sql`

## 2. Scraper 429 / sahte ₺0 yok
- `tests/scrapers/price-tracker.test.ts`, `tests/scrapers/visibility.test.ts`
- `hasUsablePrices` + `isUsableStandaloneResult` (queued ≠ usable)

## 3. BullMQ (opsiyonel Redis)
- `lib/queues/*` — backoff 2s→4s→8s
- `GET /api/admin/queues` (Bearer CRON_SECRET)
- UI: `/admin/queues`
- `REDIS_URL` yoksa Postgres scrape_leases devam eder

## 4. CI hooks
- `next.config.mjs` → `ignoreBuildErrors: false`
- Husky: `.husky/pre-commit` (lint-staged), `.husky/commit-msg` (commitlint)
- Scripts: `npm run typecheck`, `npm test`, `npm run lint`

## 5. Credentials crypto
- `tests/security/credentials-crypto.test.ts`
- App-layer AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`) — pgcrypto SQL değil
