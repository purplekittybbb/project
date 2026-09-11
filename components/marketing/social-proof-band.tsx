import Link from "next/link";
import { LAUNCH_BANNER } from "@/lib/marketing/content";

export function SocialProofBand() {
  return (
    <section
      aria-label="Platform durumu"
      className="border-b border-border bg-secondary/50"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 px-6 py-6 text-center sm:flex-row sm:gap-6 lg:px-8">
        <p className="text-sm font-medium text-foreground">{LAUNCH_BANNER.message}</p>
        <Link
          href="/signup"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {LAUNCH_BANNER.subtext}
        </Link>
      </div>
    </section>
  );
}
