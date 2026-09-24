# TrueMargin — senin yapman gerekenler (ops checklist)

Bu liste kodda değil; canlı ortamda sen uygularsın.
Production origin (tercih): `https://truemargin.app` · Vercel fallback: `https://matsorular.vercel.app`
Bitince bu dosyayı sil veya “done” diye işaretle; chat’te “bitti” yaz.

## 1) Supabase migration’lar
Dashboard → SQL Editor → sırayla Run:

1. `supabase/migrations/0038_rls_hardening_free_tier.sql`
2. `supabase/migrations/0039_force_rls_tenant_tables.sql` (varsa / daha önce uygulanmadıysa)
3. `supabase/migrations/0040_billing_subscriptions_service_role_only.sql`
4. `supabase/migrations/0041_atomic_guest_tool_usage.sql`

Doğrulama:
```sql
select proname from pg_proc where proname = 'increment_guest_tool_usage';
select policyname, cmd from pg_policies where tablename = 'billing_subscriptions';
```

## 2) E-posta doğrulama (Auth)
Supabase → Authentication → Providers / Email:
- **Confirm email = ON**
- Site URL = `https://truemargin.app` (veya aktif domain)
- Redirect URLs’e ekle:
  - `https://truemargin.app/api/auth/callback`
  - `https://matsorular.vercel.app/api/auth/callback` (hâlâ kullanıyorsan)
  - `http://localhost:3000/api/auth/callback` (local)

Uygulama tarafı hazır: `/dogrula-email`, proxy engeli, signup `emailRedirectTo`.

## 3) Stripe webhook
Stripe Dashboard → Developers → Webhooks → endpoint:
- URL: `https://truemargin.app/api/billing/stripe/webhook`
  (Vercel-only ise: `https://matsorular.vercel.app/api/billing/stripe/webhook`)
- Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`
- Secret → Vercel/env: `STRIPE_WEBHOOK_SECRET`

## 4) Redis + worker (1000 eşzamanlı savunma)
- Env (Vercel + worker host): `REDIS_URL` veya `UPSTASH_REDIS_URL`
- Çalıştır: `npm run scrape-worker` (scrape + marketplace sync kuyruğu)
- İsteğe bağlı: `SCRAPE_WORKER_CONCURRENCY`, `SYNC_WORKER_CONCURRENCY`

Redis yoksa resync yine inline çalışır (küçük trafik OK).

## 5) Site URL
- Vercel env: `NEXT_PUBLIC_SITE_URL=https://truemargin.app` (e-posta linkleri / callback)
- Yerel `.env.local` içinde de aynı (veya localhost) tut

## Opsiyonel / sonra
- iyzico yenileme (renewal) webhook — ilk ödeme callback yeterli; recurring için ayrı entegrasyon
- Canlı Trendyol/HB/N11 E2E test hesabı

---
Oluşturulma: 2026-09-23 · Chat’te “hatırlat” / “bitti” de.
