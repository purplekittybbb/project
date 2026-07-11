import Link from 'next/link'
import { Reveal } from '@/components/reveal'
import { FeeWaterfall, type WaterfallStep } from '@/components/fee-waterfall'
import { getSeller } from '@/lib/engine'

/** Build the live perceived→true waterfall steps for a seller (server-side). */
function heroSteps() {
  const view = getSeller('seller-b')!
  const w = view.waterfall
  const revenue = w.grossRevenue
  const asPct = (v: number) => (revenue ? (v / revenue) * 100 : 0)
  const perceived = view.perceivedMarginPct
  const trueM = view.trueMarginPct
  const losses = [
    { label: ['VAT'], amt: w.vat },
    { label: ['Shipping'], amt: w.shipping },
    { label: ['Returns'], amt: w.returnsAllocated },
    { label: ['Ad', 'spend'], amt: w.adSpendAllocated },
    { label: ['Payment'], amt: w.paymentFees },
  ]
  const steps: WaterfallStep[] = [
    { label: ['Perceived'], low: 0, high: perceived, kind: 'start', tag: `${perceived.toFixed(0)}%` },
  ]
  let cum = perceived
  for (const l of losses) {
    const p = asPct(l.amt)
    steps.push({ label: l.label, low: cum - p, high: cum, kind: 'loss', tag: `−${p.toFixed(1)}` })
    cum -= p
  }
  steps.push({
    label: ['True', 'margin'],
    low: Math.min(0, trueM),
    high: Math.max(0, trueM),
    kind: 'result',
    tag: `${trueM.toFixed(1)}%`,
  })
  return { steps, perceived, trueM, hiddenPts: perceived - trueM, label: view.label, category: view.category }
}

export function Hero() {
  const h = heroSteps()

  return (
    <section id="product" className="bg-[#0B1F17]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-16 px-6 py-32 lg:grid-cols-[55fr_45fr] lg:items-center lg:gap-20 lg:px-8 lg:py-40">
        <div>
          <Reveal>
            <h1 className="font-heading text-5xl font-bold leading-[1.05] tracking-tight text-balance text-white sm:text-6xl lg:text-7xl">
              See your real margin. Get financed on it.
            </h1>
          </Reveal>

          <Reveal delay={80}>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/70">
              US-built for marketplace sellers — launching first in Turkey with Trendyol,
              Hepsiburada &amp; N11. True per-SKU margin, then capital priced on real
              contribution profit, not guesswork.
            </p>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/demo"
                className="inline-flex h-12 items-center justify-center bg-white px-7 text-sm font-medium text-[#0B1F17] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                See demo
              </Link>
              <Link
                href="#request-access"
                className="inline-flex h-12 items-center justify-center border border-white/25 px-7 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Request access
              </Link>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <FeeWaterfall
            steps={h.steps}
            caption={`${h.label} · ${h.category} · margin per revenue · live`}
            perceivedPct={h.perceived}
            truePct={h.trueM}
            hiddenPts={h.hiddenPts}
          />
        </Reveal>
      </div>
    </section>
  )
}
