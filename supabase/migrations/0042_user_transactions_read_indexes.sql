-- ─────────────────────────────────────────────────────────────────────────────
-- user_transactions — okuma yolu performans index'leri  (P1-4, Lansman Denetimi)
--
-- Panel yüklemesi (lib/supabase/user-data.ts → loadUserRowsWithStatus) bir
-- kullanıcının satırlarını `order by sale_date` ile çekiyor. Bugün yalnızca
-- (user_id) index'li (0001) — yani Postgres önce user_id'ye göre filtreleyip
-- her panel açılışında TÜM satırları bellekte SIRALIYOR. Lansmanda sorun değil;
-- ama 100 bin+ satırlı ağır bir satıcıda bu sıralama baskın gelir ve panel
-- yavaşlar. Aşağıdaki bileşik index'ler satırları zaten sıralı döndürür ve
-- tarih-aralığı filtrelerine (ör. "son 30 gün") de hizmet eder.
--
-- TAMAMEN EK / güvenli: uygulama bunlarsız da doğru çalışır — bu yalnızca bir
-- performans iyileştirmesidir. Supabase SQL editöründen ya da `supabase db push`
-- ile uygula. Migration transaction'ı içinde çalışsın diye düz (CONCURRENTLY
-- olmayan) CREATE INDEX kullanıldı; mevcut veri boyutunda tabloyu yalnızca çok
-- kısa süre kilitler. Çok büyük canlı bir tabloda dilersen CONCURRENTLY sürümünü
-- transaction dışında elle çalıştırabilirsin.
-- ─────────────────────────────────────────────────────────────────────────────

-- Panelin "kullanıcının satırları, sale_date'e göre sıralı" ana yükleme deseni.
create index if not exists user_transactions_user_sale_date_idx
  on public.user_transactions (user_id, sale_date desc);

-- SKU bazlı gruplama (SKU birim ekonomisi, talep sinyalleri) user_id + sku filtreler.
create index if not exists user_transactions_user_sku_idx
  on public.user_transactions (user_id, sku);
