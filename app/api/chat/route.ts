import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type ModelMessage } from "ai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import {
  buildFinancingView, buildSellerView, getFinancing, getSeller, LOW_SAMPLE_HISTORY_MONTHS,
  type Channel, type FinancingView, type SellerView,
} from "@/lib/engine";
import { DEFAULT_CHANNEL } from "@/lib/product-market";
import { buildUserSeller, USER_TENANT_ID } from "@/lib/supabase/user-data";
import { translateRationale } from "@/lib/i18n/translateRationale";

/**
 * Analyst Copilot — real multi-turn chat, grounded ONLY in the engine's own output.
 *
 * The client never supplies the seller's numbers; it only sends `tenantId` + `channel`
 * + the conversation so far. This route re-derives the data snapshot straight from
 * lib/engine (margin, fee waterfall, the rule-based underwriting decision, and the
 * true-margin-vs-incumbent backtest) and embeds it in the system prompt. The model is
 * instructed to explain that snapshot only — never invent numbers, never issue or
 * revise a lending decision. Two LLM backends are supported — Claude
 * (ANTHROPIC_API_KEY, via @ai-sdk/anthropic) takes priority if configured,
 * else Gemini (GEMINI_API_KEY, direct REST call to generateContent — see
 * callGemini below). If neither is set, or the configured one errors (rate
 * limit, quota, network), a deterministic rule-based answer is streamed
 * instead — visibly marked via X-Copilot-Mode, never silently — so the panel
 * always works and never hallucinates.
 */

