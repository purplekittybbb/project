import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";
import { SITE_NAME } from "@/lib/seo";

export default function HakkimizdaPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
            Keşfet
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Hakkımızda
          </h1>
          <div className="mt-8 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              {SITE_NAME}, Türkiye pazaryeri satıcıları için net kâr odaklı analiz araçları sunar.
              Trendyol, Hepsiburada, N11 ve Shopify siparişlerinizden gerçek maliyet düşülmüş kârı
              hesaplar; sessiz zararları erken yakalamanızı hedefler.
            </p>
            <p>
              Ücretsiz araçlarla mağaza bağlamadan keşfedebilir; mağazanızı bağladığınızda SKU
              bazlı net kâr, zarar alarmı, güvenli fiyat ve barkod analizi devreye girer.
            </p>
          </div>
        </Reveal>
      </section>
    </MarketingPage>
  );
}
