import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";

// Sayfada henüz gerçek içerik yok ("yakında" notu) — arama motorlarına
// içeriksiz bir sayfa sunmamak için index dışı bırakıldı. Gerçek yazılar
// eklendiğinde bu metadata kaldırılıp normal index'e açılabilir.
export const metadata = {
  robots: { index: false, follow: true },
};

export default function BlogPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
            Keşfet
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Blog / Rehberler
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            SEO rehberleri ve pazaryeri içerikleri yakında burada. Örneğin: &ldquo;Trendyol komisyon
            oranları 2026&rdquo; gibi satıcı odaklı makaleler planlanıyor.
          </p>
          <Link
            href="/araclar/kar-hesapla"
            className="mt-8 inline-flex h-11 items-center justify-center border border-[var(--tm-mist)] px-6 text-sm font-medium text-foreground hover:bg-secondary/80"
          >
            Şimdilik ücretsiz kâr hesaplayıcıyı deneyin
          </Link>
        </Reveal>
      </section>
    </MarketingPage>
  );
}
