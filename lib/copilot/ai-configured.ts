/**
 * Single gate: real LLM-backed Copilot answers (Claude if ANTHROPIC_API_KEY
 * is set, else Gemini if GEMINI_API_KEY is set) vs. the deterministic
 * rule-based fallback in app/api/chat/route.ts.
 *
 * Server code can read these env vars directly. Client components cannot (no
 * NEXT_PUBLIC_ prefix — the secrets stay server-only). next.config.mjs
 * mirrors presence as AI_CONFIGURED so this same function works in both, and
 * the Copilot tab can show "Rule-based response (AI not configured)" instead
 * of silently presenting a scripted answer as if it came from the model.
 */
export function isAiConfigured(): boolean {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return true;
  if (process.env.GEMINI_API_KEY?.trim()) return true;
  return process.env.AI_CONFIGURED === "1";
}