export const runtime = "nodejs";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Only "en"/"tr" are ever persisted (see lib/i18n/config.ts's SUPPORTED_LANGUAGES) —
 *  this route deliberately does NOT import that client-side i18next module (it would
 *  pull in and initialize the whole i18next runtime on the server for no reason), so
 *  the type is duplicated here, narrowly, just for this one purpose. */
type Language = "en" | "tr";

function resolveLanguage(v: unknown): Language {
  return v === "tr" ? "tr" : "en";
}

interface ChatRequestBody {
  messages: ChatTurn[];
  tenantId?: string;
  channel?: Channel;
  language?: Language;
}

/** Prepended verbatim to system_instruction, ahead of everything else, so it's the
 *  first instruction the model sees — the language must hold regardless of what
 *  language the user's own question is written in. */
const LANGUAGE_DIRECTIVE: Record<Language, string> = {
  en: "ALWAYS respond in English, regardless of what language the user's question is in. All data labels, explanations, and scenario breakdowns must be in English.",
  tr: "HER ZAMAN Türkçe cevap ver, kullanıcının sorusu hangi dilde olursa olsun. Tüm veri etiketleri, açıklamalar ve senaryo dökümleri Türkçe olmalı.",
};

// Two full translations, not one English prompt + a translated directive tacked on
// top — a system_instruction that mixes an English rulebook with a Turkish opening
// line is exactly the "mixed-language remnant" this was built to eliminate.
const GUARDRAIL_SYSTEM_PROMPT_EN = `You are the Analyst Copilot embedded in TrueMargin's underwriting dashboard. You help an underwriter understand ONE seller's real margin and the credit decision already made about them.

STRICT RULES — follow all of them:
1. Use ONLY the facts inside DATA_SNAPSHOT below. Never invent, estimate, round-trip, or guess a number that is not present in it.
2. You do NOT make, approve, revise, or override underwriting decisions. The approved limit and take-rate were already produced by a deterministic rule-based model (see underwritingDecision.rationale). Your only job is to explain, in plain language, why that model produced this result.
3. If the user asks you to raise a limit, waive risk, approve more capital, or change the decision, politely decline in one sentence and explain you can only interpret the existing decision trace — then still answer the underlying question using the data if there is one.
4. If a question cannot be answered from DATA_SNAPSHOT, say so plainly instead of guessing.
5. When relevant, cite the specific fields that drove the answer (true margin %, take-rate, return rate, tenure, stock velocity, revenue volatility, charge-off rates).
6. Be concise: 2-5 sentences, no preamble, no markdown headers, active voice.`;

const GUARDRAIL_SYSTEM_PROMPT_TR = `Sen TrueMargin'in underwriting panosuna gömülü Analist Copilot'sun. Bir underwriter'ın TEK bir satıcının gerçek marjını ve o satıcı için zaten verilmiş kredi kararını anlamasına yardımcı oluyorsun.

KESİN KURALLAR — hepsine uy:
1. SADECE aşağıdaki DATA_SNAPSHOT içindeki gerçekleri kullan. İçinde olmayan bir sayıyı asla uydurma, tahmin etme, yuvarlama.
2. Underwriting kararı verme, onaylama, değiştirme veya geçersiz kılma yetkin yok. Onaylanan limit ve take-rate zaten deterministik, kural-tabanlı bir model tarafından üretildi (bkz. underwritingDecision.rationale). Tek işin, bu modelin bu sonucu neden ürettiğini sade bir dille açıklamak.
3. Kullanıcı limiti artırmanı, riski göz ardı etmeni, daha fazla kredi onaylamanı veya kararı değiştirmeni isterse, kibarca tek cümleyle reddet ve sadece mevcut karar izini yorumlayabildiğini belirt — sonra varsa asıl soruyu yine de veriyle yanıtla.
4. Bir soru DATA_SNAPSHOT'tan yanıtlanamıyorsa, tahmin etmek yerine bunu açıkça söyle.
5. İlgili olduğunda, cevabı belirleyen alanları belirt (gerçek marj %, take-rate, iade oranı, tenure, stok hızı, gelir volatilitesi, temerrüt oranları).
6. Kısa ol: 2-5 cümle, giriş cümlesi yok, markdown başlık yok, etken çatı.`;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve the (view, financing) pair for this request.
 *
 * Seed sellers (demo mode's seller-a/b/c) are looked up straight from the
 * engine — no auth needed, unchanged from before. A real signed-in user's own
 * tenant ("user-data") is NEVER in that lookup: their data only ever lived in
 * the BROWSER's copy of lib/engine's RUNTIME_SELLERS (populated client-side
 * after their Supabase fetch), which this server process never shares — so
 * `getSeller`/`getFinancing` always returned undefined for them here, and the
 * panel always said "I don't have data for this seller/channel combination."
 *
 * The fix: for that tenant, re-fetch the user's own `user_transactions` here,
 * server-side, scoped by their access token (RLS enforces it's only their
 * rows), and build the view/financing straight from that seller object via
 * the pure `buildSellerView`/`buildFinancingView` — never through the shared
 * RUNTIME_SELLERS registry, which would leak one user's data into another
 * concurrent request on a warm server instance.
 */
async function resolveSellerData(
  tenantId: string,
  channel: Channel,
  accessToken: string | null
): Promise<{ view: SellerView; fin: FinancingView | null; userId: string | null; supabase: SupabaseClient | null } | null> {
  const seedView = getSeller(tenantId, channel) ?? getSeller(tenantId, DEFAULT_CHANNEL) ?? getSeller(tenantId, "combined");
  if (seedView) {
    // Demo/seed sellers have no real signed-in user behind them (usually no
    // accessToken at all) — nothing to persist a conversation against.
    return { view: seedView, fin: getFinancing(tenantId) ?? null, userId: null, supabase: null };
  }

  if (tenantId !== USER_TENANT_ID || !accessToken) return null;

  const supabase = userScopedClient(accessToken);
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: rows } = await supabase
    .from("user_transactions")
    .select("order_id, sku, category, sale_date, units, gross_revenue, unit_cost, shipping, return_rate, ad_spend, marketplace");
  const userRawRows = (rows ?? []).map((r) => ({
    order_id: (r as { order_id: string }).order_id,
    sku: (r as { sku: string }).sku,
    category: (r as { category: string }).category,
    sale_date: String((r as { sale_date: string }).sale_date).slice(0, 10),
    units: Number((r as { units: number }).units),
    gross_revenue: Number((r as { gross_revenue: number }).gross_revenue),
    unit_cost: Number((r as { unit_cost: number }).unit_cost),
    shipping: Number((r as { shipping: number }).shipping),
    return_rate: Number((r as { return_rate: number }).return_rate),
    ad_spend: Number((r as { ad_spend: number }).ad_spend),
    marketplace: (r as { marketplace: string }).marketplace,
  }));

  const seller = buildUserSeller(userRawRows, USER_TENANT_ID);
  if (!seller) return null;

  const view = buildSellerView(seller, channel) ?? buildSellerView(seller, DEFAULT_CHANNEL) ?? buildSellerView(seller, "combined");
  if (!view) return null;
  // RUNTIME_LABELS (the friendly "Verilerim" label) only ever gets populated
  // client-side — this server process never sees it — so relabel here rather
  // than let the raw tenant id ("user-data") leak into the copilot's answer.
  return {
    view: { ...view, label: "Verilerim" },
    fin: buildFinancingView(seller) ?? null,
    userId: userData.user.id,
    supabase,
  };
}

/** Rebuild the grounded data snapshot for one seller straight from the engine — never trust client-sent numbers. */
function buildDataSnapshot(view: SellerView, fin: FinancingView | null) {
  const d = view.decision;

  return {
    seller: view.label,
    channel: view.channel,
    currency: view.currency,
    margin: {
      perceivedMarginPct: round1(view.perceivedMarginPct),
      trueMarginPct: round1(view.trueMarginPct),
      sellerBelievesMarginPct: view.perceivedMarginBelief,
      grossRevenue: Math.round(view.waterfall.grossRevenue),
      netContribution: Math.round(view.waterfall.netContribution),
      breakEvenPrice: Math.round(view.breakEvenPrice),
    },
    feeWaterfall: {
      commission: Math.round(view.waterfall.commission),
      vat: Math.round(view.waterfall.vat),
      shipping: Math.round(view.waterfall.shipping),
      returnsAllocated: Math.round(view.waterfall.returnsAllocated),
      adSpendAllocated: Math.round(view.waterfall.adSpendAllocated),
      paymentFees: Math.round(view.waterfall.paymentFees),
      cogs: Math.round(view.waterfall.cogs),
    },
    silentLoserSkus: view.silentLosers.map((s) => ({
      sku: s.sku,
      perceivedMarginPct: round1(s.perceivedMarginPct),
      trueMarginPct: round1(s.trueMarginPct),
    })),
    // Every SKU (not just silent losers) so "which product is most/least
    // profitable" has real data to answer from — sorted best true margin
    // first, so index 0 / last are the concrete best/worst answer.
    allSkus: [...view.skus]
      .sort((a, b) => b.trueMarginPct - a.trueMarginPct)
      .map((s) => ({
        sku: s.sku,
        perceivedMarginPct: round1(s.perceivedMarginPct),
        trueMarginPct: round1(s.trueMarginPct),
        returnRatePct: round1(s.returnRatePct),
      })),
    // Real monthly history, exactly what the Dashboard's "Dönemsel Gerçek
    // Marj" chart plots — the ONLY basis scenario answers (Optimistic/Base/
    // Pessimistic) are allowed to use. Below LOW_SAMPLE_HISTORY_MONTHS
    // distinct months, the chat route refuses to generate scenarios rather
    // than project off too little data (same threshold Financing already
    // uses to gate its own "Sınırlı veri" disclosure).
    marginHistory: view.marginHistory.map((p) => ({
      period: p.period,
      label: p.label,
      trueMarginPct: round1(p.trueMarginPct),
    })),
    underwritingDecision: {
      approvedLimit: Math.round(d.approvedLimit),
      approved: d.approvedLimit > 0,
      takeRatePct: round1(d.takeRate * 100),
      rationale: d.rationale,
      inputs: {
        trueMarginPct: round1(d.inputs.trueMarginPct),
        trailingMonthlyContribution: Math.round(d.inputs.trailingMonthlyContribution),
        monthlyRevenue: Math.round(d.inputs.monthlyRevenue),
        revenueVolatility: Math.round(d.inputs.revenueVolatility * 100) / 100,
        stockVelocity: Math.round(d.inputs.stockVelocity),
        returnRatePct: round1(d.inputs.returnRate * 100),
        tenureMonths: d.inputs.tenureMonths,
      },
    },
    backtestVsIncumbent: fin
      ? {
          trueMarginChargeOffPct: round1(fin.report.trueMargin.chargeOffRate * 100),
          incumbentChargeOffPct: round1(fin.report.incumbent.chargeOffRate * 100),
          lossReductionVsIncumbentPct: Math.round(fin.report.lossReductionPct * 100),
        }
      : null,
  };
}

function money(n: number, currency: string) {
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(n)));
  return currency === "USD" ? `$${s}` : `₺${s}`;
}

const OVERRIDE_KEYWORDS = [
  "increase the limit", "raise the limit", "approve more", "override",
  "limiti art", "limiti yükselt", "daha fazla ver", "krediyi artır", "riski gözard",
];

