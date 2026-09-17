import Link from "next/link";
import {
  Calculator, Eye, LineChart, Trophy, SearchCheck,
  Coins, TriangleAlert, ShieldCheck, Activity, BadgeCheck, ScanLine, Puzzle,
  ArrowRight, type LucideIcon,
} from "lucide-react";

import type { ToolDefinition } from "@/lib/tools/registry";

/** Per-tool icon — gives each card a distinct, scannable visual anchor. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  "profit-calc": Calculator,
  visibility: Eye,
  "price-track": LineChart,
  top100: Trophy,
  "index-check": SearchCheck,
  profit: Coins,
  "loss-alarm": TriangleAlert,
  "safe-price": ShieldCheck,
  demand: Activity,
  "list-quality": BadgeCheck,
  "barcode-analysis": ScanLine,
};

function ToolBadge({ badge }: { badge: ToolDefinition["badge"] }) {
  if (badge === "free") {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--tm-ledger-green)]/30 bg-[var(--tm-ledger-green)]/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--tm-ledger-green)]">
        Ücretsiz Dene
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-[var(--tm-copper)]/30 bg-[var(--tm-copper)]/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--tm-copper)]">
      Mağaza Gerekli
    </span>
  );
}

function IconBox({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--tm-r-data,6px)] bg-[var(--tm-copper)]/10 text-[var(--tm-copper)]">
      <Icon size={20} strokeWidth={1.8} />
    </span>
  );
}

export function ToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = TOOL_ICONS[tool.id] ?? Calculator;
  return (
    <article className="group h-full rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card shadow-[0_1px_2px_rgba(18,24,27,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--tm-copper)]/40 hover:shadow-[0_8px_24px_rgba(18,24,27,0.08)]">
      <Link href={tool.href} className="flex h-full flex-col p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-copper)]">
        <div className="flex items-center justify-between gap-3">
          <IconBox icon={Icon} />
          <ToolBadge badge={tool.badge} />
        </div>
        <h3 className="mt-4 font-heading text-base font-semibold tracking-tight text-foreground">
          {tool.title}
        </h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
          {tool.description}
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--tm-copper)]">
          İncele
          <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </Link>
    </article>
  );
}

/** Extension cards — no link/badge yet. */
export function ExtensionToolCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--tm-r-data,6px)] bg-[var(--tm-copper)]/10 text-[var(--tm-copper)]">
          <Puzzle size={20} strokeWidth={1.8} />
        </span>
        <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </>
  );

  if (href) {
    return (
      <article className="group rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-background shadow-[0_1px_2px_rgba(18,24,27,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--tm-copper)]/40 hover:shadow-[0_8px_24px_rgba(18,24,27,0.08)]">
        <Link href={href} className="flex h-full flex-col p-5">
          {inner}
        </Link>
      </article>
    );
  }

  return (
    <article className="flex h-full flex-col rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-5 shadow-[0_1px_2px_rgba(18,24,27,0.04)]">
      {inner}
    </article>
  );
}
