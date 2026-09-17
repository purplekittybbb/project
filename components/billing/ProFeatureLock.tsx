"use client";

/**
 * Shown instead of a Profesyonel-only dashboard tab's real content when the
 * signed-in user isn't on an active/trialing subscription that grants Pro
 * access (see hasProAccess in app/dashboard/page.tsx).
 *
 * Matches the dashboard's dark "financial surface" palette (zinc-950/900),
 * not the marketing site's tm-* tokens — this only ever renders inside
 * app/dashboard/page.tsx's sidebar+content shell.
 */

export function ProFeatureLock({
  feature,
  onUpgrade,
}: {
  feature: string;
  onUpgrade: () => void;
}) {
  return (
    <div className="max-w-[560px] mx-auto px-8 py-20 text-center">
      <div className="inline-flex items-center gap-1.5 px-2 py-1 mb-6 text-[10px] font-mono uppercase tracking-[0.15em] text-amber-400 border border-amber-400/30 bg-amber-400/5">
        Profesyonel
      </div>
      <h2 className="text-zinc-200 font-sans text-lg font-medium mb-2">{feature} — Profesyonel pakette</h2>
      <p className="text-zinc-500 text-sm leading-relaxed mb-8">
        Bu özellik Profesyonel pakete dahildir. Şu an aktif bir Profesyonel aboneliğiniz yok — devam etmek
        için paketinizi yükseltin.
      </p>
      <button
        type="button"
        onClick={onUpgrade}
        className="h-10 px-5 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors"
      >
        Paketleri gör
      </button>
    </div>
  );
}
