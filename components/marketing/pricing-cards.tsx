import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { LockIcon } from "@/components/trust/LockIcon";
import { PRICING_TIERS } from "@/lib/marketing/content";

export function PricingCards() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-6">
      {PRICING_TIERS.map((plan, i) => (
        <Reveal key={plan.id} delay={i * 80}>
          <article
            className={`flex h-full flex-col rounded-[var(--tm-r-ui)] border bg-card p-8 shadow-[0_1px_2px_rgba(18,24,27,0.04)] ${
              plan.highlight
                ? "border-[color-mix(in_srgb,var(--tm-copper)_45%,var(--tm-mist))]"
                : "border-[var(--tm-mist)]"
            }`}
          >
            <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">
              {plan.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{plan.summary}</p>
            <p className="mt-4 flex items-baseline gap-1">
              <span className="tnum font-mono text-4xl font-bold text-foreground">
                {plan.priceMonthly === 0
                  ? "₺0"
                  : `₺${plan.priceMonthly.toLocaleString("tr-TR")}`}
              </span>
              <span className="text-sm text-muted-foreground">/ ay</span>
            </p>
            <ul className="mt-8 flex-1 space-y-3 border-t border-[var(--tm-mist)] pt-8">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm text-foreground">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tm-ledger-green)]"
                    aria-hidden
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={plan.id === "free" ? "/signup" : "/signup"}
              className={`mt-8 inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-copper)] ${
                plan.highlight
                  ? "bg-[var(--tm-copper)] text-[var(--tm-paper)]"
                  : "border border-[var(--tm-mist)] bg-background text-foreground hover:bg-secondary"
              }`}
            >
              {plan.highlight && <LockIcon className="opacity-90" />}
              {plan.id === "free" ? "Ücretsiz başla" : "Kaydol"}
            </Link>
            {plan.highlight && (
              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                <LockIcon />
                <span>Güvenli ödeme · istediğiniz an iptal</span>
              </p>
            )}
          </article>
        </Reveal>
      ))}
    </div>
  );
}
