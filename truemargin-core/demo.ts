import { SELLERS, deriveUnderwritingInputs, seededBacktestSellers } from "./src/data/seed.js";
import { aggregatePerceivedMargin, aggregateTrueMargin, perSkuMargins } from "./src/domain/margin-engine.js";
import { trueMarginModel } from "./src/domain/underwriting.js";
import { runBacktest } from "./src/domain/backtest.js";
import { InMemoryLedger, recordDecision } from "./src/domain/ledger.js";

const fmt = (n:number)=> new Intl.NumberFormat("tr-TR",{maximumFractionDigits:0}).format(n);

console.log("=== REVEAL: sanilan vs gercek marj ===");
for (const s of SELLERS) {
  const p = aggregatePerceivedMargin(s.transactions).marginPct;
  const t = aggregateTrueMargin(s.transactions).marginPct;
  console.log(`${s.tenantId}: satici saniyor ~%${s.perceivedMarginBelief} | motor (perceived) %${p.toFixed(1)} -> GERCEK %${t.toFixed(1)}`);
}

console.log("\n=== SILENT LOSERS (seller-b) ===");
for (const r of perSkuMargins(SELLERS[1].transactions)) {
  console.log(`  ${r.sku}: perceived %${r.perceivedMarginPct.toFixed(1)} -> true %${r.trueMarginPct.toFixed(1)} ${r.isSilentLoser?"[SESSIZ ZARAR]":""}`);
}

console.log("\n=== UNDERWRITING + DECISION TRACE (ledger) ===");
const ledger = new InMemoryLedger();
for (const s of seededBacktestSellers()) {
  const d = trueMarginModel(s.tenantId, s.inputs, s.currency);
  recordDecision(ledger, d);
  console.log(`${s.tenantId}: limit ${fmt(d.approvedLimit)} TRY @ take-rate %${(d.takeRate*100).toFixed(1)}`);
  console.log(`   gerekce: ${d.rationale[d.rationale.length-2]}`);
}
console.log(`ledger'da ${ledger.all().length} degistirilemez karar kaydi.`);

console.log("\n=== BACKTEST: biz vs incumbent ===");
const b = runBacktest(seededBacktestSellers());
console.log(`TrueMargin : dagitilan ${fmt(b.trueMargin.deployed)} | zarar ${fmt(b.trueMargin.totalLoss)} | charge-off %${(b.trueMargin.chargeOffRate*100).toFixed(1)} | delinquency %${(b.trueMargin.delinquencyRate*100).toFixed(0)}`);
console.log(`Incumbent  : dagitilan ${fmt(b.incumbent.deployed)} | zarar ${fmt(b.incumbent.totalLoss)} | charge-off %${(b.incumbent.chargeOffRate*100).toFixed(1)} | delinquency %${(b.incumbent.delinquencyRate*100).toFixed(0)}`);
console.log(`--> zarar azaltimi incumbent'a gore %${(b.lossReductionPct*100).toFixed(0)}, charge-off ${b.chargeOffImprovementPp.toFixed(1)} puan daha dusuk`);
