import Link from "next/link";
import { MARKETING_NAV } from "@/lib/marketing/content";
import { SITE_NAME } from "@/lib/seo";

const footerLinks = [
  ...MARKETING_NAV,
  { label: "Demo", href: "/demo" },
  { label: "Giriş", href: "/login" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <span className="font-heading text-lg font-bold tracking-tight text-foreground">
          {SITE_NAME}
        </span>

        <nav aria-label="Alt menü">
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {footerLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-12 lg:px-8">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {SITE_NAME}. Tüm hakları saklıdır.
        </p>
      </div>
    </footer>
  );
}
