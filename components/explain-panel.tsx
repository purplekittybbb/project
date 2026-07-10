"use client";

/**
 * Decision-trace panel — "Why this limit?"
 *
 * Slides in from the right, sends the seller's structured UnderwritingDecision plus
 * the user's question to /api/explain, and renders the grounded answer. The endpoint
 * only ever reasons over the provided data, so the panel cannot show invented numbers.
 */

import { useState } from "react";
import type { UnderwritingDecision } from "@/lib/engine";

const PRESETS = [
  "Why did this seller get this limit?",
  "Why this take-rate?",
  "What would raise the limit?",
];

export function ExplainPanel({
  open,
  onClose,
  decision,
  sellerLabel,
}: {
  open: boolean;
  onClose: () => void;
  decision: UnderwritingDecision;
  sellerLabel: string;
}) {
  const [question, setQuestion] = useState(PRESETS[0]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(q: string) {
    setQuestion(q);
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, sellerLabel, question: q }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? data.error ?? "No answer.");
      setSource(data.source ?? null);
    } catch {
      setAnswer("Could not reach the explainer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* scrim */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={
          "fixed inset-0 z-40 bg-ink/20 transition-opacity " +
          (open ? "opacity-100" : "pointer-events-none opacity-0")
        }
        style={{ background: open ? "rgba(15,20,23,0.20)" : "transparent" }}
      />
      {/* panel */}
      <aside
        role="dialog"
        aria-label="Decision trace"
        className={
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card transition-transform duration-300 " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Decision trace</div>
            <div className="font-heading text-lg font-bold">{sellerLabel}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border px-6 py-4">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => ask(p)}
              className={
                "rounded-full border px-3 py-1 text-xs transition-colors " +
                (question === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted")
              }
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {loading && <p className="text-sm text-muted-foreground">Reading the decision data…</p>}
          {!loading && answer && (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-foreground">{answer}</p>
              {source && (
                <p className="text-xs text-muted-foreground">
                  Grounded in the seller’s structured decision — {source}. No numbers invented.
                </p>
              )}
            </div>
          )}
          {!loading && !answer && (
            <p className="text-sm text-muted-foreground">Pick a question to see the grounded explanation.</p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) ask(question.trim());
          }}
          className="border-t border-border px-6 py-4"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this decision…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary"
          />
        </form>
      </aside>
    </>
  );
}
