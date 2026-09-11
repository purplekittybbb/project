import { Reveal } from "@/components/reveal";

import { ExtensionToolCard, ToolCard } from "@/components/marketing/tool-card";

import { EXTENSION_TOOLS, STANDALONE_TOOLS, STORE_REQUIRED_TOOLS } from "@/lib/marketing/content";



interface ToolsGridProps {

  id?: string;

  showHeading?: boolean;

}



export function ToolsGrid({ id = "kesfet", showHeading = true }: ToolsGridProps) {

  return (

    <section id={id} className="mx-auto max-w-6xl px-6 py-24 lg:px-8 lg:py-32">

      {showHeading && (

        <Reveal>

          <div className="max-w-2xl">

            <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">

              Araçlar

            </p>

            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">

              Bağımsız araçlar ve mağaza entegrasyonu

            </h2>

            <p className="mt-4 text-base leading-relaxed text-muted-foreground">

              Mağaza bağlamadan keşfedin; net kâr ve alarm araçları için pazaryeri hesabınızı bağlayın.

            </p>

          </div>

        </Reveal>

      )}



      <div className="mt-16 space-y-16">

        <Reveal delay={80}>

          <div>

            <div className="flex flex-wrap items-end justify-between gap-4">

              <div>

                <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">

                  Ücretsiz Araçlar

                </h3>

                <p className="mt-2 text-sm text-muted-foreground">

                  Mağaza bağlamadan çalışır. Günde sınırlı ücretsiz sorgu.

                </p>

              </div>

            </div>

            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

              {STANDALONE_TOOLS.map((tool) => (

                <li key={tool.id}>

                  <ToolCard tool={tool} />

                </li>

              ))}

            </ul>

          </div>

        </Reveal>



        <Reveal delay={120}>

          <div>

            <div className="flex flex-wrap items-end justify-between gap-4">

              <div>

                <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">

                  Mağaza Gerekli

                </h3>

                <p className="mt-2 text-sm text-muted-foreground">

                  Gerçek satış ve maliyet verinizle net kâr, alarm ve liste kalitesi.

                </p>

              </div>

            </div>

            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">

              {STORE_REQUIRED_TOOLS.map((tool) => (

                <li key={tool.id}>

                  <ToolCard tool={tool} />

                </li>

              ))}

            </ul>

          </div>

        </Reveal>



        <Reveal delay={160}>

          <div id="uzanti" className="border-t border-border pt-16">

            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">

              Chrome Uzantısı

            </h3>

            <p className="mt-2 text-sm text-muted-foreground">

              v1 — partner panelinde kendi mağaza kârını göster.

            </p>

            <ul className="mt-6 grid grid-cols-1 gap-3 lg:max-w-md">

              {EXTENSION_TOOLS.map((tool) => (

                <li key={tool.id}>

                  <ExtensionToolCard title={tool.title} description={tool.description} href={tool.href} />

                </li>

              ))}

            </ul>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">

              Rakip analizi ve bulut senkronu v1 kapsamında yok; hesap tarayıcı içinde çalışır.

            </p>

          </div>

        </Reveal>

      </div>

    </section>

  );

}


