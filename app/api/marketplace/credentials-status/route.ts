import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/marketplace/credentials-status
 *
 * Server truth for which marketplaces this signed-in user has real
 * (encrypted) credentials for — plus last sync outcome so the UI can show
 * "last synced …" / "reconnect required" without trusting localStorage.
 *
 * Response shape (backward-compatible):
 *   {
 *     marketplaces: string[],          // legacy — still returned
 *     connections: CredentialStatus[]  // richer — prefer this
 *   }
 */

export const runtime = "nodejs";

export interface CredentialStatus {
  marketplace: string;
  sellerId: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  needsReauth: boolean;
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

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ marketplaces: [], connections: [] });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ marketplaces: [], connections: [] });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ marketplaces: [], connections: [] });
  }

  // Prefer the full sync-status select; if migration 0011 isn't applied yet,
  // fall back to the original marketplace-only select so this route never
  // hard-fails a working connect UI over optional columns.
  const full = await supabase
    .from("marketplace_credentials")
    .select("marketplace, seller_id, created_at, last_synced_at, last_sync_error, needs_reauth")
    .eq("user_id", userData.user.id);

  if (!full.error && full.data) {
    const connections: CredentialStatus[] = (
      full.data as {
        marketplace: string;
        seller_id: string;
        created_at: string;
        last_synced_at: string | null;
        last_sync_error: string | null;
        needs_reauth: boolean | null;
      }[]
    ).map((r) => ({
      marketplace: r.marketplace,
      sellerId: r.seller_id,
      connectedAt: r.created_at,
      lastSyncedAt: r.last_synced_at,
      lastSyncError: r.last_sync_error,
      needsReauth: !!r.needs_reauth,
    }));
    return NextResponse.json({
      marketplaces: connections.map((c) => c.marketplace),
      connections,
    });
  }

  const legacy = await supabase
    .from("marketplace_credentials")
    .select("marketplace, seller_id, created_at")
    .eq("user_id", userData.user.id);
  if (legacy.error || !legacy.data) {
    return NextResponse.json({ marketplaces: [], connections: [] });
  }

  const connections: CredentialStatus[] = (
    legacy.data as { marketplace: string; seller_id: string; created_at: string }[]
  ).map((r) => ({
    marketplace: r.marketplace,
    sellerId: r.seller_id,
    connectedAt: r.created_at,
    lastSyncedAt: null,
    lastSyncError: null,
    needsReauth: false,
  }));

  return NextResponse.json({
    marketplaces: connections.map((c) => c.marketplace),
    connections,
  });
}
