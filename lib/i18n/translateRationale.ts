import type { SupportedLanguage } from "./config";

/**
 * The underwriting engine (lib/domain/underwriting.ts) always produces its
 * `rationale` strings in English — that's fine for the Copilot's LLM prompt
 * (an LLM told to answer in Turkish handles English source facts just fine),
 * but the Financing tab renders these lines directly as UI copy, so a
 * Turkish-language user would otherwise see raw English sentences mixed in
 * with an otherwise fully-Turkish page. Each pattern below matches one of the
 * engine's fixed rationale templates and re-renders it in Turkish; an
 * unrecognized line (e.g. if the engine's wording changes) is left as-is
 * rather than mistranslated.
 */
const PATTERNS: { re: RegExp; tr: (m: RegExpMatchArray) => string }[] = [
  {
    re: /^Limit anchored to (\d+)x trailing monthly contribution \(([-\d.,]+) (\w+)\)\.$/,
    tr: (m) => `Limit, trailing aylık katkının ${m[1]} katına sabitlendi (${m[2]} ${m[3]}).`,
  },
  {
    re: /^Volatility haircut (\d+)% applied \(revenue CoV ([\d.]+)\)\.$/,
    tr: (m) => `Volatilite kesintisi %${m[1]} uygulandı (gelir CoV ${m[2]}).`,
  },
  {
    re: /^True margin below 10% -> \+1\.5% risk premium\.$/,
    tr: () => `Gerçek marj %10'un altında -> +%1.5 risk primi.`,
  },
  {
    re: /^True margin 10-20% -> \+0\.7% risk premium\.$/,
    tr: () => `Gerçek marj %10-20 arası -> +%0.7 risk primi.`,
  },
  {
    re: /^True margin above 20% -> no margin premium\.$/,
    tr: () => `Gerçek marj %20'nin üzerinde -> marj primi yok.`,
  },
  {
    re: /^Return rate (\d+)% -> \+0\.5% premium\.$/,
    tr: (m) => `İade oranı %${m[1]} -> +%0.5 prim.`,
  },
  {
    re: /^Tenure (\d+)m \(<12m\) -> \+0\.5% premium\.$/,
    tr: (m) => `Tenure ${m[1]} ay (<12 ay) -> +%0.5 prim.`,
  },
  {
    re: /^Take rate set to ([\d.]+)% \(band 3-6%\)\.$/,
    tr: (m) => `Take-rate %${m[1]} olarak belirlendi (bant %3-6).`,
  },
  {
    re: /^Limit = 0\.35x trailing monthly revenue \(([-\d.,]+) (\w+)\)\.$/,
    tr: (m) => `Limit = trailing aylık gelirin 0.35 katı (${m[1]} ${m[2]}).`,
  },
  {
    re: /^Priced flat at 5%; true margin not observed\.$/,
    tr: () => `Sabit %5 fiyatlandı; gerçek marj gözlemlenmedi.`,
  },
];

export function translateRationale(rationale: string[], language: SupportedLanguage): string[] {
  if (language !== "tr") return rationale;
  return rationale.map((line) => {
    for (const { re, tr } of PATTERNS) {
      const m = line.match(re);
      if (m) return tr(m);
    }
    return line;
  });
}

// getBenchmarkRows() (lib/engine.ts) is another engine-level data source whose
// `label` field is always English — same rationale as translateRationale
// above: display-only translation here, engine stays single-source-of-truth.
const BENCHMARK_LABEL_TR: Record<string, string> = {
  "Charge-off rate": "Temerrüt oranı",
  "Delinquency rate": "Gecikme oranı",
  "Take-rate band": "Take-rate bandı",
  "Decision latency": "Karar gecikmesi",
  "Loss reduction vs incumbent": "Incumbent'a göre kayıp azalması",
};

export function translateBenchmarkLabel(label: string, language: SupportedLanguage): string {
  if (language !== "tr") return label;
  return BENCHMARK_LABEL_TR[label] ?? label;
}
