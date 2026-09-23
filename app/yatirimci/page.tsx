import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";
import { getBenchmarkRows, getPortfolioMetrics } from "@/lib/engine";
import { MARKETING_MARKETPLACE_LIST_TR, SITE_NAME } from "@/lib/seo";

export const metadata = {
  title: `Yatırımcı diligence · ${SITE_NAME}`,
  description:
    "Marketplace verisinden krediye giden yazılım wedge’i: gerçek marj, underwriting backtest, audit trail. Lisanssız kredi satışı yok.",
};

/**
 * Marketplace→Credit / yatırımcı PDF — Pre-seed day-1 diligence yüzeyi.
 * Sahte ARR/GMV yok; seed design-partner backtest açıkça etiketlenir.
 */
export default function YatirimciPage() {
  const m = getPortfolioMetrics();
  const benches = getBenchmarkRows();
  const pct = (n: number) =>
    `${n.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;

  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-16 lg:px-8 lg:py-24">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
            Due diligence
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Marketplace → Credit: yazılım wedge’i
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Yatırımcı tezimiz kategori standardına uyuyor: önce bağımsız analitik (gerçek
            SKU marjı + settlement görünürlüğü), sonra underwriting sinyali, en son bilanço
            / warehouse facility. {SITE_NAME} bugün lisanslı kredi satmıyor; satıcıya
            gösterdiğimiz ürün net kâr yazılımıdır.
          </p>
        </Reveal>

        <Reveal>
          <div className="mt-10 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-5">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Lisans ve konumlandırma (red-flag önlemi)
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>
                Gerçek kullanıcının panelinde “kredi hattı onayla” ürünü yok — underwriting
                demo yalnızca seed / yatırımcı yüzeylerinde.
              </li>
              <li>
                Canlı ürün: {MARKETING_MARKETPLACE_LIST_TR} siparişlerinden komisyon, KDV,
                kargo, iade ve reklam düşülmüş gerçek marj.
              </li>
              <li>
                Kredi dağıtımı için lisanslı lender ortaklığı (LOI) Pre-seed sonrası hedef;
                bugün “underwriting sinyalini sat” aşamasındayız, bilanço değil.
              </li>
            </ul>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mt-12 font-heading text-xl font-semibold text-foreground">
            Çalışan artefaktlar (tıkla ve doğrula)
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link
              href="/demo"
              className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/40 px-4 py-4 text-sm font-medium text-foreground hover:border-[var(--tm-copper)]"
            >
              /demo
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Seed panel · Financing backtest sekmesi
              </span>
            </Link>
            <Link
              href="/reveal/seller-b"
              className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/40 px-4 py-4 text-sm font-medium text-foreground hover:border-[var(--tm-copper)]"
            >
              /reveal/seller-b
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Görünen → gerçek marj şelalesi
              </span>
            </Link>
            <Link
              href="/financing/seller-b"
              className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-secondary/40 px-4 py-4 text-sm font-medium text-foreground hover:border-[var(--tm-copper)]"
            >
              /financing/seller-b
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Limit + take-rate + karar izi
              </span>
            </Link>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mt-12 font-heading text-xl font-semibold text-foreground">
            Seed design-partner kanıtı
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Aşağıdaki rakamlar canlı üretim GMV’si değil; motorun N={m.designPartners} seed
            satıcısı üzerinde koşturduğu self-backtest çıktısıdır. Diligence için
            “çalışıyor mu?” sorusuna cevap verir — ölçek iddiası değildir.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Design partner" value={String(m.designPartners)} />
            <Metric label="Marketplace connector" value={String(m.marketplacesConnected)} />
            <Metric label="GMV kapsama (seed)" value={pct(m.gmvCoveragePct)} />
            <Metric
              label="Zarar azalması vs incumbent"
              value={pct(m.lossReductionPct)}
              tone={m.lossReductionPct > 0 ? "profit" : "neutral"}
            />
          </dl>
          <div className="mt-6 overflow-x-auto rounded-[var(--tm-r-data)] border border-[var(--tm-mist)]">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Metrik</th>
                  <th className="px-3 py-2 text-right font-medium">Biz (seed)</th>
                  <th className="px-3 py-2 text-right font-medium">Hedef</th>
                  <th className="px-3 py-2 text-right font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {benches.map((b) => (
                  <tr key={b.label} className="border-t border-[var(--tm-mist)]">
                    <td className="px-3 py-2 text-foreground">{b.label}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                      {b.ours}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {b.target}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono text-[11px] ${
                        b.meetsTarget ? "fin-profit" : "text-amber-700"
                      }`}
                    >
                      {b.meetsTarget ? "hedefte" : "izleniyor"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mt-12 font-heading text-xl font-semibold text-foreground">
            Teknik güvenilirlik checklist
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>✓ Çok-pazaryeri adapter mimarisi (Trendyol, HB, N11, Shopify, Amazon…)</li>
            <li>✓ Kanonik sipariş modeli + per-SKU gerçek marj motoru</li>
            <li>✓ Multi-tenant RLS (migration 0038/0039 hazır; apply prod’da)</li>
            <li>✓ Immutable decision ledger (audit trail) + kural tabanlı underwriting rationale</li>
            <li>✓ XAI Confidence UI (Ne / Neden / Nasıl) — EU AI Act yönünde şeffaflık</li>
            <li>✓ KVKK sayfaları + kurumsal iletişim iskeleti (MERSİS gerçek veri bekliyor)</li>
            <li>○ SOC 2 Type I — yol haritası (Vanta/Drata); henüz sertifika iddiası yok</li>
            <li>○ Lisanslı lender LOI — Seed hedefi</li>
          </ul>
        </Reveal>

        <Reveal>
          <p className="mt-10 text-sm text-muted-foreground">
            Data room klasör indeksi:{" "}
            <code className="text-[12px] text-foreground">docs/data-room/README.md</code>
            {" · "}
            <Link href="/hakkimizda" className="text-[var(--tm-copper)] hover:underline">
              Hakkımızda
            </Link>
            {" · "}
            <Link href="/gizlilik" className="text-[var(--tm-copper)] hover:underline">
              Gizlilik / KVKK
            </Link>
          </p>
        </Reveal>
      </section>
    </MarketingPage>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "profit" | "neutral";
}) {
  return (
    <div className="rounded-[var(--tm-r-data)] border border-[var(--tm-mist)] bg-card px-3 py-3">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 font-mono text-xl tabular-nums font-semibold ${
          tone === "profit" ? "fin-profit" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
