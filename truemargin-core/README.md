# TrueMargin — Domain Core

Test edilmiş, tipli underwriting motoru: marketplace satıcıları için gerçek per-SKU
marj → kurallı/açıklanabilir underwriting → biz-vs-incumbent backtest. Bu, yatırımcı
due-diligence'ının açıp baktığı "ciddiyet" katmanı ve dokümanın "seed turunun tek en
güçlü artefaktı" dediği çalışan backtest'i içerir.

## Ne var

- `src/domain/canonical.ts` — tüm pazaryerlerinin map'lendiği tek kanonik veri modeli
  (multi-tenant, multi-currency, decision-trace tipi dahil).
- `src/adapters/` — `MarketplaceAdapter` arayüzü + `TrendyolAdapter` + `AmazonUsAdapter`.
  Yeni ülke = yeni adapter, çekirdek dokunulmaz.
- `src/domain/margin-engine.ts` — fee waterfall; sanılan vs gerçek marj; "sessiz zarar"
  SKU tespiti (reveal'ın matematiği).
- `src/domain/underwriting.ts` — kurallı, AÇIKLANABİLİR model (kara kutu değil; her karar
  gerekçe üretir) + margin-blind incumbent karşılaştırma modeli.
- `src/domain/backtest.ts` — asıl artefakt: her satıcının geçmişini iki modelden geçirip
  simüle delinquency/charge-off/zarar karşılaştırması üretir.
- `src/domain/ledger.ts` — append-only immutable ledger (decision traces, audit trail).
- `src/data/seed.ts` — 3 TEMSİLİ satıcı + underwriting girdilerini türeten yardımcı.
- `tests/` — 9 Vitest testi (marj, underwriting, backtest).
- `demo.ts` — çekirdeğin çıktısını gösteren çalışan kanıt scripti.

## Çalıştır

```bash
npm install
npm test          # 9 test geçer
npx tsx demo.ts   # reveal + underwriting + backtest çıktısı
```

## DÜRÜSTLÜK NOTLARI (yatırımcıya bu netlikte söyle)

1. **Seed verisi temsili.** `src/data/seed.ts` içindeki 3 satıcı gerçek marketplace
   ekonomisine göre modellenmiş yer tutuculardır. Gerçek design partner rakamların
   gelince yalnızca oradaki ham satırları (`RawTrendyolRow`) değiştir — yapı aynı kalır,
   reveal/underwriting/backtest otomatik yeniden hesaplanır.

2. **Fee oranları temsili — data room öncesi teyit et.** Komisyon tablosu ve KDV
   (`REPRESENTATIVE_TRENDYOL_FEES`) config-driven yer tutuculardır. Güncel Trendyol
   satıcı sözleşmesiyle doğrula. KDV, satıcı için pass-through kabul edilip yalnızca
   komisyon üzerindeki KDV maliyet olarak alınır (gerçekçi yaklaşım).

3. **Backtest N=3 ile istatistiksel loss-rate kanıtlamaz.** Kanıtladığı şey: gerçek
   settlement verisini alıp disiplinli, açıklanabilir bir underwriting kararına
   dönüştürebildiğimiz. N'i büyütmek seed turunun konusu.

4. **Underwriting kararı LLM ile verilmiyor** — kurallı ve tescilli. LLM yalnızca kararı
   açıklamak için (sonradan, sağlayıcı-bağımsız bir arayüz arkasında) eklenecek.

## Sonraki adım — arayüzü Claude Code'da bu çekirdeğin üstüne kur

Bu domain core'u Claude Code projesine koy, sonra `build-plan.md`'deki Prompt 2→6'yı
sırayla ver: tasarım sistemi (anti-slop teal palet), reveal ekranı (sanılan→gerçek marj
erozyonu), financing/backtest ekranı, decision-trace AI paneli, cila. UI bu motorun
üstüne oturur; motor zaten test edilmiş.
