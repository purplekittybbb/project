import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { ToolCard, ExtensionToolCard } from "@/components/marketing/tool-card";
import { EXTENSION_TOOLS, STANDALONE_TOOLS, STORE_REQUIRED_TOOLS } from "@/lib/marketing/content";

export function HomepageToolsSection() {
  return (
    <section id="urunler" className="mx-auto max-w-6xl px-6 py-24 lg:px-8 lg:py-32">
      <Reveal>
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
            Web uygulaması
          </p>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Ücretsiz araçlar ve mağaza entegrasyonu
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Mağaza bağlamadan keşfedin; net kâr ve alarm araçları için pazaryeri hesabınızı bağlayın.
          </p>
        </div>
      </Reveal>

      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_280px] lg:gap-10">
        <div className="space-y-14">
          <Reveal delay={60}>
            <div>
              <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                Ücretsiz Araçlar
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Mağaza bağlamadan çalışır. Günde sınırlı ücretsiz sorgu.
              </p>
              <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {STANDALONE_TOOLS.map((tool) => (
                  <li key={tool.id}>
                    <ToolCard tool={tool} />
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div>
              <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                Mağaza Gerekli
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Gerçek satış ve maliyet verinizle net kâr, alarm ve liste kalitesi.
              </p>
              <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {STORE_REQUIRED_TOOLS.map((tool) => (
                  <li key={tool.id}>
                    <ToolCard tool={tool} />
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <aside
            id="uzanti"
            className="h-fit rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-6 shadow-[0_1px_2px_rgba(18,24,27,0.04)] lg:sticky lg:top-24"
          >
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
              Chrome uzantısı
            </p>
            <h3 className="mt-3 font-heading text-lg font-semibold tracking-tight text-foreground">
              Partner panelinde kâr
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              v1 — Trendyol / Hepsiburada partner panelinde kendi ürününüz için anlık net kâr.
            </p>
            <ul className="mt-5 space-y-3">
              {EXTENSION_TOOLS.map((tool) => (
                <li key={tool.id}>
                  <ExtensionToolCard title={tool.title} description={tool.description} href={tool.href} />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Rakip analizi ve bulut senkronu v1 kapsamında yok.
            </p>
            <Link
              href="/signup"
              className="mt-5 inline-flex w-full items-center justify-center border border-[var(--tm-mist)] py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80"
            >
              Uzantıyı edin
            </Link>
          </aside>
        </Reveal>
      </div>
    </section>
  );
}