/** Every branch below is a Turkish/English keyword pair over the SAME
 *  underlying question — the rule-based path has no real language
 *  understanding, so each realistic question shape needs its own explicit
 *  trigger words in both languages, or it silently falls through to the
 *  catch-all. Confirmed live: before this, almost every Turkish free-text
 *  question (including a plain "merhaba, nasılsın?") fell through and
 *  returned the exact same canned decision summary regardless of what was
 *  asked — only the 3 English preset buttons ever matched a real branch. */
const PRODUCT_KEYWORDS = [
  "en karlı", "en çok kazandıran", "en çok kar", "en iyi ürün", "en kötü ürün", "en çok zarar",
  "hangi ürünü", "hangi ürün", "ürün hangisi", "sku hangisi", "bıraksam", "durdurmalı", "kaldırmalı",
  "most profitable", "least profitable", "best product", "worst product", "which product", "which sku",
];
const RETURN_RATE_KEYWORDS = ["iade", "return rate", "değişim oranı"];
const SHIPPING_KEYWORDS = ["kargo", "shipping", "nakliye"];
const AD_SPEND_KEYWORDS = ["reklam", "ad spend", "acos"];
const TENURE_KEYWORDS = ["kaç ay", "kaç aylık", "ne kadar süredir", "geçmiş", "tenure", "history"];
const BACKTEST_KEYWORDS = ["backtest", "incumbent", "karşılaştır", "rakip model"];
const LIMIT_KEYWORDS = ["limit", "take-rate", "take rate", "approv", "onay", "kredi", "komisyon oran"];
const MARGIN_KEYWORDS = ["margin", "marj", "waterfall", "fee", "maliyet", "kâr", "kar "];
const SILENT_LOSER_KEYWORDS = ["silent", "sku", "zarar eden"];
const SCENARIO_KEYWORDS = [
  "nakit ak", "projeksiyon", "senaryo", "önümüzdeki ay", "gelecek ay", "ne olur", "tahmin",
  "cash flow", "projection", "forecast", "scenario",
];
/** Signals "the subject of my new question is whatever we were just talking
 *  about" — the closest this rule-based path gets to real pronoun resolution. */
const REFERENTIAL_WORDS = ["onun", "onu", "ona", "onların", "bunun", "bunu", "buna", "şunun", "peki ya", "ya onun"];
const MARKETPLACE_ALIASES: Record<string, Channel> = {
  "trendyol": "trendyol",
  "hepsiburada": "hepsiburada",
  "n11": "n11",
  "shopify": "shopify",
  "amazon": "amazon_us",
};
const CHANNEL_DISPLAY_NAME: Record<string, string> = {
  trendyol: "Trendyol", hepsiburada: "Hepsiburada", n11: "N11", shopify: "Shopify",
  amazon_us: "Amazon US", combined: "Combined",
};

type Snapshot = NonNullable<ReturnType<typeof buildDataSnapshot>>;

/** Picks one template, avoiding an exact repeat of the assistant's immediately
 *  previous message (if determinable) — this is what makes "ask the exact
 *  same question 3 times" return 3 differently-worded (but equally grounded)
 *  answers instead of one memorized string pasted back verbatim each time. */
function pickVariant(templates: string[], lastAssistantMessage: string | undefined): string {
  if (templates.length <= 1) return templates[0] ?? "";
  const start = Math.floor(Math.random() * templates.length);
  for (let i = 0; i < templates.length; i++) {
    const candidate = templates[(start + i) % templates.length];
    if (candidate !== lastAssistantMessage) return candidate;
  }
  return templates[start];
}

/** Scans backwards through the assistant's own past replies for a mention of
 *  a real SKU from this seller — lets "onun iade oranı ne?" after "en kötü
 *  ürün hangisi?" resolve "onun" to that specific SKU instead of the seller
 *  as a whole. */
// Deliberately NOT "hangi ürün"/"ürün hangisi" — those are neutral ("which
// product") and appear equally in "en KARLI ürün hangisi" and "en KÖTÜ ürün
// hangisi"; including them here made a best-product question misresolve as
// a worst-product one whenever it happened to end in that neutral phrase.
const WORST_LEANING_KEYWORDS = [
  "en kötü", "en çok zarar", "bıraksam", "durdurmalı", "kaldırmalı", "worst product", "least profitable",
];

function focusedSkuFromHistory(history: ChatTurn[], snapshot: Snapshot): Snapshot["allSkus"][number] | null {
  // Walking the assistant's OWN reply text is ambiguous — the product answer
  // template mentions BOTH the best and the worst SKU in the same sentence,
  // so a plain substring scan picks whichever one happens to appear first in
  // `allSkus`, regardless of which one the conversation was actually about.
  // Instead, re-derive intent from the most recent USER question: if it named
  // a real SKU directly, that's the subject; if it was a best/worst product
  // question, re-run the same best-vs-worst distinction PRODUCT_KEYWORDS'
  // own answer used, so "onun" after "en kötü ürün hangisi?" resolves to the
  // worst SKU, not whichever one sorts first.
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user") continue;
    const named = snapshot.allSkus.find((s) => m.content.includes(s.sku));
    if (named) return named;
    const mq = m.content.toLowerCase();
    if (PRODUCT_KEYWORDS.some((k) => mq.includes(k)) && snapshot.allSkus.length > 0) {
      const wantsWorst = WORST_LEANING_KEYWORDS.some((k) => mq.includes(k));
      return wantsWorst ? snapshot.allSkus[snapshot.allSkus.length - 1] : snapshot.allSkus[0];
    }
  }
  return null;
}

/** A question naming a marketplace this snapshot ISN'T currently grounded in
 *  must say so plainly rather than silently answer for the wrong channel —
 *  e.g. asking about Hepsiburada while viewing Trendyol. Never fabricates a
 *  number for a channel it has no data for. The RESPONSE language follows the
 *  user's language preference, independent of which language the question
 *  itself (or the marketplace keyword) was typed in. */
function marketplaceMismatch(q: string, snapshot: Snapshot, language: Language): string | null {
  for (const [word, ch] of Object.entries(MARKETPLACE_ALIASES)) {
    if (!q.includes(word)) continue;
    if (snapshot.channel === ch) return null;
    const current = CHANNEL_DISPLAY_NAME[snapshot.channel] ?? snapshot.channel;
    const asked = CHANNEL_DISPLAY_NAME[ch] ?? word;
    return language === "tr"
      ? `Şu anda ${current} görünümündesiniz, bu veri ${asked} için değil. ` +
          `${asked} kanalına özgü bir cevap için üstteki kanal sekmesinden ${asked}'i seçip tekrar sorun — ` +
          `bağlı değilse veya veri yoksa uydurma bir sayı vermem.`
      : `You're currently viewing ${current}, and this data isn't for ${asked}. ` +
          `For an answer specific to ${asked}, switch to it from the channel tab above and ask again — ` +
          `I won't invent a number for a channel that isn't connected or has no data.`;
  }
  return null;
}

