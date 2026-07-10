import Link from 'next/link'

const links = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'About', href: '#about' },
  { label: 'Privacy', href: '#' },
]

export function SiteFooter() {
  return (
    <footer id="about" className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <span className="font-heading text-lg font-bold tracking-tight text-foreground">
          [BRAND]
        </span>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {links.map((link) => (
              <li key={link.label}>
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
          © 2026 [BRAND]. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
