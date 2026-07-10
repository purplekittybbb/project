import Link from "next/link";
import { getSellers } from "@/lib/engine";
import { money, pct } from "@/lib/format";

/**
 * Overview — Ekran 1, the "comfortable lie".
 * A calm, familiar dashboard. It shows each seller's PERCEIVED margin large and
 * reassuring — no alarms. The reveal (Ekran 2) is one click away.
 *
 * This page is also the first proof that the UI is wired to the untouched engine:
 * every figure here is computed live by /src, not hard-coded.
 */
export default function OverviewPage() {
  const sellers = getSellers();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-widest text-accent">
          TrueMargin
        </div>
        <h1 className="text-3xl font-semibold text-ink">Portföy — Trendyol satıcıları</h1>
        <p className="mt-3 max-w-xl text-ink/60">
          Satıcının kendi hesabına göre marjlar. Sakin, tanıdık, alarm yok. Gerçek marjı
          görmek için bir satıcıyı aç.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {sellers.map((s) => (
          <li key={s.tenantId}>
            <Link
              href={`/reveal/${s.tenantId}`}
              className="block rounded-lg border border-ink/10 bg-white p-5 transition-colors hover:border-accent/40"
            >
              <div className="text-sm text-ink/50">{s.label}</div>
              <div className="mt-1 text-xs text-ink/40">{s.category}</div>
              <div className="mt-6 text-xs uppercase tracking-wide text-ink/40">
                Net marj (sanılan)
              </div>
              <div className="fig mt-1 text-3xl font-semibold text-ink">
                {pct(s.perceivedMarginPct)}
              </div>
              <div className="fig mt-4 text-sm text-ink/50">
                {money(s.monthlyRevenue, s.currency)} / ay
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-xs text-ink/40">
        N=3 tasarım ortağı — mekanizma kanıtı, istatistiksel loss-rate değil. Rakamlar
        temsili; motor gerçek settlement verisiyle otomatik yeniden hesaplar.
      </p>
    </main>
  );
}