/** Deterministic, fully-grounded reply — used with no API key, or if the model call fails.
 *  Takes the full turn history (not just the latest question) so it can (a) resolve a
 *  referential follow-up to whatever SKU the previous answer was about, and (b) never
 *  paste back the exact same sentence it used last time for the same question. The
 *  RESPONSE language always follows `language` (the user's saved preference) — never
 *  the language the question happened to be typed in, and never mixed mid-answer. */
function deterministicChatAnswer(history: ChatTurn[], question: string, snapshot: Snapshot, language: Language): string {
  const q = question.toLowerCase();
  const cur = snapshot.currency;
  const d = snapshot.underwritingDecision;
  const has = (keywords: string[]) => keywords.some((k) => q.includes(k));
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content;
  const pick = (templates: string[]) => pickVariant(templates, lastAssistant);
  const isTr = language === "tr";
  // The underwriting engine's rationale is always English (lib/domain/underwriting.ts) —
  // translate it for display here rather than pasting raw English into an otherwise-Turkish
  // sentence (confirmed live: this was exactly the "mixed remnant" bug pattern from the
  // Financing tab's decision trace, and it reappears here unless localized the same way).
  const localizedRationale = translateRationale(d.rationale, language);

  if (has(OVERRIDE_KEYWORDS)) {
    return isTr
      ? `Bu kararı değiştiremem veya geçersiz kılamam — deterministik, kural-tabanlı bir model tarafından üretildi, benim tarafımdan değil. Neden bu sonuca vardığı: ${localizedRationale.join(" ")}`
      : `I can't change or override this decision — it was produced by a deterministic rule-based model, not by me. Here is why it landed where it did: ${d.rationale.join(" ")}`;
  }

  const mismatch = marketplaceMismatch(q, snapshot, language);
  if (mismatch) return mismatch;

  if (has(SCENARIO_KEYWORDS)) {
    const months = snapshot.marginHistory.length;
    if (months < LOW_SAMPLE_HISTORY_MONTHS) {
      return isTr
        ? `Güvenilir bir projeksiyon için en az ${LOW_SAMPLE_HISTORY_MONTHS} aylık gerçek sipariş geçmişi gerekiyor, şu an elimde ${months} ay var. Bu kadar az veriyle senaryo üretmiyorum — sayı uydurmak yerine daha fazla veri birikmesini bekleyin.`
        : `A reliable projection needs at least ${LOW_SAMPLE_HISTORY_MONTHS} months of real order history, and I only have ${months} right now. I won't generate a scenario off this little data — better to wait for more to accumulate than invent a number.`;
    }
    const pcts = snapshot.marginHistory.map((p) => p.trueMarginPct);
    const bestPct = Math.max(...pcts);
    const worstPct = Math.min(...pcts);
    const bestMonth = snapshot.marginHistory.find((p) => p.trueMarginPct === bestPct)!;
    const worstMonth = snapshot.marginHistory.find((p) => p.trueMarginPct === worstPct)!;
    // All three scenarios must share the SAME basis (a single projected
    // month) — mixing a per-month % against the cumulative multi-month
    // revenue would silently inflate optimistic/pessimistic relative to
    // base. d.inputs.monthlyRevenue and .trailingMonthlyContribution are the
    // engine's own average-month figures (same ones underwriting is priced
    // off), so re-using them keeps optimistic/base/pessimistic comparable.
    const monthlyRevenue = d.inputs.monthlyRevenue;
    const optimistic = money((bestPct / 100) * monthlyRevenue, cur);
    const base = money(d.inputs.trailingMonthlyContribution, cur);
    const pessimistic = money((worstPct / 100) * monthlyRevenue, cur);
    return isTr
      ? `${months} aylık gerçek geçmişinize göre (varsayım değil, kendi verinizden), önümüzdeki AY için 3 senaryo:\n` +
          `İyimser: %${round1(bestPct)} marj — ${bestMonth.label} ayınız gibi giderse aylık net katkı ${optimistic}.\n` +
          `Baz: %${round1(snapshot.margin.trueMarginPct)} marj — mevcut trend devam ederse aylık net katkı ${base}.\n` +
          `Kötümser: %${round1(worstPct)} marj — ${worstMonth.label} ayınız gibi giderse aylık net katkı ${pessimistic}.`
      : `Based on your ${months} months of real history (not an assumption, your own data), 3 scenarios for next MONTH:\n` +
          `Optimistic: ${round1(bestPct)}% margin — if it goes like your ${bestMonth.label}, monthly net contribution is ${optimistic}.\n` +
          `Base: ${round1(snapshot.margin.trueMarginPct)}% margin — if the current trend holds, monthly net contribution is ${base}.\n` +
          `Pessimistic: ${round1(worstPct)}% margin — if it goes like your ${worstMonth.label}, monthly net contribution is ${pessimistic}.`;
  }

  if (has(PRODUCT_KEYWORDS)) {
    if (snapshot.allSkus.length === 0) {
      return isTr ? `${snapshot.seller} için bu kanalda SKU verisi yok.` : `No SKU data for ${snapshot.seller} on this channel.`;
    }
    const best = snapshot.allSkus[0];
    const worst = snapshot.allSkus[snapshot.allSkus.length - 1];
    const worstNote = worst.trueMarginPct < 0
      ? (isTr ? " Gerçekte zarar ediyor — durdurmayı düşünebilirsiniz." : " It's genuinely losing money — worth considering stopping it.")
      : "";
    return isTr
      ? pick([
          `En yüksek gerçek marjlı ürün ${best.sku} (%${best.trueMarginPct}, algılanan %${best.perceivedMarginPct}). En düşük ${worst.sku} (%${worst.trueMarginPct}, algılanan %${worst.perceivedMarginPct}).${worstNote}`,
          `${snapshot.allSkus.length} SKU arasında ${worst.sku} en düşük gerçek marja sahip (%${worst.trueMarginPct}) — algılananı %${worst.perceivedMarginPct} olduğu için fark edilmesi zor.${worstNote} En iyisi ${best.sku}, %${best.trueMarginPct} gerçek marjla.`,
          `Kıyaslarsanız: ${best.sku} ile ${worst.sku} arasında ${round1(best.trueMarginPct - worst.trueMarginPct)} puanlık gerçek marj farkı var (%${best.trueMarginPct} vs %${worst.trueMarginPct}).${worstNote}`,
        ])
      : pick([
          `The highest true-margin product is ${best.sku} (${best.trueMarginPct}%, perceived ${best.perceivedMarginPct}%). The lowest is ${worst.sku} (${worst.trueMarginPct}%, perceived ${worst.perceivedMarginPct}%).${worstNote}`,
          `Among ${snapshot.allSkus.length} SKUs, ${worst.sku} has the lowest true margin (${worst.trueMarginPct}%) — hard to notice since its perceived margin is ${worst.perceivedMarginPct}%.${worstNote} The best is ${best.sku}, at ${best.trueMarginPct}% true margin.`,
          `Comparing the two: there's a ${round1(best.trueMarginPct - worst.trueMarginPct)}-point true-margin gap between ${best.sku} and ${worst.sku} (${best.trueMarginPct}% vs ${worst.trueMarginPct}%).${worstNote}`,
        ]);
  }

  if (has(RETURN_RATE_KEYWORDS)) {
    const focused = has(REFERENTIAL_WORDS) ? focusedSkuFromHistory(history, snapshot) : null;
    if (focused) {
      return isTr
        ? pick([
            `${focused.sku}'nun iade oranı %${focused.returnRatePct} — bu SKU'ya özel, seller genelinden farklı olabilir.`,
            `Az önce bahsettiğimiz ${focused.sku} için iade oranı %${focused.returnRatePct}.`,
            `${focused.sku}: %${focused.returnRatePct} iade oranı (seller geneli %${d.inputs.returnRatePct}).`,
          ])
        : pick([
            `${focused.sku}'s return rate is ${focused.returnRatePct}% — specific to this SKU, which can differ from the seller-wide figure.`,
            `For ${focused.sku}, the one we were just discussing, the return rate is ${focused.returnRatePct}%.`,
            `${focused.sku}: ${focused.returnRatePct}% return rate (seller-wide is ${d.inputs.returnRatePct}%).`,
          ]);
    }
    const rationaleIdx = d.rationale.findIndex((r) => r.toLowerCase().includes("return"));
    const rationale = isTr
      ? (rationaleIdx >= 0 ? localizedRationale[rationaleIdx] : localizedRationale.join(" "))
      : (rationaleIdx >= 0 ? d.rationale[rationaleIdx] : d.rationale.join(" "));
    return isTr
      ? pick([
          `${snapshot.seller}'ın iade oranı %${d.inputs.returnRatePct}. Bu oran underwriting kararına doğrudan yansıyor: ${rationale}`,
          `İade oranı %${d.inputs.returnRatePct} — underwriting modelinde bu şekilde fiyatlandı: ${rationale}`,
          `Genel iade oranınız %${d.inputs.returnRatePct}. Belirli bir SKU'yu mu kastediyorsunuz — "onun iade oranı" diye sorarsanız o ürüne özel rakamı verebilirim.`,
        ])
      : pick([
          `${snapshot.seller}'s return rate is ${d.inputs.returnRatePct}%. It feeds directly into the underwriting decision: ${rationale}`,
          `Return rate is ${d.inputs.returnRatePct}% — that's how the underwriting model priced it: ${rationale}`,
          `Your overall return rate is ${d.inputs.returnRatePct}%. Did you mean a specific SKU — ask "what's its return rate" and I can give you that product's own figure.`,
        ]);
  }

  if (has(SHIPPING_KEYWORDS)) {
    const pct = snapshot.margin.grossRevenue > 0 ? round1((snapshot.feeWaterfall.shipping / snapshot.margin.grossRevenue) * 100) : 0;
    return isTr
      ? pick([
          `Kargo maliyeti toplam ${money(snapshot.feeWaterfall.shipping, cur)} — brüt gelirin %${pct}'i.`,
          `Brüt gelirinizin %${pct}'i kargoya gidiyor (${money(snapshot.feeWaterfall.shipping, cur)}).`,
          `Kargo: ${money(snapshot.feeWaterfall.shipping, cur)}. Bu, ${money(snapshot.margin.grossRevenue, cur)} gelirin %${pct}'ine denk geliyor.`,
        ])
      : pick([
          `Total shipping cost is ${money(snapshot.feeWaterfall.shipping, cur)} — ${pct}% of gross revenue.`,
          `${pct}% of your gross revenue goes to shipping (${money(snapshot.feeWaterfall.shipping, cur)}).`,
          `Shipping: ${money(snapshot.feeWaterfall.shipping, cur)}. That's ${pct}% of ${money(snapshot.margin.grossRevenue, cur)} in revenue.`,
        ]);
  }

  if (has(AD_SPEND_KEYWORDS)) {
    const pct = snapshot.margin.grossRevenue > 0 ? round1((snapshot.feeWaterfall.adSpendAllocated / snapshot.margin.grossRevenue) * 100) : 0;
    return isTr
      ? pick([
          `Reklam harcaması toplam ${money(snapshot.feeWaterfall.adSpendAllocated, cur)} — brüt gelirin %${pct}'i (ACOS).`,
          `ACOS'unuz %${pct} (${money(snapshot.feeWaterfall.adSpendAllocated, cur)} reklam harcaması / ${money(snapshot.margin.grossRevenue, cur)} gelir).`,
          `Reklama ayrılan pay %${pct} — toplamda ${money(snapshot.feeWaterfall.adSpendAllocated, cur)}.`,
        ])
      : pick([
          `Total ad spend is ${money(snapshot.feeWaterfall.adSpendAllocated, cur)} — ${pct}% of gross revenue (ACOS).`,
          `Your ACOS is ${pct}% (${money(snapshot.feeWaterfall.adSpendAllocated, cur)} ad spend / ${money(snapshot.margin.grossRevenue, cur)} revenue).`,
          `Ad spend takes up ${pct}% — ${money(snapshot.feeWaterfall.adSpendAllocated, cur)} total.`,
        ]);
  }

  if (has(TENURE_KEYWORDS)) {
    return isTr
      ? pick([
          `${snapshot.seller}'ın ${d.inputs.tenureMonths} aylık gerçek sipariş geçmişi var — underwriting kararı bu süreye göre fiyatlandı.`,
          `Elimde ${d.inputs.tenureMonths} aylık gerçek veri var. ${d.inputs.tenureMonths < LOW_SAMPLE_HISTORY_MONTHS ? "Bu, güvenilir bir trend/projeksiyon için henüz yeterli değil." : "Bu, bir trend okumak için makul bir süre."}`,
          `Sipariş geçmişiniz ${d.inputs.tenureMonths} ay. Underwriting modelinin tenure girdisi bu.`,
        ])
      : pick([
          `${snapshot.seller} has ${d.inputs.tenureMonths} months of real order history — the underwriting decision was priced off that.`,
          `I have ${d.inputs.tenureMonths} months of real data. ${d.inputs.tenureMonths < LOW_SAMPLE_HISTORY_MONTHS ? "That's not yet enough for a reliable trend/projection." : "That's a reasonable span to read a trend from."}`,
          `Your order history is ${d.inputs.tenureMonths} months. That's the tenure input the underwriting model used.`,
        ]);
  }

  if (has(BACKTEST_KEYWORDS)) {
    if (!snapshot.backtestVsIncumbent) {
      return isTr ? "Bu satıcı için backtest verisi yok." : "No backtest data is available for this seller.";
    }
    const b = snapshot.backtestVsIncumbent;
    return isTr
      ? pick([
          `Bu portföyde iki modeli backtest ediyoruz: TrueMargin'in temerrüt oranı %${b.trueMarginChargeOffPct}, incumbent'ın %${b.incumbentChargeOffPct} — %${b.lossReductionVsIncumbentPct} kayıp azalması. Çünkü incumbent krediyi sadece gelire göre boyutlandırıyor ve ${snapshot.seller}'ın gerçek marjının %${snapshot.margin.trueMarginPct} olduğunu göremiyor.`,
          `Incumbent model temerrüt: %${b.incumbentChargeOffPct}. TrueMargin: %${b.trueMarginChargeOffPct}. Aradaki fark (%${b.lossReductionVsIncumbentPct} kayıp azalması) tamamen gerçek marja (%${snapshot.margin.trueMarginPct}) göre fiyatlandırmadan geliyor, sadece gelire göre değil.`,
          `Aynı satıcı, iki model: incumbent %${b.incumbentChargeOffPct} temerrüt, TrueMargin %${b.trueMarginChargeOffPct} — %${b.lossReductionVsIncumbentPct} daha iyi, çünkü incumbent'ın göremediği %${snapshot.margin.trueMarginPct} gerçek marjı görebiliyor.`,
        ])
      : pick([
          `Backtesting both models on this portfolio: TrueMargin's charge-off rate is ${b.trueMarginChargeOffPct}% vs the incumbent's ${b.incumbentChargeOffPct}%, a ${b.lossReductionVsIncumbentPct}% reduction in loss — because the incumbent sizes credit off revenue alone and can't see that ${snapshot.seller}'s true margin is ${snapshot.margin.trueMarginPct}%.`,
          `Incumbent model charge-off: ${b.incumbentChargeOffPct}%. TrueMargin: ${b.trueMarginChargeOffPct}%. The gap (${b.lossReductionVsIncumbentPct}% loss reduction) comes entirely from pricing off true margin (${snapshot.margin.trueMarginPct}%) instead of revenue alone.`,
          `Two models, same seller: incumbent ${b.incumbentChargeOffPct}% charge-off, TrueMargin ${b.trueMarginChargeOffPct}% — ${b.lossReductionVsIncumbentPct}% better, because it can see the ${snapshot.margin.trueMarginPct}% true margin the incumbent can't.`,
        ]);
  }

  if (has(LIMIT_KEYWORDS)) {
    return isTr
      ? pick([
          `${snapshot.seller} ${d.approved ? `${money(d.approvedLimit, cur)} onaylandı, take-rate %${d.takeRatePct}` : "yeni bir avans için reddedildi"}. Limit, trailing aylık katkıya (${money(d.inputs.trailingMonthlyContribution, cur)}) dayanıyor ve gelir volatilitesine göre iskonto edildi (CoV ${d.inputs.revenueVolatility}). Kural izi: ${localizedRationale.join(" ")}`,
          `${d.approved ? `Onaylandı: ${money(d.approvedLimit, cur)}, take-rate %${d.takeRatePct}.` : "Reddedildi."} Neden: ${localizedRationale.join(" ")}`,
          `Karar — ${d.approved ? `${money(d.approvedLimit, cur)} / %${d.takeRatePct}` : "reddedildi"} — trailing aylık katkıdan (${money(d.inputs.trailingMonthlyContribution, cur)}) ve bir volatilite iskontosundan (CoV ${d.inputs.revenueVolatility}) geliyor. Tam iz: ${localizedRationale.join(" ")}`,
        ])
      : pick([
          `${snapshot.seller} was ${d.approved ? `approved ${money(d.approvedLimit, cur)} at a ${d.takeRatePct}% take-rate` : "declined a new advance"}. The limit is anchored to trailing monthly contribution (${money(d.inputs.trailingMonthlyContribution, cur)}), discounted for revenue volatility (CoV ${d.inputs.revenueVolatility}). Rule trace: ${d.rationale.join(" ")}`,
          `${d.approved ? `Approved: ${money(d.approvedLimit, cur)} at ${d.takeRatePct}% take-rate.` : "Declined."} Why: ${d.rationale.join(" ")}`,
          `The decision — ${d.approved ? `${money(d.approvedLimit, cur)} / ${d.takeRatePct}%` : "declined"} — comes from trailing monthly contribution (${money(d.inputs.trailingMonthlyContribution, cur)}) and a volatility haircut (CoV ${d.inputs.revenueVolatility}). Full trace: ${d.rationale.join(" ")}`,
        ]);
  }

  if (has(MARGIN_KEYWORDS)) {
    const trendNote = snapshot.marginHistory.length >= 2
      ? (isTr
          ? ` Son ay %${snapshot.marginHistory[snapshot.marginHistory.length - 1].trueMarginPct}, bir önceki ay %${snapshot.marginHistory[snapshot.marginHistory.length - 2].trueMarginPct} idi.`
          : ` Last month was ${snapshot.marginHistory[snapshot.marginHistory.length - 1].trueMarginPct}%, the month before was ${snapshot.marginHistory[snapshot.marginHistory.length - 2].trueMarginPct}%.`)
      : "";
    return isTr
      ? pick([
          `${snapshot.seller} marjının %${snapshot.margin.sellerBelievesMarginPct} olduğunu düşünüyor, naif algılanan-marj hesabı ise %${snapshot.margin.perceivedMarginPct} gösteriyor. Tüm waterfall dağıtıldığında gerçek marj %${snapshot.margin.trueMarginPct} — ${money(snapshot.margin.grossRevenue, cur)} gelir üzerinden ${money(snapshot.margin.netContribution, cur)} net katkı.${trendNote}`,
          `Gerçek marj %${snapshot.margin.trueMarginPct} (algılanan %${snapshot.margin.perceivedMarginPct}, siz %${snapshot.margin.sellerBelievesMarginPct} sanıyordunuz) — net katkı ${money(snapshot.margin.netContribution, cur)}.${trendNote}`,
          `Break-even fiyat ${money(snapshot.margin.breakEvenPrice, cur)}. Bunun üzerinde gerçek marjınız %${snapshot.margin.trueMarginPct}, ${money(snapshot.margin.grossRevenue, cur)} gelir üzerinden ${money(snapshot.margin.netContribution, cur)} net katkı demek.${trendNote}`,
        ])
      : pick([
          `${snapshot.seller} believes their margin is ${snapshot.margin.sellerBelievesMarginPct}%, and the naive perceived-margin math shows ${snapshot.margin.perceivedMarginPct}%. Once the full waterfall is allocated, the true margin is ${snapshot.margin.trueMarginPct}% — a net contribution of ${money(snapshot.margin.netContribution, cur)} on ${money(snapshot.margin.grossRevenue, cur)} revenue.${trendNote}`,
          `True margin is ${snapshot.margin.trueMarginPct}% (perceived ${snapshot.margin.perceivedMarginPct}%, you assumed ${snapshot.margin.sellerBelievesMarginPct}%) — net contribution ${money(snapshot.margin.netContribution, cur)}.${trendNote}`,
          `Break-even price is ${money(snapshot.margin.breakEvenPrice, cur)}. Above that, your true margin is ${snapshot.margin.trueMarginPct}%, meaning ${money(snapshot.margin.netContribution, cur)} net contribution on ${money(snapshot.margin.grossRevenue, cur)} revenue.${trendNote}`,
        ]);
  }

  if (has(SILENT_LOSER_KEYWORDS)) {
    if (snapshot.silentLoserSkus.length === 0) {
      return isTr
        ? `${snapshot.seller} için bu kanalda işaretlenmiş "sessiz zarar" SKU'su yok.`
        : `No silent-loser SKUs are flagged for ${snapshot.seller} on this channel.`;
    }
    const list = snapshot.silentLoserSkus.map((s) => `${s.sku} (perceived ${s.perceivedMarginPct}% → true ${s.trueMarginPct}%)`).join(", ");
    return isTr
      ? pick([
          `${snapshot.seller}'ın ${snapshot.silentLoserSkus.length} adet "sessiz zarar" SKU'su var — kârlı görünüyor, tüm waterfall dağıtılınca aslında negatif: ${list}.`,
          `${snapshot.silentLoserSkus.length} ürün "sessiz zarar" ediyor (algılanan kâr, gerçek zarar): ${list}.`,
        ])
      : pick([
          `${snapshot.seller} has ${snapshot.silentLoserSkus.length} silent-loser SKU(s) — look profitable, are actually negative once the full waterfall lands: ${list}.`,
          `${snapshot.silentLoserSkus.length} product(s) are "silent losers" (perceived profit, real loss): ${list}.`,
        ]);
  }

  // Nothing matched. Per the same guardrail the real-model path follows ("if
  // a question cannot be answered from DATA_SNAPSHOT, say so plainly instead
  // of guessing"), never paper over an unrecognized question with the
  // decision summary as if it answered it. If the PREVIOUS user turn matched
  // a real topic, name it — a bounded, honest stand-in for "did you mean X?"
  // since this path has no real language understanding to guess further.
  const priorUserQuestion = [...history].reverse().find((m) => m.role === "user")?.content;
  const priorTopic = priorUserQuestion ? topicLabel(priorUserQuestion.toLowerCase(), language) : null;
  const menu = isTr
    ? "gerçek marj, onaylanan limit/take-rate, backtest vs. incumbent, iade oranı, kargo/reklam maliyeti, sipariş geçmişi (kaç ay), nakit akışı senaryoları, veya en karlı/en kötü ürün"
    : "true margin, approved limit/take-rate, backtest vs. incumbent, return rate, shipping/ad spend cost, order history (how many months), cash-flow scenarios, or most/least profitable product";
  if (priorTopic) {
    return isTr
      ? `Bu soruyu anlayamadım. Az önce ${priorTopic} hakkında konuşuyorduk — onu mu sürdürmek istiyorsunuz, yoksa şunlardan birini mi: ${menu}?`
      : `I couldn't understand that question. We were just talking about ${priorTopic} — do you want to continue with that, or ask about one of: ${menu}?`;
  }
  return isTr
    ? `Bu soruyu rule-based modda anlayamadım. Şunlar hakkında sorabilirsiniz: ${menu}. (AI destekli mod için ANTHROPIC_API_KEY veya GEMINI_API_KEY yapılandırılmalı.)`
    : `I couldn't understand that question in rule-based mode. You can ask about: ${menu}. (Configure ANTHROPIC_API_KEY or GEMINI_API_KEY for AI-powered mode.)`;
}

