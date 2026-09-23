import Link from "next/link";
import type { Metadata } from "next";
import { ALL_TOOLS } from "@/lib/tools/registry";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Ücretsiz Araçlar",
  description:
    "Pazaryeri satıcıları için görünürlük, fiyat takibi, Top 100 ve net kâr hesaplama araçları.",
};

export default function AraclarIndexPage() {
  const free = ALL_TOOLS.filter((t) => t.category === "standalone");
  const store = ALL_TOOLS.filter((t) => t.category === "store");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Ücretsiz araçlar</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Giriş yapmadan deneyin. Mağaza gerektiren araçlar için hesabınız ve pazaryeri bağlantısı gerekir.
        </p>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Anında dene
          </h2>
          <ul className="mt-4 space-y-3">
            {free.map((tool) => (
              <li key={tool.slug}>
                <Link
                  href={tool.href}
                  className="block rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] px-4 py-4 transition-colors hover:bg-secondary/40"
                >
                  <span className="font-medium text-foreground">{tool.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{tool.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Mağaza gerekli
          </h2>
          <ul className="mt-4 space-y-3">
            {store.map((tool) => (
              <li key={tool.slug}>
                <Link
                  href={tool.href}
                  className="block rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] px-4 py-4 transition-colors hover:bg-secondary/40"
                >
                  <span className="font-medium text-foreground">{tool.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{tool.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
