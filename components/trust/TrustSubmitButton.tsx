"use client";

import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LockIcon } from "@/components/trust/LockIcon";

/**
 * PDF §3.2 — güven rozeti işlem anında (point of friction).
 * Internal latch blocks double-submit before parent re-renders disabled.
 */
export function TrustSubmitButton({
  children,
  className = "",
  seal = "256-bit şifreli bağlantı · verileriniz güvende",
  showSeal = true,
  onClick,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  seal?: string;
  showSeal?: boolean;
}) {
  const [latched, setLatched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="w-full">
      <button
        type="submit"
        {...props}
        disabled={disabled || latched}
        className={`tm-btn-primary inline-flex w-full items-center justify-center gap-2 ${className}`.trim()}
        onClick={(e) => {
          if (latched || disabled) {
            e.preventDefault();
            return;
          }
          setLatched(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setLatched(false), 1500);
          onClick?.(e);
        }}
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