/** Best-effort label for what a past question was about — only used to phrase
 *  the "did you mean the same thing as before?" fallback, never to answer. */
function topicLabel(q: string, language: Language): string | null {
  const has = (keywords: string[]) => keywords.some((k) => q.includes(k));
  const isTr = language === "tr";
  if (has(SCENARIO_KEYWORDS)) return isTr ? "nakit akışı senaryoları" : "cash-flow scenarios";
  if (has(PRODUCT_KEYWORDS)) return isTr ? "en karlı/en kötü ürün" : "the most/least profitable product";
  if (has(RETURN_RATE_KEYWORDS)) return isTr ? "iade oranı" : "return rate";
  if (has(SHIPPING_KEYWORDS)) return isTr ? "kargo maliyeti" : "shipping cost";
  if (has(AD_SPEND_KEYWORDS)) return isTr ? "reklam harcaması" : "ad spend";
  if (has(TENURE_KEYWORDS)) return isTr ? "sipariş geçmişi" : "order history";
  if (has(BACKTEST_KEYWORDS)) return "backtest vs. incumbent";
  if (has(LIMIT_KEYWORDS)) return isTr ? "onaylanan limit/take-rate" : "the approved limit/take-rate";
  if (has(MARGIN_KEYWORDS)) return isTr ? "gerçek marj" : "true margin";
  if (has(SILENT_LOSER_KEYWORDS)) return isTr ? "sessiz zarar eden ürünler" : "silent-loser products";
  return null;
}

