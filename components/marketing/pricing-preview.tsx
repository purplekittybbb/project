import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { PRICING_TIERS } from "@/lib/marketing/content";

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
      <path d="M13.5 4.5 6.5 11.5 3 8" stroke="var(--tm-ledger-green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
                Ücretsiz başlayın; mağaza araçları için Başlangıç veya Profesyonel seçin. KDV hariç, istediğiniz an iptal.
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

        <div className="mt-12 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-3">
          {PRICING_TIERS.map((tier, i) => {
            const features = "features" in tier ? (tier.features as readonly string[]) : [];
            return (
              <Reveal key={tier.id} delay={i * 60}>
                <article
                  className={`relative flex h-full flex-col rounded-[var(--tm-r-ui)] border bg-card p-6 transition-all duration-200 hover:-translate-y-1 ${
                    tier.highlight
                      ? "border-[var(--tm-copper)]/60 shadow-[0_12px_36px_rgba(160,90,40,0.14)] ring-1 ring-[var(--tm-copper)]/30"
                      : "border-[var(--tm-mist)] shadow-[0_1px_2px_rgba(18,24,27,0.04)] hover:shadow-[0_8px_24px_rgba(18,24,27,0.08)]"
                  }`}
                >
                  {tier.highlight && (
                    <span className="absolute -top-3 right-5 inline-flex items-center rounded-full bg-[var(--tm-copper)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tm-paper)]">
                      Popüler
                    </span>
                  )}
                  <h3 className="font-heading text-lg font-bold text-foreground">{tier.name}</h3>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="tnum font-heading text-3xl font-bold text-foreground">
                      {tier.priceMonthly === 0 ? "₺0" : `₺${tier.priceMonthly.toLocaleString("tr-TR")}`}
                    </span>
                    <span className="text-xs text-muted-foreground">/ ay</span>
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">{tier.summary}</p>

                  {features.length > 0 && (
                    <ul className="mt-5 flex-1 space-y-2.5">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-foreground/85">
                          <Check />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link
                    href={tier.id === "free" ? "/signup" : "/pricing"}
                    className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-[var(--tm-r-data,6px)] text-sm font-semibold transition-opacity ${
                      tier.highlight
                        ? "bg-[var(--tm-copper)] text-[var(--tm-paper)] hover:opacity-90"
                        : "border border-[var(--tm-mist)] text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {tier.id === "free" ? "Ücretsiz başla" : "Detayları gör"}
                  </Link>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
