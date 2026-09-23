import Link from "next/link";
import { LAUNCH_BANNER } from "@/lib/marketing/content";
import {
  PLACEHOLDER_METRICS,
  PLACEHOLDER_METRICS_ACTIVE,
} from "@/lib/marketing/placeholder-metrics";

/**
 * Hero altı sosyal kanıt bandı.
 * TEMP metrikler `placeholder-metrics.ts` — gerçek veri gelince kapat/değiştir.
 */
export function SocialProofBand() {
  return (
    <section
      aria-label="Platform durumu"
      className="border-b border-border bg-secondary/50"
    >
      {PLACEHOLDER_METRICS_ACTIVE && (
        <div className="border-b border-border/60 bg-[color-mix(in_srgb,var(--tm-navy)_4%,var(--tm-paper))]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4 lg:px-8">
            <Stat value={PLACEHOLDER_METRICS.arrLabel} hint={PLACEHOLDER_METRICS.arrHint} />
            <Stat value={PLACEHOLDER_METRICS.gmvLabel} hint={PLACEHOLDER_METRICS.gmvHint} />
            <Stat value={PLACEHOLDER_METRICS.sellersLabel} hint={PLACEHOLDER_METRICS.sellersHint} />
            <Stat
              value={PLACEHOLDER_METRICS.marginDeltaLabel}
              hint={PLACEHOLDER_METRICS.marginDeltaHint}
              emphasize
            />
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 px-6 py-6 text-center sm:flex-row sm:gap-6 lg:px-8">
        <p className="text-sm font-medium text-foreground">{LAUNCH_BANNER.message}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Link
            href="/signup"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {LAUNCH_BANNER.subtext}
          </Link>
          <span className="hidden text-border sm:inline" aria-hidden>
            ·
          </span>
          <Link
            href="/demo"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Seed paneli incele
          </Link>
          <span className="hidden text-border sm:inline" aria-hidden>
            ·
          </span>
          <Link
            href="/yatirimci"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Yatırımcı diligence
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  hint,
  emphasize = false,
}: {
  value: string;
  hint: string;
  emphasize?: boolean;
}) {
  return (
    <div className="text-center sm:text-left">
      <div
        className={`font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${
          emphasize ? "fin-profit" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {hint}
      </div>
    </div>
  );
}