/** Persists one exchange (user question + assistant answer) to copilot_messages
 *  so the thread survives a reload or a sign-in on another device. Fire-and-forget
 *  via next/server's `after()` — never adds latency to the streamed response, and a
 *  failed write here must never break the panel (it already answered the user). RLS
 *  (auth.uid() = user_id) is what actually enforces this can only ever write to the
 *  signed-in user's own rows; supabase is null for demo/seed sellers (nothing to
 *  persist against), so this silently no-ops for them. */
async function persistTurn(
  supabase: SupabaseClient | null,
  userId: string | null,
  userQuestion: string,
  assistantAnswer: string,
  mode: CopilotMode
): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from("copilot_messages").insert([
      { user_id: userId, role: "user", content: userQuestion, mode: null },
      { user_id: userId, role: "assistant", content: assistantAnswer, mode },
    ]);
  } catch (err) {
    console.error("[chat] failed to persist conversation turn:", err);
  }
}

/** `after()` requires a genuine Next.js request scope — it throws when a route
 *  handler is invoked directly (e.g. unit tests calling `POST()` themselves,
 *  bypassing Next's server). Persistence is a nice-to-have, never something
 *  that may break the answer the user already received, so swallow that one
 *  specific failure mode here rather than let it propagate. */
function safeAfter(task: () => Promise<void>): void {
  try {
    after(task);
  } catch (err) {
    console.error("[chat] after() unavailable in this context, skipping persistence:", err);
  }
}

