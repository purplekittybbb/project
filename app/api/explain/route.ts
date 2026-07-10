import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { UnderwritingDecision } from "@/lib/engine";

/**
 * Decision-trace explainer — the defensible, un-copyable artifact.
 *
 * It explains an underwriting decision ONLY from the structured data it is given
 * (the decision's own inputs, outputs and rule-based rationale). It never invents
 * numbers. If ANTHROPIC_API_KEY is set it uses Claude (claude-opus-4-8) to phrase
 * the grounded answer; otherwise it composes the answer deterministically from the
 * same rationale, so the demo works with no key and can never hallucinate.
 */

interface ExplainRequest {
  decision: UnderwritingDecision;
  sellerLabel?: string;
  question: string;
}

const SYSTEM_PROMPT = `You explain marketplace underwriting decisions ONLY using the structured data provided (inputs_snapshot, the limit and take-rate output, and the rule-based rationale array). Never invent numbers or reasons that are not in the data. If the data does not support an answer, say so plainly. Cite the specific inputs (true margin, stock velocity, revenue volatility, return rate, tenure) that drove the decision. Be concise: 3-5 sentences, no preamble, active voice.`;

function money(n: number, currency: string) {
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
  return currency === "USD" ? `$${s}` : `₺${s}`;
}

/** Deterministic, fully-grounded explanation built from the decision itself. */
function deterministicExplain(d: UnderwritingDecision, label: string): string {
  const i = d.inputs;
  const approved = d.approvedLimit > 0;
  const lines: string[] = [];
  if (approved) {
    lines.push(
      `${label} was approved ${money(d.approvedLimit, d.currency)} at a ${(d.takeRate * 100).toFixed(1)}% take-rate.`
    );
  } else {
    lines.push(`${label} was declined a new advance (${money(0, d.currency)}).`);
  }
  lines.push(
    `The limit is anchored to real contribution profit (true margin ${i.trueMarginPct.toFixed(
      1
    )}%, trailing monthly contribution ${money(i.trailingMonthlyContribution, d.currency)}), then discounted for revenue volatility (CoV ${i.revenueVolatility.toFixed(
      2
    )}).`
  );
  lines.push(
    `Price reflects risk: return rate ${(i.returnRate * 100).toFixed(0)}%, tenure ${i.tenureMonths} months, stock velocity ${Math.round(
      i.stockVelocity
    )} units/mo.`
  );
  lines.push(`Rule trace: ${d.rationale.join(" ")}`);
  return lines.join(" ");
}

export async function POST(req: Request) {
  let body: ExplainRequest;
  try {
    body = (await req.json()) as ExplainRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { decision, question } = body;
  if (!decision || !decision.inputs) {
    return NextResponse.json({ error: "Missing decision." }, { status: 400 });
  }
  const label = body.sellerLabel ?? decision.tenantId;

  // No key: deterministic grounded answer (safe default; never hallucinates).
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ answer: deterministicExplain(decision, label), grounded: true, source: "rule-based" });
  }

  // Key present: let Claude phrase the answer, strictly over the provided data.
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Seller: ${label}\nDecision data:\n${JSON.stringify(
            { inputs: decision.inputs, approvedLimit: decision.approvedLimit, takeRate: decision.takeRate, currency: decision.currency, rationale: decision.rationale },
            null,
            2
          )}\n\nQuestion: ${question}`,
        },
      ],
    });
    const answer = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ answer: answer || deterministicExplain(decision, label), grounded: true, source: "claude-opus-4-8" });
  } catch (err) {
    // Never fail the demo: fall back to the grounded rule-based answer.
    return NextResponse.json({
      answer: deterministicExplain(decision, label),
      grounded: true,
      source: "rule-based-fallback",
    });
  }
}
