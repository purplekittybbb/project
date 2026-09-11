import { MarketingPage } from "@/components/marketing/marketing-page";
import { FAQ_ITEMS } from "@/lib/marketing/content";
import { Reveal } from "@/components/reveal";

export default function SssPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
            Keşfet
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Sık sorulan sorular
          </h1>
        </Reveal>

        <dl className="mt-12 space-y-8">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal key={item.q} delay={i * 40}>
              <div className="border-b border-[var(--tm-mist)] pb-8">
                <dt className="font-heading text-lg font-semibold text-foreground">{item.q}</dt>
                <dd className="mt-3 text-base leading-relaxed text-muted-foreground">{item.a}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </section>
    </MarketingPage>
  );
}
