import type { Metadata } from "next";
import Link from "next/link";

/**
 * Branded Turkish 404 page.
 *
 * Replaces Next.js's bare black English default ("This page could not be
 * found") — which, on a Turkish marketplace-seller product, read as broken and
 * off-brand. This one keeps the visitor in the funnel: brand mark, Turkish
 * copy, and clear paths back (home + the free tools that are the top-of-funnel
 * hook), rather than a dead end.
 */

export const metadata: Metadata = {
  title: "Sayfa bulunamadı",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Minimal branded header — a way out is always visible. */}
      <header className="mx-auto w-full max-w-6xl px-6 py-6 lg:px-8">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight text-foreground"
        >
          TrueMargin
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-16 lg:px-8">
        <div className="w-full max-w-xl text-center">
          <p
            className="font-mono text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl"
            style={{ color: "var(--tm-copper)" }}
          >
            404
          </p>

          <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-foreground text-balance sm:text-3xl">
            Sayfa bulunamadı
          </h1>

          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            Aradığınız sayfa taşınmış, adı değişmiş ya da hiç var olmamış
            olabilir. Doğru adrese götürelim.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-[var(--tm-r-ui,6px)] px-5 py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-105 sm:w-auto"
              style={{ background: "var(--tm-copper)" }}
            >
              Ana sayfaya dön
            </Link>
            <Link
              href="/urunler"
              className="inline-flex w-full items-center justify-center rounded-[var(--tm-r-ui,6px)] border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
            >
              Ücretsiz araçları keşfet
            </Link>
          </div>

          {/* Quick links — the pages a lost visitor most often wants. */}
          <nav className="mt-10 border-t border-border pt-6">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/araclar/gorunurluk" className="hover:text-foreground">
                  Görünürlük Tespiti
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-foreground">
                  Fiyatlandırma
                </Link>
              </li>
              <li>
                <Link href="/sss" className="hover:text-foreground">
                  SSS
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground">
                  Giriş yap
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </main>
  );
}