/** Client-visible marker of which path produced the answer — read by the Copilot
 *  panel to show "Rule-based response (AI not configured)" instead of silently
 *  presenting a deterministic answer as if it came from the model. */
const COPILOT_MODE_HEADER = "X-Copilot-Mode";

/** Stream plain text in small chunks so the fallback path renders identically to a real model stream. */
/** Which path produced an answer — the client shows a different badge for
 *  each so "Claude" is never shown for a Gemini-generated answer or vice versa. */
type CopilotMode = "model-claude" | "model-gemini" | "rule-based" | "model-error";

function streamPlainText(text: string, mode: CopilotMode): Response {
  const words = text.split(/(\s+)/);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of words) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((r) => setTimeout(r, 12));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", [COPILOT_MODE_HEADER]: mode },
  });
}

// "gemini-2.5-flash" (the dated model this was originally wired to) rejects
// generateContent calls from this API key with a 404 ("no longer available
// to new users") even though it still shows up in models.list — confirmed
// live. "gemini-flash-latest" is Google's own stable alias for whichever
// flash model is currently recommended, which avoids re-hardcoding a model
// slug that Google can deprecate again later.
const GEMINI_MODEL = "gemini-flash-latest";

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

/**
 * Direct REST call to Gemini's `generateContent` endpoint (Google AI Studio,
 * free tier) — no SDK dependency, since this project's only other LLM
 * integration (Claude, via @ai-sdk/anthropic) uses a different wire format
 * entirely: Gemini has no "assistant" role (it's "model"), and each turn's
 * content is `parts: [{ text }]`, not a flat string. The same
 * GUARDRAIL_SYSTEM_PROMPT + DATA_SNAPSHOT grounding is reused as-is via
 * `system_instruction` — only the transport differs.
 *
 * Non-streaming on purpose: Gemini's OWN answer only ever reaches the client
 * after this whole call has already succeeded, so a rate-limit (429), quota,
 * or network failure is caught here and turns into the same visible
 * "model-error" fallback the Claude path uses — never a half-delivered
 * answer. The full text is then handed to `streamPlainText`, so the client
 * sees the identical word-by-word delivery either way.
 */
