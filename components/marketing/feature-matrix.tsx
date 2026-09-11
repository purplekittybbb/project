import { FEATURE_MATRIX, PRICING_TIERS } from "@/lib/marketing/content";

function Cell({ value }: { value: boolean | "limited" }) {
  if (value === "limited") {
    return (
      <span className="text-xs font-medium text-muted-foreground" title="Günlük limitli">
        Limitli
      </span>
    );
  }
  if (value) {
    return (
      <span className="text-[var(--tm-ledger-green)]" aria-label="Dahil">
        ✓
      </span>
    );
  }
  return (
    <span className="text-muted-foreground/50" aria-label="Dahil değil">
      ✗
    </span>
  );
}

export function FeatureMatrix() {
  const tierIds = PRICING_TIERS.map((t) => t.id);

  return (
    <div className="overflow-x-auto rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)]">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--tm-mist)] bg-secondary/40">
            <th className="px-4 py-3 text-left font-medium text-foreground">Web araçları</th>
            {PRICING_TIERS.map((tier) => (
              <th key={tier.id} className="px-4 py-3 text-center font-medium text-foreground">
                {tier.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_MATRIX.map((row, idx) => (
            <tr
              key={row.label}
              className={idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}
            >
              <td className="px-4 py-3 text-foreground">{row.label}</td>
              {tierIds.map((id) => (
                <td key={id} className="px-4 py-3 text-center">
                  <Cell value={row[id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
