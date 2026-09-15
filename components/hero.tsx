import Link from "next/link";
import { HeroSignupForm } from "@/components/marketing/hero-signup-form";
import { Reveal } from "@/components/reveal";

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
              Trendyol, Hepsiburada ve N11 siparişlerinizden gerçek net kârı hesaplayın.
              Komisyon, KDV, kargo, iade ve reklam düşülmüş — tahmin değil, sizin veriniz.
            </p>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center bg-[var(--tm-copper)] px-7 text-sm font-medium text-[var(--tm-paper)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-paper)]"
              >
                Kaydol
              </Link>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <HeroSignupForm />
        </Reveal>
      </div>
    </section>
  );
}