async function callGemini(system: string, history: ChatTurn[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const contents: GeminiContent[] = history
    .filter((m) => m.content?.trim())
    .slice(-10)
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Covers rate limiting (429), quota exhaustion, and any other API-level
    // rejection — all treated identically by the caller (fall back, visibly).
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned no text content");
  return text;
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const tenantId = body.tenantId ?? "seller-b";
  const channel: Channel = body.channel ?? DEFAULT_CHANNEL;
  const language = resolveLanguage(body.language);
  const history = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMessage = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const resolved = await resolveSellerData(tenantId, channel, accessToken);
  if (!resolved) {
    return streamPlainText(
      language === "tr"
        ? "Bu satıcı/kanal kombinasyonu için veri yok."
        : "I don't have data for this seller/channel combination.",
      "rule-based"
    );
  }
  const snapshot = buildDataSnapshot(resolved.view, resolved.fin);

  const guardrail = language === "tr" ? GUARDRAIL_SYSTEM_PROMPT_TR : GUARDRAIL_SYSTEM_PROMPT_EN;
  const system = `${LANGUAGE_DIRECTIVE[language]}\n\n${guardrail}\n\nDATA_SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const modelMessages: ModelMessage[] = history
        .filter((m) => m.content?.trim())
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = streamText({
        model: anthropic("claude-opus-4-8"),
        system,
        messages: modelMessages,
        temperature: 0.2,
      });
      safeAfter(async () => {
        try {
          const fullText = await result.text;
          await persistTurn(resolved.supabase, resolved.userId, lastUserMessage, fullText, "model-claude");
        } catch {
          // Stream errored after we already committed to the "model-claude" response — nothing to persist.
        }
      });
      return result.toTextStreamResponse({ headers: { [COPILOT_MODE_HEADER]: "model-claude" } });
    } catch {
      // Never fail the panel: fall back to the grounded rule-based answer,
      // and mark it visibly (X-Copilot-Mode: model-error) — never silently.
      const answer = deterministicChatAnswer(history, lastUserMessage, snapshot, language);
      safeAfter(() => persistTurn(resolved.supabase, resolved.userId, lastUserMessage, answer, "model-error"));
      return streamPlainText(answer, "model-error");
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const fullText = await callGemini(system, history);
      safeAfter(() => persistTurn(resolved.supabase, resolved.userId, lastUserMessage, fullText, "model-gemini"));
      return streamPlainText(fullText, "model-gemini");
    } catch (err) {
      // Rate limit, quota, or network failure — fall back to the grounded
      // rule-based answer, and mark it visibly (X-Copilot-Mode: model-error)
      // so the panel shows "Rule-based (AI call failed)", never a silent swap.
      console.warn("[chat] Gemini call failed, falling back to rule-based:", err);
      const answer = deterministicChatAnswer(history, lastUserMessage, snapshot, language);
      safeAfter(() => persistTurn(resolved.supabase, resolved.userId, lastUserMessage, answer, "model-error"));
      return streamPlainText(answer, "model-error");
    }
  }

  // No LLM configured at all.
  const answer = deterministicChatAnswer(history, lastUserMessage, snapshot, language);
  safeAfter(() => persistTurn(resolved.supabase, resolved.userId, lastUserMessage, answer, "rule-based"));
  return streamPlainText(answer, "rule-based");
}
