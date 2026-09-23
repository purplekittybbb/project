import { Reveal } from "@/components/reveal";
import { TESTIMONIALS } from "@/lib/marketing/testimonials";

/**
 * "Kullananlar ne diyor" — referans kartları.
 * Liste boşsa render edilmez. İçerik kaynağı: lib/marketing/testimonials.ts
 * (şu an TEMP placeholder; gerçek izinli yorumlarla değiştirilecek).
 */
export function TestimonialsSection() {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section className="border-t border-border bg-secondary/20">
      <div className="mx-auto max-w-6xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
              Referanslar
            </p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Kullananlar ne diyor
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Pazaryeri satıcılarından gelen deneyimler.
            </p>
          </div>
        </Reveal>

        <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={`${t.name}-${i}`} delay={i * 60}>
              <li className="flex h-full flex-col rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-6 shadow-[0_1px_2px_rgba(18,24,27,0.04)]">
                <blockquote className="flex-1 text-sm leading-relaxed text-foreground/85">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      background: "color-mix(in srgb, var(--tm-copper) 12%, var(--tm-paper))",
                      color: "var(--tm-copper)",
                    }}
                    aria-hidden="true"
                  >
                    {t.initials ?? t.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.role}</span>
                  </span>
                </figcaption>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
