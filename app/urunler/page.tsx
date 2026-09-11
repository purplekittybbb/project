import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ToolsGrid } from "@/components/marketing/tools-grid";
import { Reveal } from "@/components/reveal";

export default function UrunlerPage() {
  return (
    <MarketingPage>
      <section className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
          <Reveal>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Ürünler
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Pazaryeri satıcıları için net kâr odaklı araç seti — web paneli ve Chrome uzantısı
              olarak iki yüzeyde.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex h-11 items-center justify-center bg-[var(--tm-copper)] px-6 text-sm font-medium text-[var(--tm-paper)] transition-opacity hover:opacity-90"
            >
              Hemen başla
            </Link>
          </Reveal>
        </div>
      </section>
      <ToolsGrid id="araclar" showHeading={false} />
    </MarketingPage>
  );
}
