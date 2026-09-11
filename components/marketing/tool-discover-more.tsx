import Link from "next/link";
import { getRelatedTools, toolDisplayTitle } from "@/lib/marketing/content";

interface ToolDiscoverMoreProps {
  currentSlug: string;
}

export function ToolDiscoverMore({ currentSlug }: ToolDiscoverMoreProps) {
  const related = getRelatedTools(currentSlug, 4);
  if (related.length === 0) return null;

  return (
    <aside className="mt-20 border-t border-[var(--tm-mist)] pt-12">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
        Diğer araçları keşfet
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Aynı panelden diğer ücretsiz ve mağaza araçlarına geçin.
      </p>
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {related.map((tool) => (
          <li key={tool.id}>
            <Link
              href={tool.href}
              className="block rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card px-4 py-3 transition-colors hover:border-[var(--tm-copper)]/40"
            >
              <span className="font-medium text-foreground">{toolDisplayTitle(tool)}</span>
              <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                {tool.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
