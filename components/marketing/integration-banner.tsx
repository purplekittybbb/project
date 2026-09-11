import Link from "next/link";
import { INTEGRATION_BANNER } from "@/lib/marketing/content";
import { Reveal } from "@/components/reveal";

const MARKETPLACES = ["Trendyol", "Hepsiburada", "N11", "Shopify"];

export function IntegrationBanner() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <Reveal>
          <div className="flex flex-col gap-8 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
            <div className="max-w-xl">
              <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {INTEGRATION_BANNER.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {INTEGRATION_BANNER.body}
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {MARKETPLACES.map((name) => (
                  <li
                    key={name}
                    className="rounded-full border border-[var(--tm-mist)] bg-background px-3 py-1 text-xs font-medium text-foreground"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href={INTEGRATION_BANNER.href}
              className="inline-flex h-11 shrink-0 items-center justify-center bg-[var(--tm-copper)] px-7 text-sm font-medium text-[var(--tm-paper)] transition-opacity hover:opacity-90"
            >
              {INTEGRATION_BANNER.cta}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
