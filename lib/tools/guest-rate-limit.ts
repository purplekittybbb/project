/**
 * Daily rate limit for standalone tools — IP (guest) or user id (signed-in).
 * Backed by Supabase `guest_tool_usage`; degrades to allow when DB unavailable.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
  return createServiceRoleClient();
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
 * Check quota and increment usage atomically via RPC when available.
 * Falls back to read+upsert if migration 0041 is not applied yet.
 */
export async function checkAndIncrementToolUsage(
  toolId: StandaloneToolId,
  subject: RateLimitSubject,
  client?: SupabaseClient | null,
  isPaid = false,
): Promise<RateLimitResult> {
  const limit = dailyLimitForSubject(subject.type, isPaid);
  const supabase = client ?? serviceClient();

  if (!supabase) {
    return { allowed: true, limit, remaining: limit, used: 0, enforced: false };
  }

  const day = todayUtc();

  const { data: rpcRows, error: rpcErr } = await supabase.rpc("increment_guest_tool_usage", {
    p_day: day,
    p_tool_id: toolId,
    p_subject_key: subject.key,
    p_subject_type: subject.type,
    p_limit: limit,
  });

  if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
    const row = rpcRows[0] as { allowed?: boolean; usage_count?: number };
    const used = Number(row.usage_count ?? 0);
    const allowed = Boolean(row.allowed);
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - used),
      used,
      enforced: true,
    };
  }

  // RPC missing / unavailable — legacy non-atomic path (dev before 0041).
  const { data: existing, error: readErr } = await supabase
    .from("guest_tool_usage")
    .select("usage_count")
    .eq("day", day)
    .eq("tool_id", toolId)
    .eq("subject_key", subject.key)
    .eq("subject_type", subject.type)
    .maybeSingle();

  if (readErr) {
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

/**
 * Best-effort refund of one quota unit after an unusable live scrape
 * (empty prices / blocked / error). Never throws; never goes below zero.
 */
export async function refundToolUsage(
  toolId: StandaloneToolId,
  subject: RateLimitSubject,
  client?: SupabaseClient | null,
): Promise<void> {
  const supabase = client ?? serviceClient();
  if (!supabase) return;

  const day = todayUtc();
  const { data: existing, error: readErr } = await supabase
    .from("guest_tool_usage")
    .select("usage_count")
    .eq("day", day)
    .eq("tool_id", toolId)
    .eq("subject_key", subject.key)
    .eq("subject_type", subject.type)
    .maybeSingle();

  if (readErr || !existing) return;

  const used = Number(existing.usage_count ?? 0);
  if (used <= 0) return;

  await supabase.from("guest_tool_usage").upsert(
    {
      day,
      tool_id: toolId,
      subject_key: subject.key,
      subject_type: subject.type,
      usage_count: used - 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "day,tool_id,subject_key,subject_type" },
  );
}

/**
 * Idempotent refund keyed by (toolId, refundKey) — e.g. BullMQ jobId.
 * Uses Redis SET NX when available; falls back to always-refund if Redis is down
 * (rare; better to over-refund than strand the guest).
 * Returns whether a refund was actually applied this call.
 */
export async function refundToolUsageOnce(
  toolId: StandaloneToolId,
  subject: RateLimitSubject,
  refundKey: string,
  client?: SupabaseClient | null,
): Promise<boolean> {
  const key = refundKey.trim();
  if (!key) {
    await refundToolUsage(toolId, subject, client);
    return true;
  }

  try {
    const { createRedisConnection } = await import("@/lib/queue");
    const redis = createRedisConnection();
    if (redis) {
      const ok = await redis.set(`tm:quota-refund:${toolId}:${key}`, "1", "EX", 86_400, "NX");
      await redis.quit().catch(() => undefined);
      if (ok !== "OK") return false;
    }
  } catch {
    // Redis unavailable — proceed with refund (prefer guest honesty).
  }

  await refundToolUsage(toolId, subject, client);
  return true;
}
