"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DISCOVER_NAV,
  PRODUCTS_NAV,
} from "@/lib/marketing/content";
import { SITE_NAME } from "@/lib/seo";
import { MobileNav } from "@/components/marketing/mobile-nav";
import {
  NavDropdown,
  NavDropdownLink,
  NavDropdownSection,
} from "@/components/marketing/nav-dropdown";

export function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
      <nav
        aria-label="Ana menü"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8"
      >
        <Link
          href="/"
          className="font-heading text-lg font-bold tracking-tight text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          {SITE_NAME}
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          <NavDropdown label="Keşfet">
            {DISCOVER_NAV.map((link) => (
              <NavDropdownLink
                key={link.href}
                href={link.href}
                label={link.label}
                note={"note" in link ? link.note : undefined}
              />
            ))}
          </NavDropdown>

          <NavDropdown label="Ürünler">
            <NavDropdownSection title="Ücretsiz Araçlar" items={PRODUCTS_NAV.free} />
            <div className="my-1 border-t border-border" />
            <NavDropdownSection title="Mağaza Gerekli" items={PRODUCTS_NAV.store} />
            <div className="my-1 border-t border-border" />
            <NavDropdownSection title="Chrome Uzantısı" items={PRODUCTS_NAV.extension} />
          </NavDropdown>

          <li>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Fiyatlandırma
            </Link>
          </li>
        </ul>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-1 sm:flex sm:gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:px-4"
            >
              Üye Girişi
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center justify-center bg-[var(--tm-copper)] px-4 text-sm font-medium text-[var(--tm-paper)] transition-opacity hover:opacity-90 sm:px-5"
            >
              Kaydol
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            aria-label={mobileOpen ? "Menüyü kapat" : "Menüyü aç"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className="sr-only">{mobileOpen ? "Kapat" : "Menü"}</span>
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      <div id="mobile-nav-panel">
        <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
      </div>
    </header>
  );
}
