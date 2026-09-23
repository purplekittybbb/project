import Link from "next/link";
import { MARKETING_NAV } from "@/lib/marketing/content";
import { SITE_NAME } from "@/lib/seo";
import { companyFooterLine } from "@/lib/legal/company";
import { CompanyCredibilityBlock } from "@/components/trust/CompanyCredibilityBlock";

const companyLinks = [
  { label: "Giriş", href: "/login" },
  { label: "Kaydol", href: "/signup" },
  { label: "Fiyatlandırma", href: "/pricing" },
  { label: "Yatırımcı", href: "/yatirimci" },
  { label: "Demo", href: "/demo" },
  { label: "Değişiklik Günlüğü", href: "/changelog" },
];

const legalLinks = [
  { label: "Gizlilik (KVKK)", href: "/gizlilik" },
  { label: "Kullanım Koşulları", href: "/kullanim-kosullari" },
  { label: "İptal ve İade", href: "/iptal-iade" },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/70">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
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
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-8 lg:px-8">
        <div className="max-w-xs">
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">
            {SITE_NAME}
          </span>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Pazaryeri satıcıları için gerçek net kâr takibi. Komisyon, KDV, kargo ve iade
            düşülmüş — tahmin değil, gerçek rakam.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["Trendyol", "Hepsiburada", "N11"].map((m) => (
              <span
                key={m}
                className="inline-flex items-center rounded-full border border-[var(--tm-mist)] bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        <FooterColumn title="Keşfet" links={[...MARKETING_NAV]} />
        <FooterColumn title="Şirket" links={companyLinks} />
        <FooterColumn title="Yasal" links={legalLinks} />
      </div>

      {/* PDF §2 — ticaret unvanı + MERSİS yasal satırı; lib/legal/company.ts
          doldurulunca görünür (boşken gizli, sahte bilgi yazılmaz). */}
      {companyFooterLine() && (
        <div className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-3 lg:px-8">
            <p className="text-[11px] text-muted-foreground">{companyFooterLine()}</p>
          </div>
        </div>
      )}

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-6 sm:flex-row sm:items-center lg:px-8">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {SITE_NAME}. Tüm hakları saklıdır.
            </p>
            <CompanyCredibilityBlock compact />
          </div>
          <p className="text-xs text-muted-foreground">
            Fiyatlar KDV hariçtir · İstediğiniz an iptal
          </p>
        </div>
      </div>
    </footer>
  );
}
