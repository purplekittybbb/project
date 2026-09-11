import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { FeatureMatrix } from "@/components/marketing/feature-matrix";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Reveal } from "@/components/reveal";

export default function PricingPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-6xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
              Fiyatlandırma
            </p>
            <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              İhtiyacınıza göre paket seçin
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Ücretsiz planda Kategori 1 araçları; Başlangıç ve Profesyonel ile mağaza bağlantısı ve
              tüm Kategori 2 araçları. Fiyatlar aylık, KDV hariç.
            </p>
          </div>
        </Reveal>

        <div className="mt-16">
          <PricingCards />
        </div>

        <Reveal delay={120}>
          <div className="mt-24">
            <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              Özellik matrisi
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Her aracın hangi pakette olduğu — ✓ dahil, ✗ yok, Limitli günlük kota.
            </p>
            <div className="mt-8">
              <FeatureMatrix />
            </div>
          </div>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-12 text-center text-sm text-muted-foreground">
            Sorularınız mı var?{" "}
            <Link
              href="/sss"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              SSS
            </Link>{" "}
            veya{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              ücretsiz kaydolun
            </Link>
            .
          </p>
        </Reveal>
      </section>
    </MarketingPage>
  );
}
