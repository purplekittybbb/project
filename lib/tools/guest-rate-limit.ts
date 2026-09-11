/**
 * Daily rate limit for standalone tools — IP (guest) or user id (signed-in).
 * Backed by Supabase `guest_tool_usage`; degrades to allow when DB unavailable.
 */

import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dailyLimitForSubject } from "./limits";
import type { StandaloneToolId } from "./registry";

export type RateLimitSubjectType = "ip" | "user";

export interface RateLimitSubject {
  type: RateLimitSubjectType;
  key: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  used: number;
  /** false when Supabase table is missing / unreachable — request was allowed anyway. */
  enforced: boolean;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Hash IP for storage — never store raw IP. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`tm-guest:${ip}`).digest("hex").slice(0, 32);
}

export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function buildRateLimitSubject(
  headers: Headers,
  userId?: string | null,
): RateLimitSubject {
  if (userId) return { type: "user", key: userId };
  return { type: "ip", key: hashIp(extractClientIp(headers)) };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check quota and increment usage atomically (best-effort upsert).
 * Exported with injectable client for tests.
 */
export async function checkAndIncrementToolUsage(
  toolId: StandaloneToolId,
  subject: RateLimitSubject,
  client?: SupabaseClient | null,
): Promise<RateLimitResult> {
  const limit = dailyLimitForSubject(subject.type);
  const supabase = client ?? serviceClient();

  if (!supabase) {
    return { allowed: true, limit, remaining: limit, used: 0, enforced: false };
  }

  const day = todayUtc();

  const { data: existing, error: readErr } = await supabase
    .from("guest_tool_usage")
    .select("usage_count")
    .eq("day", day)
    .eq("tool_id", toolId)
    .eq("subject_key", subject.key)
    .eq("subject_type", subject.type)
    .maybeSingle();

  if (readErr) {
    // Table missing or RLS — fail open so marketing tools stay usable in dev.
    return { allowed: true, limit, remaining: limit, used: 0, enforced: false };
  }

  const used = existing?.usage_count ?? 0;
  if (used >= limit) {
    return { allowed: false, limit, remaining: 0, used, enforced: true };
  }

  const nextCount = used + 1;

  const { error: writeErr } = await supabase.from("guest_tool_usage").upsert(
    {
      day,
      tool_id: toolId,
      subject_key: subject.key,
      subject_type: subject.type,
      usage_count: nextCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "day,tool_id,subject_key,subject_type" },
  );

  if (writeErr) {
    return { allowed: true, limit, remaining: Math.max(0, limit - used), used, enforced: false };
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - nextCount),
    used: nextCount,
    enforced: true,
  };
}
