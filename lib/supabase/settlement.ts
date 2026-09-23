/**
 * Hakediş Mutabakatı — gerçek, kullanıcının kendi girdiği hakediş tutarları.
 *
 * Bkz. supabase/migrations/0034_settlement_payouts.sql. Bu tablo, hiçbir
 * pazaryeri adaptörünün otomatik çekmediği "gerçekte ne kadar ödendi"
 * bilgisini kullanıcıdan alır; engine.ts'teki modellenmiş ("Temsili")
 * hakediş tahmininin yerini GERÇEK bir mutabakatla değiştirmek için kullanılır.
 */

import { getSupabaseClient } from "./client";

export interface SettlementPayout {
  marketplace: string;
  periodLabel: string; // "YYYY-MM"
  actualAmount: number;
  currency: string;
  note: string | null;
  updatedAt: string;
}

type DbRow = {
  marketplace: string;
  period_label: string;
  actual_amount: number;
  currency: string;
  note: string | null;
  updated_at: string;
};

function toPayout(r: DbRow): SettlementPayout {
  return {
    marketplace: r.marketplace,
    periodLabel: r.period_label,
    actualAmount: Number(r.actual_amount),
    currency: r.currency,
    note: r.note,
    updatedAt: r.updated_at,
  };
}

/** Signed-in kullanıcının şimdiye kadar girdiği tüm hakediş kayıtları. */
export async function loadAllSettlementPayouts(): Promise<SettlementPayout[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("settlement_payouts")
    .select("marketplace, period_label, actual_amount, currency, note, updated_at")
    .order("period_label", { ascending: false });
  if (error || !data) return [];
  return (data as DbRow[]).map(toPayout);
}

/** Load payouts with explicit error (prefer over loadAllSettlementPayouts for UI). */
export async function loadAllSettlementPayoutsWithStatus(): Promise<{
  payouts: SettlementPayout[];
  error: string | null;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) return { payouts: [], error: null };
  const { data, error } = await supabase
    .from("settlement_payouts")
    .select("marketplace, period_label, actual_amount, currency, note, updated_at")
    .order("period_label", { ascending: false });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { payouts: [], error: null };
    }
    return { payouts: [], error: error.message };
  }
  return { payouts: ((data ?? []) as DbRow[]).map(toPayout), error: null };
}

/** Bir dönem için gerçek hakediş tutarını kaydeder/günceller (upsert). */
export async function saveSettlementPayout(
  marketplace: string,
  periodLabel: string,
  actualAmount: number,
  currency: string,
  note?: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase yapılandırılmadı." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: "Oturum bulunamadı." };

  const { error } = await supabase.from("settlement_payouts").upsert(
    {
      user_id: userId,
      marketplace,
      period_label: periodLabel,
      actual_amount: actualAmount,
      currency,
      note: note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace,period_label" }
  );
  if (error) {
    // 0034 migration henüz uygulanmadıysa tablo yoktur — kullanıcıya anlamlı bir hata ver.
    if (error.message?.toLowerCase().includes("settlement_payouts")) {
      return { error: "Hakediş mutabakatı özelliği henüz etkinleştirilmedi." };
    }
    return { error: error.message };
  }
  return { error: null };
}

/** "YYYY-MM" biçiminde şu anki dönem etiketi. */
export function currentPeriodLabel(): string {
  return new Date().toISOString().slice(0, 7);
}
