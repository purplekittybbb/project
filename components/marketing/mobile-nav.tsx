"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  DISCOVER_NAV,
  PRODUCTS_NAV,
} from "@/lib/marketing/content";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

function MobileSection({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: Array<{ title: string; href: string; note?: string }>;
  onNavigate: () => void;
}) {
  return (
    <div className="border-b border-border py-3">
      <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="block px-4 py-2.5 text-sm text-foreground hover:bg-secondary/80"
            >
              {item.title}
              {item.note && (
                <span className="ml-1 text-xs text-muted-foreground">({item.note})</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const discoverItems = DISCOVER_NAV.map((l) => ({
    title: l.label,
    href: l.href,
    note: "note" in l ? l.note : undefined,
  }));

  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mobil menü">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/20"
        aria-label="Menüyü kapat"
        onClick={onClose}
      />
      <div className="absolute left-0 right-0 top-16 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-background shadow-lg">
        <MobileSection title="Keşfet" items={discoverItems} onNavigate={onClose} />
        <MobileSection title="Ücretsiz Araçlar" items={PRODUCTS_NAV.free} onNavigate={onClose} />
        <MobileSection title="Mağaza Gerekli" items={PRODUCTS_NAV.store} onNavigate={onClose} />
        <MobileSection title="Chrome Uzantısı" items={PRODUCTS_NAV.extension} onNavigate={onClose} />

        <div className="border-b border-border px-4 py-3">
          <Link
            href="/pricing"
            onClick={onClose}
            className="block py-2.5 text-sm font-medium text-foreground"
          >
            Fiyatlandırma
          </Link>
        </div>

        <div className="flex flex-col gap-2 px-4 py-4">
          <Link
            href="/login"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center border border-border text-sm text-foreground"
          >
            Üye Girişi
          </Link>
          <Link
            href="/signup"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center bg-[var(--tm-copper)] text-sm font-medium text-[var(--tm-paper)]"
          >
            Kaydol
          </Link>
        </div>
      </div>
    </div>
  );
}
