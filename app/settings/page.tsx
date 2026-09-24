"use client";

/**
 * Dedicated Settings surface — profile, store APIs, billing, account deletion.
 * Complements the dashboard Settings tab with a bookmarkable /settings route.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { UpgradePlanPanel } from "@/components/billing/UpgradePlanPanel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";

type TabId = "profil" | "magaza" | "abonelik" | "sil";

type BillingStatusView = {
  paidPlan: {
    planId: "starter" | "pro";
    status: string;
    currentPeriodEnd: string | null;
    cancelledAt: string | null;
  } | null;
  subscription: {
    status: string;
    trialEnd: string | null;
    hasActiveSubscription: boolean;
  } | null;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "profil", label: "Profil Bilgileri" },
  { id: "magaza", label: "Mağaza API Bağlantıları" },
  { id: "abonelik", label: "Abonelik ve Faturalar" },
  { id: "sil", label: "Hesabımı Sil" },
];

function tabFromQuery(raw: string | null): TabId {
  if (raw === "profil" || raw === "magaza" || raw === "abonelik" || raw === "sil") return raw;
  return "profil";
}

function SettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => tabFromQuery(searchParams.get("tab")));
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [billing, setBilling] = useState<BillingStatusView | null>(null);
  const [billingError, setBillingError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setTab(tabFromQuery(searchParams.get("tab")));
  }, [searchParams]);

  function selectTab(id: TabId) {
    setTab(id);
    const q = new URLSearchParams(searchParams.toString());
    q.set("tab", id);
    router.replace(`/settings?${q.toString()}`, { scroll: false });
  }

  const loadBilling = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/billing/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBillingError(body.error ?? "Abonelik bilgisi yüklenemedi.");
        return;
      }
      setBillingError("");
      setBilling(body as BillingStatusView);
    } catch {
      setBillingError("Abonelik bilgisi yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      setCompany(
        typeof data.user.user_metadata?.company === "string"
          ? data.user.user_metadata.company
          : "",
      );
    });
    void loadBilling();
  }, [loadBilling]);

  async function saveProfile() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.updateUser({ data: { company: company.trim() } });
  }

  async function deleteAccount() {
    setDeleteError("");
    if (deleteConfirm.trim().toUpperCase() !== "SIL") {
      setDeleteError("Onay için SIL yazın.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setDeleteBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setDeleteError("Oturum bulunamadı.");
        return;
      }
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "SIL" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(body.error ?? "Hesap silinemedi.");
        return;
      }
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch {
      setDeleteError("Bağlantı hatası.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <Link href="/dashboard" className="font-heading font-bold text-foreground">
          TrueMargin
        </Link>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Panele dön
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="font-heading text-2xl font-semibold text-foreground mb-2">Ayarlar</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Profil, mağaza bağlantıları, abonelik ve hesap silme.
        </p>

        <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-[var(--tm-r-data)] ${
                tab === t.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "profil" && (
          <section className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-1.5">E-posta</label>
              <input
                value={email}
                readOnly
                className="w-full border border-input bg-muted px-3 py-2.5 text-sm rounded-[var(--tm-r-data)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Şirket / mağaza</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full border border-input bg-card px-3 py-2.5 text-sm rounded-[var(--tm-r-data)]"
              />
            </div>
            <TrustSubmitButton type="button" onClick={() => void saveProfile()}>
              Kaydet
            </TrustSubmitButton>
          </section>
        )}

        {tab === "magaza" && (
          <section className="space-y-4 border border-border rounded-[var(--tm-r-ui)] p-6">
            <h2 className="font-heading text-lg font-semibold">Mağaza API bağlantıları</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Trendyol, Hepsiburada, N11 ve Shopify anahtarlarını bağlamak veya yenilemek için
              bağlantı sihirbazını kullanın. Canlı durum ve &quot;Yenile&quot; paneli Ayarlar
              sekmesinde de vardır.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/connect"
                className="tm-btn-primary inline-flex h-10 items-center px-5 text-sm font-semibold"
              >
                Mağaza bağla
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center px-5 text-sm border border-border rounded-[var(--tm-r-data)]"
              >
                Panelde yönet
              </Link>
            </div>
          </section>
        )}

        {tab === "abonelik" && (
          <section className="space-y-4">
            {billingError && <p className="text-sm fin-loss">{billingError}</p>}
            {billing?.subscription && (
              <p className="text-sm text-muted-foreground font-mono">
                Stripe/demo: {billing.subscription.status}
                {billing.subscription.trialEnd
                  ? ` · deneme bitiş ${new Date(billing.subscription.trialEnd).toLocaleDateString("tr-TR")}`
                  : ""}
              </p>
            )}
            <UpgradePlanPanel paidPlan={billing?.paidPlan ?? null} onChanged={loadBilling} />
          </section>
        )}

        {tab === "sil" && (
          <section className="max-w-md space-y-4 border border-[color-mix(in_srgb,var(--tm-alert-clay)_40%,transparent)] rounded-[var(--tm-r-ui)] p-6">
            <h2 className="font-heading text-lg font-semibold text-foreground">Hesabımı sil</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              KVKK/GDPR kapsamında tüm satış verileriniz, bağlantılarınız ve abonelik
              kayıtlarınız kalıcı olarak silinir. Bu işlem geri alınamaz.
            </p>
            <label className="block text-sm font-medium">
              Onay için <span className="font-mono">SIL</span> yazın
            </label>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full border border-input bg-card px-3 py-2.5 text-sm rounded-[var(--tm-r-data)] font-mono"
              placeholder="SIL"
            />
            {deleteError && <p className="text-sm fin-loss">{deleteError}</p>}
            <TrustSubmitButton
              type="button"
              disabled={deleteBusy}
              onClick={() => void deleteAccount()}
              seal="Kalıcı silme · geri alınamaz"
            >
              {deleteBusy ? "Siliniyor…" : "Hesabı kalıcı olarak sil"}
            </TrustSubmitButton>
          </section>
        )}
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <SettingsInner />
      </Suspense>
    </AuthGuard>
  );
}
