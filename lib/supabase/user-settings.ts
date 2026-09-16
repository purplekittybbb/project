"use client";

/**
 * Haftalık kâr özeti e-postası — açık/kapalı tercihi.
 *
 * lib/i18n/useLanguage.ts ile aynı desen: gerçek kullanıcı için user_settings
 * tablosunda (RLS: auth.uid()), varsayılan false (0035 migration).
 */

import { getSupabaseClient } from "./client";

export async function loadWeeklyDigestEnabled(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data, error } = await supabase
    .from("user_settings")
    .select("weekly_digest_enabled")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { weekly_digest_enabled?: boolean }).weekly_digest_enabled);
}

export async function setWeeklyDigestEnabled(enabled: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase yapılandırılmadı." };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Oturum bulunamadı." };
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: userData.user.id, weekly_digest_enabled: enabled, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) {
    if (error.message?.toLowerCase().includes("weekly_digest_enabled")) {
      return { error: "Bu özellik henüz etkinleştirilmedi (migration bekleniyor)." };
    }
    return { error: error.message };
  }
  return { error: null };
}
