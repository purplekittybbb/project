import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/copilot/history
 *
 * The signed-in user's own copilot_messages rows (RLS-scoped), oldest first —
 * backs the Copilot tab's conversation thread so it survives a page reload or
 * a fresh sign-in on another device, instead of vanishing with React state.
 */

export const runtime = "nodejs";

const HISTORY_LIMIT = 50;

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface DbMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: string | null;
  created_at: string;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ messages: [] });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ messages: [] });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ messages: [] });
  }

  const { data, error } = await supabase
    .from("copilot_messages")
    .select("id, role, content, mode, created_at")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error || !data) {
    return NextResponse.json({ messages: [] });
  }

  const messages = (data as DbMessageRow[])
    .slice()
    .reverse() // came back newest-first (for LIMIT to keep the most recent); render oldest-first
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      mode: row.mode as "model-claude" | "model-gemini" | "rule-based" | "model-error" | null,
      createdAt: row.created_at,
    }));

  return NextResponse.json({ messages });
}
