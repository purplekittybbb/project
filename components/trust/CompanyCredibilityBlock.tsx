import { COMPANY_INFO, filledCompanyFields } from "@/lib/legal/company";

/**
 * PDF §2 Stanford — kurumsal güvenilirlik sinyali.
 * Sahte adres yazılmaz; dolu alanlar gösterilir, e-posta her zaman görünür.
 */
export function CompanyCredibilityBlock({ compact = false }: { compact?: boolean }) {
  const fields = filledCompanyFields();
  const hasLegal = fields.length > 0;

  if (compact) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        İletişim:{" "}
        <a href={`mailto:${COMPANY_INFO.email}`} className="text-[var(--tm-copper)] hover:underline">
          {COMPANY_INFO.email}
        </a>
        {COMPANY_INFO.legalName ? ` · ${COMPANY_INFO.legalName}` : ""}
        {!hasLegal && " · Gerçek şirket / adres bilgileri yasal kayıt sonrası burada yayınlanır"}
      </p>
    );
  }

  return (
    <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
        Kurumsal iletişim
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="shrink-0 text-muted-foreground">E-posta</dt>
          <dd>
            <a href={`mailto:${COMPANY_INFO.email}`} className="text-[var(--tm-copper)] hover:underline">
              {COMPANY_INFO.email}
            </a>
          </dd>
        </div>
        {fields.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="shrink-0 text-muted-foreground">{f.label}</dt>
            <dd className="text-foreground">{f.value}</dd>
          </div>
        ))}
      </dl>
      {!hasLegal && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Ticaret unvanı, açık adres ve MERSİS bilgileri henüz bu alanda yayınlanmamıştır. Uydurma
          adres göstermiyoruz — kayıt tamamlandığında{" "}
          <code className="text-[11px]">lib/legal/company.ts</code> üzerinden tek kaynaktan eklenir.
        </p>
      )}
    </div>
  );
}
