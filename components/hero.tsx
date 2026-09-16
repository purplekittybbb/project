import { HeroSignupForm } from "@/components/marketing/hero-signup-form";
import { Reveal } from "@/components/reveal";
import { MARKETING_MARKETPLACE_LIST_TR } from "@/lib/seo";

export function Hero() {
  return (
    <section
      id="kesfet"
      className="border-b border-[color-mix(in_srgb,var(--tm-ledger-green)_25%,var(--tm-mist))] bg-[var(--tm-ledger-green)]"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:px-8 lg:py-32">
        <div>
          <Reveal>
            <h1 className="font-heading text-4xl font-bold leading-[1.08] tracking-tight text-balance text-[var(--tm-paper)] sm:text-5xl lg:text-6xl">
              En çok satan ve en kârlı ürünlerinizi bulun
            </h1>
          </Reveal>

          <Reveal delay={80}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[color-mix(in_srgb,var(--tm-paper)_72%,transparent)]">
              {MARKETING_MARKETPLACE_LIST_TR} siparişlerinizden gerçek net kârı hesaplayın.
              Komisyon, KDV, kargo, iade ve reklam düşülmüş — tahmin değil, sizin veriniz.
            </p>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <HeroSignupForm />
        </Reveal>
      </div>
    </section>
  );
}
