import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type ModelMessage } from "ai";
import { getFinancing, getSeller, type Channel } from "@/lib/engine";

/**
 * Analyst Copilot — real multi-turn chat, grounded ONLY in the engine's own output.
 *
 * The client never supplies the seller's numbers; it only sends `tenantId` + `channel`
 * + the conversation so far. This route re-derives the data snapshot straight from
 * lib/engine (margin, fee waterfall, the rule-based underwriting decision, and the
 * true-margin-vs-incumbent backtest) and embeds it in the system prompt. The model is
 * instructed to explain that snapshot only — never invent numbers, never issue or
 * revise a lending decision. If ANTHROPIC_API_KEY is not set, a deterministic
 * rule-based answer is streamed instead, so the panel always works and never
 * hallucinates.
 */

export const runtime = "nodejs";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatTurn[];
  tenantId?: string;
  channel?: Channel;
}

const GUARDRAIL_SYSTEM_PROMPT = `You are the Analyst Copilot embedded in TrueMargin's underwriting dashboard. You help an underwriter understand ONE seller's real margin and the credit decision already made about them.

STRICT RULES — follow all of them:
1. Use ONLY the facts inside DATA_SNAPSHOT below. Never invent, estimate, round-trip, or guess a number that is not present in it.
2. You do NOT make, approve, revise, or override underwriting decisions. The approved limit and take-rate were already produced by a deterministic rule-based model (see underwritingDecision.rationale). Your only job is to explain, in plain language, why that model produced this result.
3. If the user asks you to raise a limit, waive risk, approve more capital, or change the decision, politely decline in one sentence and explain you can only interpret the existing decision trace — then still answer the underlying question using the data if there is one.
4. If a question cannot be answered from DATA_SNAPSHOT, say so plainly instead of guessing.
5. When relevant, cite the specific fields that drove the answer (true margin %, take-rate, return rate, tenure, stock velocity, revenue volatility, charge-off rates).
6. Be concise: 2-5 sentences, no preamble, no markdown headers, active voice.`;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Rebuild the grounded data snapshot for one seller straight from the engine — never trust client-sent numbers. */
function buildDataSnapshot(tenantId: string, channel: Channel) {
  const view = getSeller(tenantId, channel) ?? getSeller(tenantId, "trendyol");
  if (!view) return null;
  const fin = getFinancing(tenantId);
  const d = view.decision;

  return {
    seller: view.label,
    channel,
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

/** Deterministic, fully-grounded reply — used with no API key, or if the model call fails. */
function deterministicChatAnswer(question: string, snapshot: NonNullable<ReturnType<typeof buildDataSnapshot>>): string {
  const q = question.toLowerCase();
  const cur = snapshot.currency;
  const d = snapshot.underwritingDecision;

  if (OVERRIDE_KEYWORDS.some((k) => q.includes(k))) {
    return (
      `I can't change or override this decision — it was produced by a deterministic rule-based model, not by me. ` +
      `Here is why it landed where it did: ${d.rationale.join(" ")}`
    );
  }

  if (q.includes("backtest") || q.includes("incumbent")) {
    if (!snapshot.backtestVsIncumbent) return "No backtest data is available for this seller.";
    const b = snapshot.backtestVsIncumbent;
    return (
      `Backtesting both models on this portfolio: TrueMargin's charge-off rate is ${b.trueMarginChargeOffPct}% vs the incumbent's ${b.incumbentChargeOffPct}%, ` +
      `a ${b.lossReductionVsIncumbentPct}% reduction in loss — because the incumbent sizes credit off revenue alone and can't see that ${snapshot.seller}'s true margin is ${snapshot.margin.trueMarginPct}%.`
    );
  }

  if (q.includes("limit") || q.includes("take-rate") || q.includes("take rate") || q.includes("approv")) {
    return (
      `${snapshot.seller} was ${d.approved ? `approved ${money(d.approvedLimit, cur)} at a ${d.takeRatePct}% take-rate` : "declined a new advance"}. ` +
      `The limit is anchored to trailing monthly contribution (${money(d.inputs.trailingMonthlyContribution, cur)}), discounted for revenue volatility (CoV ${d.inputs.revenueVolatility}). ` +
      `Rule trace: ${d.rationale.join(" ")}`
    );
  }

  if (q.includes("margin") || q.includes("marj") || q.includes("waterfall") || q.includes("fee")) {
    return (
      `${snapshot.seller} believes their margin is ${snapshot.margin.sellerBelievesMarginPct}%, and the naive perceived-margin math (revenue − COGS − commission) shows ${snapshot.margin.perceivedMarginPct}%. ` +
      `Once the full waterfall is allocated (VAT, shipping, returns, ad spend, payment fees), the true margin is ${snapshot.margin.trueMarginPct}% — a net contribution of ${money(snapshot.margin.netContribution, cur)} on ${money(snapshot.margin.grossRevenue, cur)} revenue. ` +
      `Break-even price (COGS + shipping + payment fees, grossed up for commission) is ${money(snapshot.margin.breakEvenPrice, cur)}.`
    );
  }

  if (q.includes("silent") || q.includes("sku")) {
    if (snapshot.silentLoserSkus.length === 0) return `No silent-loser SKUs are flagged for ${snapshot.seller} on this channel.`;
    const list = snapshot.silentLoserSkus.map((s) => `${s.sku} (perceived ${s.perceivedMarginPct}% → true ${s.trueMarginPct}%)`).join(", ");
    return `${snapshot.seller} has ${snapshot.silentLoserSkus.length} silent-loser SKU(s) — look profitable, are actually negative once the full waterfall lands: ${list}.`;
  }

  return (
    `${snapshot.seller}'s true margin is ${snapshot.margin.trueMarginPct}% (they believe ${snapshot.margin.sellerBelievesMarginPct}%). ` +
    `Based on that, they were ${d.approved ? `approved ${money(d.approvedLimit, cur)} at a ${d.takeRatePct}% take-rate` : "declined"}. ` +
    `Rule trace: ${d.rationale.join(" ")}`
  );
}

/** Stream plain text in small chunks so the fallback path renders identically to a real model stream. */
function streamPlainText(text: string): Response {
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
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const tenantId = body.tenantId ?? "seller-b";
  const channel: Channel = body.channel ?? "trendyol";
  const history = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMessage = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  const snapshot = buildDataSnapshot(tenantId, channel);
  if (!snapshot) {
    return streamPlainText("I don't have data for this seller/channel combination.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return streamPlainText(deterministicChatAnswer(lastUserMessage, snapshot));
  }

  try {
    const system = `${GUARDRAIL_SYSTEM_PROMPT}\n\nDATA_SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`;
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
    return result.toTextStreamResponse();
  } catch {
    // Never fail the panel: fall back to the grounded rule-based answer.
    return streamPlainText(deterministicChatAnswer(lastUserMessage, snapshot));
  }
}
