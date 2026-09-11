import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { PRICING_TIERS } from "@/lib/marketing/content";

export function PricingPreview() {
  return (
    <section className="border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
                Fiyatlandırma
              </p>
              <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                İhtiyacınıza göre paket
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Ücretsiz başlayın; mağaza araçları için Başlangıç veya Profesyonel seçin.
              </p>
            </div>
            <Link
              href="/pricing"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Tüm planları gör →
            </Link>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PRICING_TIERS.map((tier, i) => (
            <Reveal key={tier.id} delay={i * 60}>
              <article
                className={`flex h-full flex-col rounded-[var(--tm-r-ui)] border bg-card p-6 ${
                  tier.highlight
                    ? "border-[color-mix(in_srgb,var(--tm-copper)_45%,var(--tm-mist))]"
                    : "border-[var(--tm-mist)]"
                }`}
              >
                <h3 className="font-heading text-lg font-bold text-foreground">{tier.name}</h3>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="tnum font-heading text-2xl font-bold text-foreground">
                    {tier.priceMonthly === 0 ? "0" : `₺${tier.priceMonthly.toLocaleString("tr-TR")}`}
                  </span>
                  <span className="text-xs text-muted-foreground">/ ay</span>
                </p>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{tier.summary}</p>
                <Link
                  href={tier.id === "free" ? "/signup" : "/pricing"}
                  className={`mt-5 inline-flex h-9 items-center justify-center text-sm font-medium ${
                    tier.highlight
                      ? "bg-[var(--tm-copper)] text-[var(--tm-paper)]"
                      : "border border-[var(--tm-mist)] text-foreground hover:bg-secondary/80"
                  }`}
                >
                  {tier.id === "free" ? "Ücretsiz başla" : "Detaylar"}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
