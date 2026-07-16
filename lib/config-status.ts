import { isStripeLiveEnabled } from "./billing/is-stripe-live-enabled";
import { isShopifyLiveEnabled } from "./shopify-api/live";

/**
 * Single source of truth for "is this deployment configured?" — reports the
 * PRESENCE (never the value) of every environment-dependent subsystem.
 *
 * This exists because misconfigured production environments were, repeatedly,
 * the hardest class of failure to diagnose in this project: a missing Vercel
 * env var (CREDENTIALS_ENCRYPTION_KEY, SHOPIFY_CLIENT_ID, the Supabase keys)
 * surfaces only as an opaque runtime error deep inside a request, with nothing
 * pointing at the actual cause. /api/health consumes this to give one clear,
 * safe answer to "did prod get configured correctly?" without ever exposing a
 * secret — every field below is a boolean, derived from `.trim()` presence, so
 * the response can be read by anyone without leaking anything sensitive.
 */

function present(v: string | undefined): boolean {
  return !!v && v.trim().length > 0;
}

export interface SubsystemStatus {
  /** Core data layer — the app cannot function at all without this. */
  supabase: boolean;
  /** Service-role key, needed only by the CRON_SECRET-gated background jobs. */
  supabaseServiceRole: boolean;
  /** Encrypts marketplace API credentials at rest — required for any real
   *  (non-demo) marketplace connection to store its credentials. */
  credentialsEncryptionKey: boolean;
  /** Protects the background cron endpoints. */
  cronSecret: boolean;
  /** Live Stripe billing (else the app falls back to the honest demo trial). */
  stripe: boolean;
  /** Live Shopify Partner OAuth (else /connect falls back to the labelled demo). */
  shopify: boolean;
  /** At least one LLM backend for the Copilot (else it uses the rule-based path). */
  ai: boolean;
}

export interface ConfigStatus {
  /** True iff every CRITICAL subsystem the app cannot run without is present.
   *  Optional/degradable subsystems (Stripe, Shopify, AI) do NOT gate this —
   *  each has a documented, honest fallback when unconfigured. */
  ready: boolean;
  subsystems: SubsystemStatus;
  /** Names of critical subsystems that are missing — empty when ready. */
  missingCritical: string[];
}

export function getConfigStatus(): ConfigStatus {
  const subsystems: SubsystemStatus = {
    supabase:
      present(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRole: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    credentialsEncryptionKey: present(process.env.CREDENTIALS_ENCRYPTION_KEY),
    cronSecret: present(process.env.CRON_SECRET),
    stripe: isStripeLiveEnabled(),
    shopify: isShopifyLiveEnabled(),
    ai: present(process.env.ANTHROPIC_API_KEY) || present(process.env.GEMINI_API_KEY),
  };

  // Only Supabase is truly non-negotiable — every other subsystem degrades to
  // a documented, honest fallback (demo billing, demo/labelled Shopify connect,
  // rule-based Copilot, no background jobs). credentialsEncryptionKey is
  // "critical" only in that a real marketplace connect will fail without it,
  // but the app still boots and demo flows work — kept OUT of the readiness
  // gate so a Shopify-only deployment isn't reported as fully down, but
  // surfaced explicitly in the response so it's never silently missing.
  const missingCritical: string[] = [];
  if (!subsystems.supabase) missingCritical.push("supabase");

  return {
    ready: missingCritical.length === 0,
    subsystems,
    missingCritical,
  };
}
