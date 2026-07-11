import { Reveal } from '@/components/reveal'

const stats = [
  {
    value: '−18 pts',
    label: 'Avg hidden loss found',
    context: 'per SKU, once every cost is allocated',
  },
  {
    value: '2,400+',
    label: 'Sellers analyzed',
    context: '↑ 12% vs last quarter',
  },
  {
    value: '4',
    label: 'Marketplaces supported',
    context: 'Trendyol, Hepsiburada, N11, + Shopify',
  },
]

export function TrustStrip() {
  return (
    <section
      aria-label="Key metrics"
      className="border-y border-border bg-background"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-20 sm:grid-cols-3 lg:px-8">
        {stats.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 80}>
            <div>
              <p className="tnum font-heading text-4xl font-bold tracking-tight text-foreground">
                {stat.value}
              </p>
              <p className="mt-3 text-sm font-medium text-foreground">
                {stat.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {stat.context}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
