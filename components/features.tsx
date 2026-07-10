import { Layers, LineChart, Store } from 'lucide-react'
import { Reveal } from '@/components/reveal'

const features = [
  {
    icon: Layers,
    title: 'True margin',
    body: 'Every cost allocated to the SKU: commission, VAT, shipping, returns, ad spend. See real contribution profit, not revenue.',
  },
  {
    icon: LineChart,
    title: 'Underwriting',
    body: 'Financing priced on real margin, not a revenue snapshot.',
  },
  {
    icon: Store,
    title: 'Any marketplace',
    body: 'Trendyol, Amazon, Hepsiburada, or your own store — one unified view.',
  },
]

export function Features() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl px-6 py-32 lg:px-8 lg:py-40"
    >
      <div className="grid grid-cols-1 gap-16 md:grid-cols-3 md:gap-12 lg:gap-20">
        {features.map((feature, i) => (
          <Reveal key={feature.title} delay={i * 80}>
            <div>
              <feature.icon
                aria-hidden="true"
                className="h-6 w-6 text-brand"
                strokeWidth={1.5}
              />
              <h2 className="mt-6 font-heading text-xl font-bold tracking-tight text-foreground">
                {feature.title}
              </h2>
              <p className="mt-3 max-w-xs text-base leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
