"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface NavDropdownProps {
  label: string;
  children: React.ReactNode;
}

export function NavDropdown({ label, children }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openMenu() {
    if (timeout.current) clearTimeout(timeout.current);
    setOpen(true);
  }

  function closeMenu() {
    timeout.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <li
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="text-[10px]" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 min-w-[220px] rounded-[var(--tm-r-ui)] border border-border bg-background py-2 shadow-lg">
          {children}
        </div>
      )}
    </li>
  );
}

export function NavDropdownLink({
  href,
  label,
  note,
}: {
  href: string;
  label: string;
  note?: string;
}) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-sm text-foreground hover:bg-secondary/80"
    >
      {label}
      {note && <span className="ml-1 text-xs text-muted-foreground">({note})</span>}
    </Link>
  );
}

export function NavDropdownSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; href: string }>;
}) {
  return (
    <div className="px-2 py-1">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="block rounded px-2 py-1.5 text-sm text-foreground hover:bg-secondary/80"
        >
          {item.title}
        </Link>
      ))}
    </div>
  );
}
