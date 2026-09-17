import { HeroSignupForm } from "@/components/marketing/hero-signup-form";
import { MARKETING_MARKETPLACE_LIST_TR } from "@/lib/seo";

/**
 * Landing hero — ABOVE THE FOLD, so it must paint fully on first render.
 * It deliberately does NOT use <Reveal> (opacity:0-until-JS): the first
 * impression should never be a blank/low-contrast green void waiting for an
 * IntersectionObserver to fire. Below-the-fold sections still animate in.
 */
export function Hero() {
  return (
    <section
      id="kesfet"
      className="border-b border-[color-mix(in_srgb,var(--tm-navy)_25%,var(--tm-mist))] bg-[var(--tm-navy)]"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:px-8 lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--tm-paper)_28%,transparent)] px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-[color-mix(in_srgb,var(--tm-paper)_85%,transparent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--tm-paper)]" />
            Gerçek net kâr — tahmin değil
          </span>

          <h1 className="mt-5 font-heading text-4xl font-bold leading-[1.06] tracking-tight text-balance text-[var(--tm-paper)] sm:text-5xl lg:text-6xl">
            En çok satan ve en kârlı ürünlerinizi bulun
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[color-mix(in_srgb,var(--tm-paper)_78%,transparent)]">
            {MARKETING_MARKETPLACE_LIST_TR} siparişlerinizden komisyon, KDV, kargo, iade ve reklam
            düşülmüş <strong className="font-semibold text-[var(--tm-paper)]">gerçek net kârı</strong> saniyeler
            içinde görün. Hangi ürün kazandırıyor, hangisi zarar ettiriyor — net.
          </p>

          {/* Trust row — concrete, scannable proof points */}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[color-mix(in_srgb,var(--tm-paper)_82%,transparent)]">
            {[
              "30 gün ücretsiz deneme",
              "Kredi kartı gerekmez",
              "Trendyol · Hepsiburada · N11",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
                  <path d="M13.5 4.5 6.5 11.5 3 8" stroke="var(--tm-paper)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:pl-4">
          <HeroSignupForm />
        </div>
      </div>
    </section>
  );
}
