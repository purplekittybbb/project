import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LockIcon } from "@/components/trust/LockIcon";

/**
 * PDF §3.2 — güven rozeti işlem anında (point of friction).
 * Kilit, CTA'nın içinde / hemen yanında; footer'a gömülmez.
 */
export function TrustSubmitButton({
  children,
  className = "",
  seal = "256-bit şifreli bağlantı · verileriniz güvende",
  showSeal = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  seal?: string;
  showSeal?: boolean;
}) {
  return (
    <div className="w-full">
      <button
        type="submit"
        {...props}
        className={`tm-btn-primary inline-flex w-full items-center justify-center gap-2 ${className}`.trim()}
      >
        <LockIcon className="shrink-0 text-[var(--tm-paper)] opacity-90" />
        <span>{children}</span>
      </button>
      {showSeal && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <LockIcon />
          <span>{seal}</span>
        </p>
      )}
    </div>
  );
}
