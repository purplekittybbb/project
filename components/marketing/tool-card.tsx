import Link from "next/link";

import type { ToolDefinition } from "@/lib/tools/registry";



function ToolBadge({ badge }: { badge: ToolDefinition["badge"] }) {

  if (badge === "free") {

    return (

      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800">

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



/** Sade kart — cursor-design-prompt: tutarlı köşe, ince border, gölgesiz reklam kutusu yok. */

export function ToolCard({ tool }: { tool: ToolDefinition }) {

  const inner = (

    <>

      <div className="flex items-start justify-between gap-3">

        <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">

          {tool.title}

        </h3>

        <ToolBadge badge={tool.badge} />

      </div>

      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">

        {tool.description}

      </p>

    </>

  );



  return (

    <article className="h-full rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card shadow-[0_1px_2px_rgba(18,24,27,0.04)] transition-colors hover:border-[var(--tm-copper)]/40">

      <Link href={tool.href} className="flex h-full flex-col p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-copper)]">

        {inner}

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

      <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">{title}</h3>

      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>

    </>

  );



  if (href) {

    return (

      <article className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-background shadow-[0_1px_2px_rgba(18,24,27,0.04)] transition-colors hover:border-[var(--tm-copper)]/40">

        <Link href={href} className="flex h-full flex-col p-4">

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


