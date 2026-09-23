/**
 * Presentational competitor price cell — no hooks / no client directive.
 * Safe for React Server Components that pass serializable props.
 */

import { finSignedClass } from "@/lib/design/financial-ui";
import { fmtTry } from "@/lib/tools/format-tr";

export function CompetitorPriceBand({
  label,
  price,
  median,
}: {
  label: string;
  price: number;
  /** When set, prices above median → fin-profit; below → fin-loss. */
  median?: number;
}) {
  const delta = median != null && median > 0 ? price - median : 0;
  return (
    <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          median != null && median > 0
            ? finSignedClass(delta, "mt-1 font-mono text-sm font-semibold")
            : "mt-1 font-mono text-sm font-semibold tabular-nums tnum"
        }
      >
        {fmtTry(price)}
      </p>
    </div>
  );
}
