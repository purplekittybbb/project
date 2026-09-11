import type { ReactNode } from "react";
import { LockIcon } from "@/components/trust/LockIcon";

/**
 * PDF §3.1 — ödeme / hassas alan kapsülü.
 * Kart alanları sayfa gövdesinden görsel olarak ayrılır; kilit işlem noktasında.
 */
export function SecurePaymentCapsule({
  title,
  hint,
  children,
  footerHint,
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
  footerHint?: string;
}) {
  return (
    <div className="tm-secure-field-group rounded-[var(--tm-r-ui)] p-5 sm:p-6">
      {(title || hint) && (
        <div className="mb-4 flex flex-col gap-1 border-b border-[var(--tm-mist)] pb-4">
          {title && (
            <p className="text-sm font-medium text-foreground">{title}</p>
          )}
          {hint && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <LockIcon className="text-[var(--tm-copper)]" />
              {hint}
            </p>
          )}
        </div>
      )}
      {children}
      {footerHint && (
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <LockIcon />
          <span>{footerHint}</span>
        </div>
      )}
    </div>
  );
}
