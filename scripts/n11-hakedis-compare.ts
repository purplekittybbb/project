/**
 * Compare one N11 panel hakediş line to the official-fee engine.
 *
 * Does NOT call N11. Paste numbers from the seller panel:
 *
 *   npx tsx scripts/n11-hakedis-compare.ts --gross 1200 --rate 0.10 --payout 1045.952
 */

import { compareN11HakedisLine } from "../lib/adapters/n11-hakedis";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const gross = Number(arg("gross"));
const rate = Number(arg("rate"));
const payout = Number(arg("payout"));
const vat = arg("vat") != null ? Number(arg("vat")) : undefined;

if (!(gross > 0) || !(rate >= 0) || !(payout >= 0)) {
  console.error("Kullanım: npx tsx scripts/n11-hakedis-compare.ts --gross 1200 --rate 0.10 --payout 1045.952");
  process.exit(1);
}

const result = compareN11HakedisLine({
  grossRevenue: gross,
  publishedCommissionRate: rate,
  panelPayout: payout,
  vatRate: vat,
});

console.log("N11 hakediş karşılaştırması (canlı API yok — panel rakamı vs motor)");
console.log(`  Komisyon:     ${result.commission.toFixed(3)} TL`);
console.log(`  Ek kesintiler:${result.extrasTotal.toFixed(3)} TL`);
console.log(`  Motor hakediş:${result.enginePayout.toFixed(3)} TL`);
console.log(`  Panel hakediş:${result.panelPayout.toFixed(3)} TL`);
console.log(`  Fark:         ${(result.pctDiff * 100).toFixed(2)}%`);
console.log(result.within5Pct ? "  ±5% içinde: EVET" : "  ±5% içinde: HAYIR");
process.exit(result.within5Pct ? 0 : 2);
