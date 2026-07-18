"use client";

/**
 * AUTHENTICATED DASHBOARD (/dashboard)
 *
 * ⚠️  CRITICAL: This file renders ONLY the authenticated user dashboard.
 * Login is REQUIRED. Only real user data is shown (never seed data).
 *
 * Route contract:
 * - /dashboard requires valid auth session (AuthGuard enforces)
 * - Shows ONLY signed-in user's data (tenantId = USER_TENANT_ID)
 * - demoMode=false means Supabase is checked, user data is loaded
 * - If user has no data yet, redirected to /connect (onboarding)
 * - Seed sellers A/B/C are NEVER shown here
 *
 * Separate routes (do NOT mix):
 * - / → landing page (public, marketing)
 * - /demo → seed-data walkthrough (public, no login)
 * - /connect → post-signup onboarding (auth required, no data yet)
 *
 * DASHBOARD — the Mercury-style panel the landing's "See demo" opens.
 *
 * Design by Gemini, kept verbatim in look; every figure is now wired to the real
 * engine through lib/engine (no placeholder data):
 *  - seller switcher → getSellers / getSeller (Seller A/B/C from lib/data/seed)
 *  - real margin + fee waterfall → the aggregated FeeWaterfall for the seller
 *  - ad-spend slider → recomputeMargin (re-runs aggregateTrueMargin live)
 *  - SKU table → perSkuMargins (silent-loss flags are real)
 *  - underwriting + backtest → getFinancing (trueMarginModel vs incumbent)
 *  - Analyst Copilot → its own sidebar tab, streaming from /api/chat (grounded in lib/engine)
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n/config";
import { translateRationale, translateBenchmarkLabel } from "@/lib/i18n/translateRationale";
import {
  ChevronDown, Sparkles, ArrowUpRight,
  LayoutDashboard, Users, Briefcase, History as HistoryIcon, Settings, Package, Tag, Landmark, Database,
} from "lucide-react";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";
import {
  loadUserRows, saveUserRows, deleteUserRow, clearUserRows, buildUserSeller,
  USER_TENANT_ID, type StoredRow,
} from "@/lib/supabase/user-data";
import type { UserRawRow } from "@/lib/adapters/csv";
import { MyDataPanel } from "@/components/MyDataPanel";
import {
  getSellers, getSeller, getFinancing, recomputeMargin, getBacktest, getBenchmarkRows, getPortfolioMetrics,
  registerRuntimeSeller, clearRuntimeSellers, hasRuntimeSeller, getSilentLoserInsight, getSellerChannels,
  MARKETPLACE_LABELS, LOW_SAMPLE_HISTORY_MONTHS, type Channel,
} from "@/lib/engine";
import { CampaignSimulator } from "@/components/CampaignSimulator";
import { CashFlowPanel } from "@/components/CashFlowPanel";
import { SkuProfitabilityHeatmap } from "@/components/SkuProfitabilityHeatmap";
import { PeerBenchmarkingSection } from "@/components/PeerBenchmarkingSection";
import { AuthGuard } from "@/components/auth-guard";
import { getTrialDaysLeft, getConnectedMarketplaces, resetOnboarding, isOnboardingDone } from "@/lib/onboarding";
import {
  supportedChannels, getMarketplaceOption,
  type MarketplaceOption,
} from "@/lib/marketplaces";
import { getConnections, removeConnectionByMarketplace, clearAllConnections } from "@/lib/connect/store";
import type { MarketplaceConnection } from "@/lib/connect/types";
import { DEFAULT_CHANNEL, DEFAULT_DASHBOARD_CHANNELS } from "@/lib/product-market";
import { isAiConfigured } from "@/lib/copilot/ai-configured";

// Translation keys, not display strings — AI_PRESET_KEYS lives at module
// scope (t() needs the hook, only available inside the component), so the
// actual text is resolved via t(key) both for display AND as the literal
// question text sent to askCopilot() — a Turkish preset sends a Turkish
// question when Turkish is selected.
const AI_PRESET_KEYS = [
  "copilot.presets.whyLimit",
  "copilot.presets.whyTakeRate",
  "copilot.presets.backtest",
];

// Mirrors app/api/chat/route.ts's X-Copilot-Mode values — which path produced
// an answer, so the badge always names the actual provider (never "Claude"
// for a Gemini-generated reply, or vice versa).
type CopilotMode = "model-claude" | "model-gemini" | "rule-based" | "model-error";

interface DashboardPageProps {
  /** Unauthenticated seed-data preview (route: /demo). Never touches Supabase,
   *  never redirects to onboarding, always shows the seed Seller A/B/C portfolio. */
  demoMode?: boolean;
}

export function DashboardPage({ demoMode = false }: DashboardPageProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage(demoMode);
  const [channel, setChannel] = useState<Channel>(DEFAULT_CHANNEL);
  // dataVersion is bumped whenever the runtime (user) seller registry changes,
  // forcing getSellers/getSeller below to recompute with the latest data.
  const [dataVersion, setDataVersion] = useState(0);
  const [userRows, setUserRows] = useState<StoredRow[]>([]);
  const [dataBusy, setDataBusy] = useState(false);
  // Real signed-in deployments (Supabase configured) default straight to the
  // user's own tenant so an empty seller never sees a seed seller's numbers.
  // Demo mode (route: /demo) always shows the seed portfolio and is the ONLY
  // place a real user's dashboard and a seed walkthrough can look alike.
  const authConfigured = !demoMode && isAuthConfigured();
  // A real signed-in account only ever sees its own tenant in the switcher —
  // never the seed Seller A/B/C portfolio. Demo mode shows the full seed set.
  //
  // Same fallback the main `view` below applies: a signed-in user with no
  // transactions on the currently-selected channel (e.g. they clicked a
  // marketplace tab they haven't connected) would otherwise make `sellers`
  // come back empty and disappear from the seller switcher / Sellers tab —
  // fall back to their combined view instead of vanishing.
  const sellersChannel: Channel = authConfigured && !getSeller(USER_TENANT_ID, channel) ? "combined" : channel;
  const sellers = authConfigured
    ? getSellers(sellersChannel).filter((s) => s.tenantId === USER_TENANT_ID)
    : getSellers(channel);
  const [tenant, setTenant] = useState(authConfigured ? USER_TENANT_ID : "seller-b");
  const [initialDataLoadDone, setInitialDataLoadDone] = useState(!authConfigured);
  // Onboarding-complete signals other than "has real transaction data" — see
  // the needsOnboarding guard below for why these matter.
  const [billingStatusLoaded, setBillingStatusLoaded] = useState(!authConfigured);
  const [hasBillingHistory, setHasBillingHistory] = useState(false);
  const [onboardingLocallyDone, setOnboardingLocallyDone] = useState(false);
  useEffect(() => { setOnboardingLocallyDone(isOnboardingDone()); }, []);

  // Load the signed-in user's persisted data once on mount, register it with the
  // engine, and switch to it so returning users see their own numbers immediately.
  useEffect(() => {
    if (demoMode) return;
    let active = true;
    (async () => {
      const rows = await loadUserRows();
      if (!active) return;
      setUserRows(rows);
      const seller = buildUserSeller(rows);
      if (seller) {
        registerRuntimeSeller(seller, "Verilerim");
        setTenant(USER_TENANT_ID);
        // Backfill: a returning user with data but no decision_ledger row yet
        // (e.g. right after this feature shipped) gets one recorded now.
        recordLedgerDecision().then(() => loadRealLedger());
      }
      setInitialDataLoadDone(true);
      setDataVersion((v) => v + 1);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read from Supabase and re-register after any mutation.
  async function refreshUserData() {
    const rows = await loadUserRows();
    setUserRows(rows);
    const seller = buildUserSeller(rows);
    if (seller) {
      registerRuntimeSeller(seller, "Verilerim");
    } else {
      clearRuntimeSellers();
      // Only the no-auth demo ever falls back to a seed seller; a real user with
      // no data yet gets redirected to onboarding (see effect below).
      if (!authConfigured) setTenant((t) => (t === USER_TENANT_ID ? "seller-b" : t));
    }
    setDataVersion((v) => v + 1);
    // Every time the user's own data changes, re-derive their real underwriting
    // decision server-side and append it to decision_ledger IF it moved — see
    // app/api/ledger/record. Fire-and-forget: never blocks the data refresh the
    // user is waiting on, and a missed append just means the next data change
    // (or the periodic cron resync) records it instead.
    if (authConfigured) {
      recordLedgerDecision().then(() => loadRealLedger());
    }
  }

  // Real, per-user Decision Ledger — replaces the seed-portfolio in-memory
  // ledger for a signed-in user. See supabase/migrations/0004_decision_ledger.sql
  // (append-only: RLS grants select+insert only, no update/delete).
  const [realLedgerEntries, setRealLedgerEntries] = useState<
    { seq: number; recordedAt: string; approvedLimit: number; takeRate: number; currency: string; modelVersion: string }[] | null
  >(null);

  async function withAccessToken<T>(fn: (token: string) => Promise<T>): Promise<T | undefined> {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return undefined;
    return fn(accessToken);
  }

  async function loadRealLedger() {
    if (!authConfigured) return;
    await withAccessToken(async (accessToken) => {
      try {
        const res = await fetch("/api/ledger/list", { headers: { Authorization: `Bearer ${accessToken}` } });
        const result = await res.json().catch(() => ({}));
        if (Array.isArray(result.entries)) setRealLedgerEntries(result.entries);
      } catch {
        // Non-critical — History just keeps showing its last known state.
      }
    });
  }
  useEffect(() => { loadRealLedger(); }, [authConfigured]);

  async function recordLedgerDecision() {
    if (!authConfigured) return;
    await withAccessToken(async (accessToken) => {
      try {
        await fetch("/api/ledger/record", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      } catch {
        // Non-critical — the next data change (or hourly cron resync) retries.
      }
    });
  }

  // A real signed-in seller who has NEVER been through onboarding — send them
  // there instead of ever rendering the dashboard shell around them.
  //
  // Real transaction data (hasRuntimeSeller) is NOT the right signal on its
  // own: connecting a marketplace in /connect (components/MarketplaceConnectStep.tsx
  // → lib/connect/store.ts's addConnection) is entirely localStorage — it never
  // writes to user_transactions. Only a CSV upload or a real marketplace API
  // sync does. So a user who completed /connect via the demo OAuth connectors
  // (the only option without real Trendyol/Hepsiburada/N11/Shopify credentials
  // on hand) would have zero transaction rows forever, and this guard would
  // bounce them back to /connect every single time they reached /dashboard —
  // an inescapable redirect loop, confirmed live. onboardingLocallyDone
  // (set by /connect's finish() via completeOnboarding()) and hasBillingHistory
  // (a billing_subscriptions row exists — proof they finished the card step,
  // works cross-device) are both independent proof the flow was completed at
  // least once; either one is enough to let them through even with no data yet.
  const needsOnboarding =
    authConfigured &&
    initialDataLoadDone &&
    billingStatusLoaded &&
    !hasRuntimeSeller(USER_TENANT_ID) &&
    !onboardingLocallyDone &&
    !hasBillingHistory;
  useEffect(() => {
    if (needsOnboarding) router.replace("/connect");
  }, [needsOnboarding, router]);

  // The initial-load effects above haven't resolved yet — `view` above is
  // temporarily the seed fallback. Never show that (or decide needsOnboarding)
  // to a real signed-in user; wait for their own data AND billing status
  // (or the onboarding redirect) instead.
  const isLoadingInitialData = authConfigured && (!initialDataLoadDone || !billingStatusLoaded);

  async function handleUserUpload(rows: UserRawRow[]) {
    setDataBusy(true);
    await saveUserRows(rows);
    await refreshUserData();
    setTenant(USER_TENANT_ID);
    setChannel(DEFAULT_CHANNEL);
    setDataBusy(false);
  }

  async function handleUserDeleteRow(id: string) {
    setDataBusy(true);
    await deleteUserRow(id);
    await refreshUserData();
    setDataBusy(false);
  }

  async function handleUserClear() {
    setDataBusy(true);
    await clearUserRows();
    await refreshUserData();
    setDataBusy(false);
  }
  const [sellerMenu, setSellerMenu] = useState(false);
  const [currentTab, setCurrentTab] = useState("Dashboard");
  // Trial countdown is client-only (localStorage); read after mount to avoid
  // hydration mismatch. null → not on a trial (badge hidden).
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  useEffect(() => { setTrialDaysLeft(getTrialDaysLeft()); }, []);

  // Marketplaces the user connected during onboarding (client-only localStorage).
  // Read after mount to avoid hydration mismatch.
  const [connectedIds, setConnectedIds] = useState<string[] | null>(null);
  useEffect(() => { setConnectedIds(getConnectedMarketplaces()); }, []);

  // Marketplaces with real (encrypted) credentials on file — only these get a
  // "Refresh" button; CSV/manual/demo connections have nothing to resync.
  // See lib/marketplace-resync.ts — the read side of marketplace_credentials.
  const [resyncableMarketplaces, setResyncableMarketplaces] = useState<string[]>([]);
  const [resyncBusy, setResyncBusy] = useState<string | null>(null);
  const [resyncStatus, setResyncStatus] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function loadResyncableMarketplaces() {
    if (!authConfigured) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;
    try {
      const res = await fetch("/api/marketplace/credentials-status", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await res.json().catch(() => ({}));
      if (Array.isArray(result.marketplaces)) setResyncableMarketplaces(result.marketplaces);
    } catch {
      // Non-critical — the Refresh section just stays empty.
    }
  }
  useEffect(() => { loadResyncableMarketplaces(); }, [authConfigured]);

  async function handleResync(marketplaceId: string) {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setResyncStatus((prev) => ({ ...prev, [marketplaceId]: { ok: false, message: "Oturum bulunamadı — lütfen tekrar giriş yapın." } }));
      return;
    }
    setResyncBusy(marketplaceId);
    try {
      const res = await fetch("/api/marketplace/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ marketplace: marketplaceId }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.success) {
        setResyncStatus((prev) => ({
          ...prev,
          [marketplaceId]: { ok: true, message: `Senkronize edildi · ${result.rowsSaved} satır` },
        }));
        await refreshUserData();
      } else {
        setResyncStatus((prev) => ({
          ...prev,
          [marketplaceId]: { ok: false, message: result.error ?? "Senkronizasyon başarısız." },
        }));
      }
    } catch {
      setResyncStatus((prev) => ({ ...prev, [marketplaceId]: { ok: false, message: "Bağlantı kurulamadı." } }));
    } finally {
      setResyncBusy(null);
    }
  }
  // Signed-in account identity for Settings — real values from the Supabase
  // session (email always present; company is whatever was captured at signup,
  // see app/signup/page.tsx's user_metadata.company). null while loading/no auth.
  const [account, setAccount] = useState<{ email: string; company: string } | null>(null);
  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      setAccount({
        email: data.user.email ?? "—",
        company: typeof data.user.user_metadata?.company === "string" ? data.user.user_metadata.company : "",
      });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authConfigured]);

  interface BillingStatusView {
    stripeConfigured: boolean;
    plan: { currency: string; amount: number; formattedAfterTrial: string };
    subscription: {
      status: string;
      trialEnd: string | null;
      hasActiveSubscription: boolean;
      isDemo?: boolean;
      updatedAt: string;
    } | null;
  }
  const [billingStatus, setBillingStatus] = useState<BillingStatusView | null>(null);
  const [billingStatusError, setBillingStatusError] = useState<string | null>(null);

  async function loadBillingStatus() {
    if (!authConfigured) return;
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;
      const res = await fetch("/api/billing/status", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBillingStatusError(result.error ?? "Abonelik bilgisi yüklenemedi.");
        return;
      }
      setBillingStatusError(null);
      setBillingStatus(result as BillingStatusView);
      // Any subscription row (trialing/active/etc.) is proof this account
      // already finished /connect's card step at least once — see the
      // needsOnboarding guard above.
      setHasBillingHistory(!!(result as BillingStatusView).subscription);
    } catch {
      setBillingStatusError("Abonelik bilgisi yüklenemedi.");
    } finally {
      // Runs even on an early return (not authConfigured is the one exception —
      // that path never needs this, since needsOnboarding is already false then).
      setBillingStatusLoaded(true);
    }
  }
  useEffect(() => { loadBillingStatus(); }, [authConfigured]);

  // Settings → "Connected marketplaces" list. Merges two sources of truth so the
  // list is never silently wrong: localStorage connections (this browser's
  // record of what was linked, incl. demo-only links) UNIONed with
  // resyncableMarketplaces (server-verified: a real, still-stored credential
  // row exists) — a marketplace connected on another device still shows up
  // as "Live" here even with no local connection record.
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  useEffect(() => { setConnections(getConnections()); }, [connectedIds]);
  const displayedConnections = (() => {
    const byId = new Map<string, { marketplaceId: string; provider: "live" | "demo"; connectedAt: string | null }>();
    for (const c of connections) {
      byId.set(c.marketplaceId, { marketplaceId: c.marketplaceId, provider: c.provider === "live" ? "live" : "demo", connectedAt: c.connectedAt });
    }
    for (const mp of resyncableMarketplaces) {
      if (!byId.has(mp)) byId.set(mp, { marketplaceId: mp, provider: "live", connectedAt: null });
    }
    return Array.from(byId.values());
  })();

  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectStatus, setDisconnectStatus] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function confirmDisconnect(deleteData: boolean) {
    const marketplaceId = disconnectTarget;
    if (!marketplaceId) return;
    setDisconnectBusy(true);
    try {
      if (authConfigured) {
        const supabase = getSupabaseClient();
        const { data: sessionData } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          const res = await fetch("/api/marketplace/disconnect", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ marketplace: marketplaceId, deleteData }),
          });
          const result = await res.json().catch(() => ({}));
          if (!res.ok || !result.success) {
            setDisconnectStatus((prev) => ({ ...prev, [marketplaceId]: { ok: false, message: result.error ?? "Bağlantı kesilemedi." } }));
            return;
          }
        }
      }
      removeConnectionByMarketplace(marketplaceId);
      setConnections(getConnections());
      setConnectedIds(getConnectedMarketplaces());
      await loadResyncableMarketplaces();
      if (deleteData) await refreshUserData();
      setDisconnectStatus((prev) => ({
        ...prev,
        [marketplaceId]: { ok: true, message: deleteData ? "Bağlantı kesildi ve veriler silindi." : "Bağlantı kesildi — geçmiş veriler korundu." },
      }));
    } finally {
      setDisconnectBusy(false);
      setDisconnectTarget(null);
    }
  }

  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  // Full thread, not just the latest Q/A — lets the server resolve a
  // follow-up like "onun iade oranı ne?" against whatever the previous
  // answer was about, and lets the panel show past turns after a reload.
  // "system-note" entries are local-only markers (e.g. "grounding changed");
  // they're never sent to the server and never persisted.
  const [copilotMessages, setCopilotMessages] = useState<
    { role: "user" | "assistant" | "system-note"; content: string; mode?: CopilotMode }[]
  >([]);
  const [copilotHistoryLoaded, setCopilotHistoryLoaded] = useState(false);

  // Real signed-in users: load their persisted conversation once so it
  // survives a reload or a sign-in on another device. Demo/no-auth mode has
  // no server-side identity to scope a conversation_history table to, so it
  // just starts fresh every time (session-only, in React state).
  useEffect(() => {
    if (!authConfigured) {
      setCopilotHistoryLoaded(true);
      return;
    }
    let active = true;
    (async () => {
      const loaded = await withAccessToken(async (token) => {
        const res = await fetch("/api/copilot/history", { headers: { Authorization: `Bearer ${token}` } });
        const result = await res.json().catch(() => ({}));
        return Array.isArray(result.messages) ? result.messages : [];
      });
      if (!active) return;
      if (loaded) {
        setCopilotMessages(
          loaded.map((m: { role: "user" | "assistant"; content: string; mode: CopilotMode | null }) => ({
            role: m.role,
            content: m.content,
            mode: m.mode,
          }))
        );
      }
      setCopilotHistoryLoaded(true);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authConfigured]);

  // Safety net for the case where `channel` doesn't have this seller's data (e.g.
  // right after mount, before the channel-sync effect below has run): a real,
  // signed-in seller ALWAYS falls back to their own combined view — never to a
  // seed demo seller. Only the no-auth demo path uses the seed fallback.
  //
  // A real signed-in seller can ALSO have zero runtime data on the very first
  // render — the initial-load effect above is still in flight (async Supabase
  // fetch), so `getSeller(tenant, ...)` is undefined for a beat. Without this
  // final seed fallback that render crashes (`view` undefined) for every real
  // user, every time, before their data has had a chance to load. The
  // `isLoadingInitialData` gate below keeps that seed data off-screen — this
  // fallback exists purely so the render doesn't throw before the gate runs.
  // The final seed fallback MUST be channel-proof. `getSeller("seller-b", channel)`
  // is undefined whenever the current `channel` is one the seed seller has no
  // transactions for — e.g. a real signed-in user who connected Shopify/N11
  // has their `channel` snapped to it (see the channel-sync effect above), but
  // seed seller-b only carries trendyol/amazon/hepsiburada data (lib/data/seed.ts).
  // That made the `!` a lie, `view` undefined, and `view.currency` on the next
  // line crashed the ENTIRE dashboard to Next's "This page couldn't load" for
  // every such user on entry — indistinguishable to them from being unable to
  // get past onboarding. `getSeller("seller-b", "combined")` aggregates ALL of
  // the seed seller's transactions across every marketplace, so it is
  // guaranteed to resolve regardless of the selected channel — a safe,
  // never-undefined stand-in purely so the render reaches the loading /
  // no-data / onboarding gates below (which replace it before it's ever shown).
  const view =
    getSeller(tenant, channel) ??
    (authConfigured ? getSeller(tenant, "combined") : undefined) ??
    getSeller("seller-b", channel) ??
    getSeller("seller-b", "combined")!;
  const fin = getFinancing(tenant) ?? getFinancing("seller-b")!;
  const currency = view.currency;
  const w = view.waterfall;
  const grossRev = w.grossRevenue;
  // Highest-impact "drop this SKU" insight, shown as a single card under the SKU table.
  //
  // Everything below re-derives numbers straight from `tenant`/`channel`, which
  // is WRONG whenever `view` above fell back (e.g. the user clicked a
  // marketplace tab they have no data in, or a channel with no data still
  // showing while demo-tenant fallback applies): `tenant`/`channel` point at
  // the empty combination, while `view` already resolved to the real one
  // (`view.tenantId`/`view.channel`). Using the raw values here reintroduces
  // exactly the mismatch `view`'s fallback exists to avoid — e.g. clicking an
  // unconnected marketplace tab showed a nonsensical "0% margin" hero number
  // while the fee waterfall and SKU table underneath (driven by `view`) kept
  // showing the real combined data. Always derive from `view.tenantId`/
  // `view.channel`, never the raw state.
  const silentLoserInsight = getSilentLoserInsight(view.tenantId, view.channel);

  // Ad spend is interactive; reset to the seller's real base whenever the seller or channel changes.
  const [adSpendVal, setAdSpendVal] = useState(w.adSpendAllocated);
  useEffect(() => {
    setAdSpendVal(w.adSpendAllocated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.tenantId, view.channel]);

  // Live recompute through aggregateTrueMargin as the slider moves.
  const live = recomputeMargin(view.tenantId, adSpendVal, view.channel);
  const marginPercent = live.marginPct;
  const netContribution = live.netContribution;

  const belief = view.perceivedMarginBelief;
  const ptsDiff = Math.abs(belief - marginPercent).toFixed(1);

  const commission = w.commission;
  const vat = w.vat;
  const shipping = w.shipping;
  const returns = w.returnsAllocated;
  const payment = w.paymentFees;
  const cogs = w.cogs;

  const benchmarks = getBenchmarkRows();
  const portfolio = getPortfolioMetrics();
  // Signed-in users see their OWN append-only Postgres ledger (decision_ledger);
  // only the no-auth /demo walkthrough still shows the seed-portfolio in-memory
  // ledger, which is what it's supposed to demonstrate.
  const seedLedger = getBacktest().ledger;
  const ledger = authConfigured
    ? (realLedgerEntries ?? []).map((l) => ({ ...l, tenantId: USER_TENANT_ID, label: "Your account" }))
    : seedLedger;

  const approved = view.decision.approvedLimit > 0;
  const takeRate = (view.decision.takeRate * 100).toFixed(1);
  const coOurs = (fin.report.trueMargin.chargeOffRate * 100).toFixed(1);
  const coInc = (fin.report.incumbent.chargeOffRate * 100).toFixed(1);
  const lossRed = Math.round(fin.report.lossReductionPct * 100);

  const money = (val: number, cur: string = currency) => {
    const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(val)));
    return (cur === "USD" ? "$" : "₺") + s;
  };
  const pctStr = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const channelLabel = (c: Channel) => (c === "combined" ? "Combined" : MARKETPLACE_LABELS[c].replace(/ \(.*\)/, ""));

  // Dynamic marketplace tabs from the user's connected selection. Only engine-
  // supported marketplaces become live data channels; anything else is shown as a
  // demo "ghost" tab (not clickable) so we never call the engine with a channel it
  // can't compute. With no selection (e.g. demo mode) we fall back to all three.
  const DEFAULT_CHANNELS: Channel[] = [...DEFAULT_DASHBOARD_CHANNELS];
  // `connectedIds` is a client-only (localStorage) record of what THIS browser
  // connected — it can be empty/stale on a different device or after the site
  // data was cleared, even though the user's real data (server-side) covers a
  // different marketplace. Union it with the marketplaces the signed-in seller
  // ACTUALLY has transactions for, so a tab always exists for real data.
  const realSellerChannels: Channel[] = authConfigured ? (getSellerChannels(USER_TENANT_ID) as Channel[]) : [];
  const dataChannels: Channel[] = (() => {
    const base =
      connectedIds && connectedIds.length > 0
        ? (() => {
            const chans = supportedChannels(connectedIds) as Channel[];
            return chans.length > 0 ? chans : DEFAULT_CHANNELS;
          })()
        : DEFAULT_CHANNELS;
    return realSellerChannels.length > 0
      ? Array.from(new Set([...base, ...realSellerChannels]))
      : base;
  })();
  const ghostOptions: MarketplaceOption[] =
    connectedIds && connectedIds.length > 0
      ? connectedIds
          .map(getMarketplaceOption)
          .filter((o): o is MarketplaceOption => !!o && !o.engineChannel)
      : [];

  // Keep `channel` valid: if the active channel isn't among the available tabs,
  // snap to the first data channel. For a signed-in real user, ALSO make sure the
  // channel actually has this seller's data — a tab can exist (e.g. the
  // DEFAULT_CHANNELS fallback) while having zero transactions for this specific
  // seller, which previously fell through to a seed demo seller's numbers below.
  useEffect(() => {
    if (connectedIds === null) return;
    if (channel !== "combined" && !dataChannels.includes(channel)) {
      setChannel(dataChannels[0]);
      return;
    }
    if (authConfigured && channel !== "combined" && realSellerChannels.length > 0 && !realSellerChannels.includes(channel)) {
      setChannel(realSellerChannels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedIds, authConfigured, dataVersion]);

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    // Sign-out only ever ended the Supabase session — every client-only cache
    // (onboarding/trial-start/"connected marketplaces" in localStorage, and
    // this tab's in-memory RUNTIME_SELLERS) survived it untouched. On a
    // shared/reused browser, the NEXT person to sign in inherited the
    // previous account's "connected marketplaces" list and trial countdown
    // (confirmed live: a fresh signup showed a prior test account's demo
    // Trendyol connection as already "Connected ✓"). None of this ever
    // exposed the previous user's real financial data — that's RLS/
    // auth.uid()-scoped server-side — but it's stale, misleading client
    // state that belongs to nobody currently signed in, so it must go now.
    clearRuntimeSellers();
    resetOnboarding();
    clearAllConnections();
    router.replace("/login");
  }

  // Full-thread question -> streamed, grounded answer. Server re-derives the
  // seller's data from lib/engine (tenant + channel only); the client never
  // supplies numbers. Sends the WHOLE conversation so far (not just this one
  // question) so the server can resolve a referential follow-up ("onun iade
  // oranı ne?") against the previous turn, and so real multi-turn LLM
  // conversations (when ANTHROPIC_API_KEY is set) actually have memory.
  async function askCopilot(text: string) {
    const question = text.trim();
    if (!question || aiLoading) return;
    const threadForServer = [...copilotMessages.filter((m) => m.role !== "system-note"), { role: "user" as const, content: question }];
    setCopilotMessages((prev) => [...prev, { role: "user", content: question }]);
    setAiInput("");
    setAiLoading(true);

    try {
      // Seed sellers (demo mode) need no token; a real signed-in user's own
      // tenant requires it — the server re-fetches their data by token rather
      // than trusting a client-sent snapshot. See app/api/chat/route.ts.
      const accessToken = await withAccessToken(async (token) => token);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          messages: threadForServer.map(({ role, content }) => ({ role, content })),
          tenantId: tenant,
          channel,
          language,
        }),
      });
      const modeHeader = res.headers.get("X-Copilot-Mode");
      const mode: CopilotMode | undefined =
        modeHeader === "model-claude" || modeHeader === "model-gemini" || modeHeader === "rule-based" || modeHeader === "model-error"
          ? modeHeader
          : undefined;
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setCopilotMessages((prev) => [...prev, { role: "assistant", content: "", mode }]);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setCopilotMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: acc, mode };
          return next;
        });
      }
    } catch {
      setCopilotMessages((prev) => [...prev, { role: "assistant", content: t("copilot.couldNotReach") }]);
    } finally {
      setAiLoading(false);
    }
  }

  // Grounding (seller/channel) changed mid-conversation — never silently
  // pretend the thread above still applies to the new context. Rather than
  // wipe the conversation (losing the memory this thread exists to provide),
  // drop a visible local-only marker; it's filtered out of both the payload
  // sent to /api/chat and anything persisted server-side.
  const groundingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${tenant}:${channel}`;
    if (groundingKeyRef.current && groundingKeyRef.current !== key && copilotMessages.length > 0) {
      setCopilotMessages((prev) => [
        ...prev,
        { role: "system-note", content: t("copilot.gradingChanged", { seller: view.label, channel: channelLabel(view.channel) }) },
      ]);
    }
    groundingKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, channel]);

  const renderCostRow = (label: string, value: number) => {
    const pct = (value / grossRev) * 100;
    return (
      <div className="flex items-center justify-between py-2 group">
        <div className="w-24 lg:w-32 text-zinc-500 shrink-0">{label}</div>
        <div className="flex-1 px-4 lg:px-8 flex items-center hidden sm:flex">
          <div className="h-[2px] bg-zinc-800 transition-colors group-hover:bg-zinc-700" style={{ width: `${pct}%` }}></div>
        </div>
        <div className="w-24 lg:w-28 text-right tabular-nums text-zinc-400 group-hover:text-zinc-300 transition-colors shrink-0 ml-auto">
          -{money(value)}
        </div>
      </div>
    );
  };

  // `id` stays the internal English state key (currentTab === "Dashboard" etc.,
  // compared throughout this file) — only the DISPLAYED label is translated.
  const navItems = [
    { id: "Dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { id: "Verilerim", labelKey: "nav.myData", icon: Database },
    { id: "Sellers", labelKey: "nav.sellers", icon: Users },
    { id: "Financing", labelKey: "nav.financing", icon: Briefcase },
    { id: "Campaign", labelKey: "nav.campaign", icon: Tag },
    { id: "Nakit", labelKey: "nav.cashFlow", icon: Landmark },
    { id: "Products", labelKey: "nav.products", icon: Package },
    { id: "Copilot", labelKey: "nav.copilot", icon: Sparkles },
    { id: "History", labelKey: "nav.history", icon: HistoryIcon },
    { id: "Settings", labelKey: "nav.settings", icon: Settings },
  ];

  // Still waiting on the initial Supabase fetch for a real signed-in user —
  // `view`/`fin` above are the seed fallback for this one frame; never paint
  // that, just show a loading state until the effect resolves.
  if (isLoadingInitialData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">
          <span className="inline-block w-1.5 h-1.5 bg-zinc-600 animate-pulse" />
          Verileriniz yükleniyor
        </div>
      </div>
    );
  }

  // Real signed-in seller with no data yet — never render the dashboard shell
  // around them. The effect above already kicked off the redirect; this is the
  // brief frame while that navigation completes.
  if (needsOnboarding) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">Redirecting to connect…</span>
      </div>
    );
  }

  // A real signed-in seller who HAS completed onboarding (see needsOnboarding's
  // comment above) but still has zero real transaction data — e.g. they only
  // used /connect's demo marketplace connectors, which never write to
  // user_transactions. `view` below would otherwise silently fall back to the
  // seed seller ("seller-b") for render-safety, which would show them fake
  // demo numbers as if they were their own — never acceptable. Show an honest
  // empty state instead, with a real path to actual data (CSV upload or a
  // genuine marketplace connection), rather than either bleeding seed data or
  // trapping them in the /connect loop this whole guard exists to avoid.
  const hasNoRealDataYet = authConfigured && initialDataLoadDone && !hasRuntimeSeller(USER_TENANT_ID);
  if (hasNoRealDataYet) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-zinc-200 font-sans text-lg font-medium">No data yet</div>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Your account is set up, but there&apos;s no real order data to show yet — connecting a marketplace
            during onboarding links the account, but doesn&apos;t pull in past orders on its own. Upload a CSV
            or connect a marketplace with real API access to see your numbers here.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push("/connect")}
              className="h-10 px-4 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors"
            >
              Connect a marketplace
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-rev={dataVersion} className="h-screen w-full bg-zinc-950 text-zinc-200 font-sans selection:bg-zinc-800 flex overflow-hidden">
      <style>{`
        input[type=range].cost-slider::-webkit-slider-thumb {
          -webkit-appearance: none; height: 16px; width: 2px; background: #e4e4e7;
          cursor: col-resize; border-radius: 0; box-shadow: 0 0 0 4px rgba(39,39,42,0); transition: box-shadow 0.2s;
        }
        input[type=range].cost-slider:hover::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(39,39,42,0.5); }
        input[type=range].cost-slider::-moz-range-thumb {
          height: 16px; width: 2px; background: #e4e4e7; border: none; cursor: col-resize; border-radius: 0;
        }
      `}</style>

      {/* FIXED LEFT SIDEBAR */}
      <aside className="w-[220px] bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 z-40 relative">
        <div className="h-20 flex items-center px-6">
          <span className="text-zinc-100 font-mono tracking-tight text-lg font-medium">TrueMargin</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                currentTab === item.id ? "bg-zinc-900 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
              }`}
            >
              <item.icon size={16} className={currentTab === item.id ? "text-zinc-300" : "text-zinc-600"} />
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-zinc-900 m-3 mb-4 rounded-sm flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-500 text-xs font-mono">UD</div>
          <div className="flex flex-col">
            <span className="text-xs text-zinc-300 font-medium truncate">Underwriting desk</span>
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">Team</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-zinc-900 px-6 flex items-center justify-between shrink-0 bg-zinc-950/90 backdrop-blur-md z-30">
          <div className="relative">
            <button
              onClick={() => setSellerMenu((v) => !v)}
              className="flex items-center gap-3 text-sm font-medium hover:text-zinc-100 cursor-pointer text-zinc-400 transition-colors"
            >
              <span>{view.label}</span>
              <ChevronDown size={14} className="opacity-40" />
            </button>
            {sellerMenu && (
              <div className="absolute left-0 top-full mt-2 min-w-[200px] bg-zinc-900 border border-zinc-800 z-50 shadow-2xl">
                {sellers.map((s) => (
                  <button
                    key={s.tenantId}
                    onClick={() => { setTenant(s.tenantId); setSellerMenu(false); }}
                    className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      s.tenantId === tenant ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                    }`}
                  >
                    <span>{s.label}</span>
                    <span className="text-zinc-600 text-xs ml-2 font-mono">{s.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-8">
          <div className="items-center gap-8 text-[13px] font-mono tracking-wide hidden md:flex">
            {dataChannels.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`transition-colors pb-[18px] pt-[20px] ${
                  channel === c
                    ? "text-zinc-100 border-b-2 border-zinc-100"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                {MARKETPLACE_LABELS[c as Exclude<Channel, "combined">]}
              </button>
            ))}
            {/* Combined — unified true margin across all connected marketplaces */}
            {dataChannels.length > 1 && (
              <button
                type="button"
                onClick={() => setChannel("combined")}
                className={`transition-colors pb-[18px] pt-[20px] ${
                  channel === "combined"
                    ? "text-zinc-100 border-b-2 border-zinc-100"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                Combined
              </button>
            )}
            {/* Demo (no adapter yet) — visible but not selectable */}
            {ghostOptions.map((o) => (
              <span
                key={o.id}
                title="Connected · settlement sync coming soon (demo)"
                className="pb-[18px] pt-[20px] text-zinc-700 cursor-default inline-flex items-center gap-1.5"
              >
                {o.label}
                <span className="text-[9px] uppercase tracking-widest border border-zinc-800 px-1 py-0.5 leading-none">soon</span>
              </span>
            ))}
          </div>

            {/* Free-trial indicator */}
            {trialDaysLeft !== null && (
              <span className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-[11px] font-mono tabular-nums text-zinc-400">
                <span className={`w-1.5 h-1.5 ${trialDaysLeft > 0 ? "bg-emerald-400" : "bg-red-400"}`} />
                {trialDaysLeft > 0
                  ? `Free trial · ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
                  : "Trial ended"}
              </span>
            )}
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto w-full relative">
          {/* VIEW: DASHBOARD */}
          {currentTab === "Dashboard" && (
            <div className="max-w-[1300px] mx-auto px-8 py-12 md:py-20">
              {view.channel === "combined" && view.marketplaceMargins && (
                <div className="mb-16">
                  <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-6">
                    Per marketplace · combined total in TRY (USD→TRY @33)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800">
                    {view.marketplaceMargins.map((mp) => (
                      <div key={mp.marketplace} className="bg-zinc-950 p-4 lg:p-6">
                        <div className="text-zinc-500 font-sans text-xs mb-4">
                          {MARKETPLACE_LABELS[mp.marketplace]}
                        </div>
                        <div className={`text-2xl font-mono tabular-nums ${mp.trueMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pctStr(mp.trueMarginPct)}
                        </div>
                        <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">
                          Perceived {pctStr(mp.perceivedMarginPct)}
                        </div>
                        <div className="text-zinc-500 text-[11px] font-mono mt-3 tabular-nums">
                          Rev {money(mp.grossRevenue, mp.currency)}
                        </div>
                      </div>
                    ))}
                    <div className="bg-zinc-900/40 p-4 lg:p-6 border-l border-zinc-800">
                      <div className="text-zinc-400 font-sans text-xs mb-4">Combined (TRY eq.)</div>
                      <div className={`text-2xl font-mono tabular-nums ${view.trueMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pctStr(view.trueMarginPct)}
                      </div>
                      <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">
                        Perceived {pctStr(view.perceivedMarginPct)}
                      </div>
                      <div className="text-zinc-500 text-[11px] font-mono mt-3 tabular-nums">
                        Rev {money(view.waterfall.grossRevenue)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
                {/* LEFT COLUMN */}
                <div className="w-full lg:w-7/12 flex flex-col">
                  {/* Hero Margin */}
                  <div className="mb-20 lg:mb-24 relative">
                    <div className="absolute -left-6 lg:-left-8 top-1 bottom-1 w-px bg-zinc-900"></div>
                    <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-6">
                      Real Margin · {channelLabel(view.channel)}
                    </h2>
                    <div className={`text-7xl lg:text-[96px] leading-none font-mono tracking-tighter tabular-nums ${marginPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {marginPercent > 0 ? "+" : ""}{marginPercent.toFixed(1)}%
                    </div>
                    <div className="text-zinc-500 mt-6 lg:mt-8 font-mono text-sm flex items-center gap-4">
                      <span>Seller believes <span className="text-zinc-200">{belief.toFixed(1)}%</span></span>
                      <span className="w-1 h-1 bg-zinc-800 rounded-none"></span>
                      <span className="text-red-400">{ptsDiff} pts lower</span>
                    </div>

                    {/* Break-even price — right below the hero margin */}
                    <div className="mt-6 lg:mt-8 flex items-baseline gap-3 border-l-2 border-zinc-800 pl-4">
                      <div>
                        <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-1">
                          Başabaş fiyatı
                        </div>
                        <div className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-zinc-100 tracking-tight">
                          {money(view.breakEvenPrice)}
                        </div>
                        <div className="text-zinc-600 text-[11px] font-mono mt-1">
                          Bu fiyatın altında satmak zarar.
                        </div>
                      </div>
                      <div className="hidden sm:block text-zinc-700 text-[10px] font-mono leading-relaxed max-w-[180px]">
                        (COGS + kargo + hizmet) / (1 − komisyon)
                      </div>
                    </div>

                    {/* Settlement verification — secondary, below break-even. When there's
                        no real settlement file behind actualPayout (true for every real
                        signed-in user today — no adapter ingests one yet), this is labeled
                        "Temsili" instead of silently rendering a bare "tam ödedi ✓". */}
                    {(() => {
                      const s = view.settlement;
                      const hasGap = s.hasGap;
                      const dotColor = !s.isRealSettlementData ? "bg-zinc-600" : hasGap ? "bg-red-500/60" : "bg-emerald-500/60";
                      return (
                        <div className="mt-5 flex items-start justify-between gap-4 border border-zinc-800/70 bg-zinc-900/30 px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">
                                Hakediş Doğrulama
                              </div>
                              {!s.isRealSettlementData && (
                                <span
                                  title="Gerçek hakediş dosyası bağlanmadı — bu rakam sadece beklenen tutarı gösterir, gerçek ödeme doğrulaması yapılmadı."
                                  className="text-[9px] px-1.5 py-0.5 font-mono uppercase tracking-widest border border-zinc-700 text-zinc-500"
                                >
                                  Temsili
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-sm flex items-baseline gap-3 flex-wrap">
                              <span className="text-zinc-500">Beklenen</span>
                              <span className="tabular-nums text-zinc-200">{money(s.expectedPayout)}</span>
                              <span className="text-zinc-700">·</span>
                              <span className="text-zinc-500">{s.isRealSettlementData ? "Gerçek" : "Temsili"}</span>
                              <span className="tabular-nums text-zinc-200">{money(s.actualPayout)}</span>
                            </div>
                            {s.isRealSettlementData ? (
                              <div className={`mt-1.5 font-mono text-[12px] tabular-nums font-medium ${hasGap ? "text-red-400" : "text-emerald-400"}`}>
                                {hasGap
                                  ? `${s.marketplaceLabel} ${money(s.gap)} eksik ödedi (−${s.gapRatePct.toFixed(1)}%)`
                                  : `${s.marketplaceLabel} tam ödedi ✓`}
                              </div>
                            ) : (
                              <div className="mt-1.5 font-mono text-[12px] text-zinc-500 leading-relaxed max-w-sm">
                                {`${s.marketplaceLabel} için henüz gerçek hakediş/ödeme dosyası bağlı değil — gösterilen "Temsili" tutar beklenen tutarla aynı kabul edilmiştir, doğrulanmış bir ödeme farkı değildir.`}
                              </div>
                            )}
                          </div>
                          <div className={`shrink-0 w-1.5 self-stretch rounded-full ${dotColor}`} />
                        </div>
                      );
                    })()}
                  </div>

                  {/* Dönemsel Marj — Sparkline */}
                  {view.marginHistory.length >= 2 && (() => {
                    const pts = view.marginHistory;
                    const W = 280, H = 80, PAD_X = 8, PAD_Y = 12;
                    const allVals = pts.flatMap(p => [p.trueMarginPct, p.perceivedMarginPct]);
                    const minV = Math.min(...allVals) - 2;
                    const maxV = Math.max(...allVals) + 2;
                    const range = maxV - minV || 1;
                    const xOf = (i: number) => PAD_X + (i / (pts.length - 1)) * (W - PAD_X * 2);
                    const yOf = (v: number) => PAD_Y + (1 - (v - minV) / range) * (H - PAD_Y * 2);
                    const toPath = (vals: number[]) =>
                      vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" ");
                    const zeroY = yOf(0);
                    const lastIdx = pts.length - 1;
                    const lastTrue = pts[lastIdx].trueMarginPct;
                    const lastPerc = pts[lastIdx].perceivedMarginPct;
                    const trueColor = lastTrue >= 0 ? "#34d399" : "#f87171";
                    return (
                      <div className="mt-0 mb-1 border border-zinc-800/70 bg-zinc-900/20 px-4 pt-3 pb-4">
                        <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">
                          Dönemsel Gerçek Marj
                        </div>
                        <svg width={W} height={H} className="overflow-visible">
                          {/* Zero baseline */}
                          {zeroY >= PAD_Y && zeroY <= H - PAD_Y && (
                            <line x1={PAD_X} y1={zeroY} x2={W - PAD_X} y2={zeroY}
                              stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
                          )}
                          {/* Perceived line — dashed zinc */}
                          <path d={toPath(pts.map(p => p.perceivedMarginPct))}
                            fill="none" stroke="#71717a" strokeWidth="1.5" strokeDasharray="4 3" />
                          {/* True margin line — solid color */}
                          <path d={toPath(pts.map(p => p.trueMarginPct))}
                            fill="none" stroke={trueColor} strokeWidth="2" strokeLinejoin="round" />
                          {/* Dots + x labels */}
                          {pts.map((p, i) => (
                            <g key={p.period}>
                              <circle cx={xOf(i)} cy={yOf(p.trueMarginPct)} r="2.5" fill={trueColor} />
                              <text x={xOf(i)} y={H} textAnchor="middle"
                                fontSize="9" fill="#52525b" fontFamily="monospace">{p.label}</text>
                            </g>
                          ))}
                          {/* Direct labels at last point */}
                          <text x={xOf(lastIdx) + 6} y={yOf(lastTrue) + 4}
                            fontSize="9" fill={trueColor} fontFamily="monospace">
                            {lastTrue.toFixed(1)}%
                          </text>
                          <text x={xOf(lastIdx) + 6} y={yOf(lastPerc) + 4}
                            fontSize="9" fill="#71717a" fontFamily="monospace">
                            {lastPerc.toFixed(1)}%
                          </text>
                        </svg>
                        <div className="flex gap-4 mt-2">
                          <span className="flex items-center gap-1.5 text-[9px] text-zinc-500 font-mono">
                            <span className="inline-block w-4 h-px" style={{background: trueColor}} /> Gerçek
                          </span>
                          <span className="flex items-center gap-1.5 text-[9px] text-zinc-600 font-mono">
                            <span className="inline-block w-4 border-t border-dashed border-zinc-600" /> Algılanan
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Fee Waterfall */}
                  <div className="flex flex-col font-mono text-sm w-full">
                    <div className="flex w-full text-zinc-600 text-[10px] lg:text-[11px] uppercase tracking-[0.15em] pb-4 mb-4 border-b border-zinc-900">
                      <div className="w-24 lg:w-32 shrink-0">Component</div>
                      <div className="flex-1 px-4 lg:px-8 text-center hidden sm:block">Impact</div>
                      <div className="w-24 lg:w-28 text-right shrink-0 ml-auto">Value</div>
                    </div>

                    <div className="flex items-center justify-between py-2 group">
                      <div className="w-24 lg:w-32 text-zinc-300 shrink-0">Gross Rev</div>
                      <div className="flex-1 px-4 lg:px-8 items-center hidden sm:flex">
                        <div className="h-[2px] bg-zinc-700 w-full"></div>
                      </div>
                      <div className="w-24 lg:w-28 text-right tabular-nums text-zinc-100 shrink-0 ml-auto">{money(grossRev)}</div>
                    </div>

                    {renderCostRow("Commission", commission)}
                    {renderCostRow("VAT", vat)}
                    {renderCostRow("Shipping", shipping)}
                    {renderCostRow("Returns", returns)}

                    {/* Interactive Ad Spend Slider */}
                    <div className="flex items-center justify-between py-3 relative group">
                      <div className="w-24 lg:w-32 text-zinc-100 flex items-center gap-2 shrink-0">Ad spend</div>
                      <div className="flex-1 px-4 lg:px-8 flex items-center relative hidden sm:flex">
                        <input
                          type="range"
                          min={0} max={grossRev} step={100}
                          value={adSpendVal}
                          onChange={(e) => setAdSpendVal(Number(e.target.value))}
                          className="w-full h-[2px] appearance-none cursor-ew-resize cost-slider outline-none"
                          style={{ background: `linear-gradient(to right, #71717a ${(adSpendVal / grossRev) * 100}%, #27272a ${(adSpendVal / grossRev) * 100}%)` }}
                        />
                      </div>
                      <div className="w-24 lg:w-28 text-right tabular-nums font-bold text-zinc-100 border border-zinc-800 bg-zinc-900 px-2 py-0.5 relative shrink-0 ml-auto flex flex-col sm:block">
                        <div className="sm:absolute sm:-top-6 sm:-right-2 text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-widest text-nowrap pointer-events-none mb-1 sm:mb-0">Drag to compute</div>
                        -{money(adSpendVal)}
                      </div>
                    </div>

                    {renderCostRow("Payment", payment)}
                    {renderCostRow("COGS", cogs)}

                    {/* Net Contribution */}
                    <div className="flex items-center justify-between pt-8 mt-6 border-t border-zinc-900">
                      <div className="w-24 lg:w-32 text-zinc-100 font-sans font-medium text-sm shrink-0">Net Contrib.</div>
                      <div className="flex-1 px-4 lg:px-8 items-center hidden sm:flex">
                        <div className={`h-[2px] ${netContribution >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, Math.abs(netContribution / grossRev) * 100)}%` }}></div>
                      </div>
                      <div className={`w-28 lg:w-32 text-right tabular-nums font-bold text-lg lg:text-xl tracking-tight shrink-0 ml-auto ${netContribution >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {netContribution < 0 ? "-" : ""}{money(netContribution)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="w-full lg:w-5/12 flex flex-col lg:pl-4">
                  {/* Underwriting Card */}
                  <div className="mb-14 border border-zinc-800 bg-zinc-900/20 p-6 lg:p-8">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">Decision</h3>
                        <div className={`text-3xl font-mono tracking-tight ${approved ? "text-zinc-100" : "text-zinc-100"}`}>
                          {approved ? money(view.decision.approvedLimit) : "Declined"}
                        </div>
                      </div>
                      <div className="text-right">
                        <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">Take-rate</h3>
                        <div className={`text-3xl font-mono ${approved ? "text-zinc-100" : "text-zinc-700"}`}>{approved ? `${takeRate}%` : "N/A"}</div>
                      </div>
                    </div>
                    <div className="flex justify-between border-t border-zinc-800 pt-5 font-mono text-sm mb-3">
                      <span className="text-zinc-400">Monthly contribution</span>
                      <span className={view.inputs.trailingMonthlyContribution >= 0 ? "text-zinc-100 tabular-nums" : "text-red-400 tabular-nums"}>
                        {view.inputs.trailingMonthlyContribution < 0 ? "-" : ""}{money(view.inputs.trailingMonthlyContribution)}
                      </span>
                    </div>
                    <div className="flex justify-between font-mono text-sm mb-5">
                      <span className="text-zinc-400">Başabaş fiyatı</span>
                      <span className="text-zinc-100 tabular-nums">{money(view.breakEvenPrice)}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono tracking-wide border-l border-zinc-700 pl-3 mb-3">
                      Bu fiyatın altında satmak zarar.
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono tracking-wide border-l border-zinc-700 pl-3">
                      Priced on real margin, not revenue.
                    </div>
                  </div>

                  {/* SKU Table */}
                  <div className="mb-14">
                    <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-6">SKU Unit Economics</h3>
                    <div className="text-sm font-mono w-full">
                      <div className="flex w-full border-b border-zinc-900 pb-3 mb-3 text-zinc-600 text-[10px] uppercase tracking-[0.1em]">
                        <div className="w-4/12 lg:w-5/12">SKU</div>
                        <div className="w-4/12 lg:w-3/12 text-right">Perceived</div>
                        <div className="w-4/12 text-right">True</div>
                      </div>
                      {view.skus.map((sku) => (
                        <div key={sku.sku} className="flex w-full items-center py-2.5 border-b border-zinc-900/50 hover:bg-zinc-900/30 transition-colors">
                          <div className="w-4/12 lg:w-5/12 pr-2 lg:pr-4">
                            <div className="text-zinc-300 truncate text-[12px] lg:text-[13px]">{sku.sku}</div>
                            {sku.isReturnRisk && (
                              <div className="mt-0.5 inline-flex items-center gap-1.5">
                                <span className="text-[9px] bg-zinc-950 text-red-500 px-1.5 py-0.5 tracking-widest border border-red-900/60 font-mono">
                                  YÜK. İADE
                                </span>
                                <span className="text-[9px] text-red-600 font-mono tabular-nums">
                                  {sku.returnRatePct.toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="w-4/12 lg:w-3/12 text-right text-zinc-500 tabular-nums">{pctStr(sku.perceivedMarginPct)}</div>
                          <div className="w-4/12 text-right flex items-center justify-end gap-2 lg:gap-3">
                            {sku.isSilentLoser && (
                              <span className="hidden sm:inline-block text-[9px] bg-zinc-950 text-zinc-500 px-1.5 py-0.5 tracking-widest border border-zinc-800 font-mono">SILENT LOSS</span>
                            )}
                            <span className={`tabular-nums ${sku.trueMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {pctStr(sku.trueMarginPct)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Insight — highest-impact silent-loser SKU, at most one card */}
                  {silentLoserInsight && (
                    <div className="mb-14 border border-zinc-800 bg-zinc-900/20 px-5 py-4">
                      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-2">Insight</div>
                      <p className="text-[13px] text-zinc-300 leading-relaxed">
                        <span className="text-zinc-100 font-medium">{silentLoserInsight.sku}</span> sessiz zarar ediyor.
                        Bu ürünü çıkarırsan tahmini limit etkisi:{" "}
                        <span className="text-emerald-400 font-mono tabular-nums">
                          +{money(silentLoserInsight.limitDelta, silentLoserInsight.currency)}
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Backtest Comparison — for a real signed-in user this replays both models
                      against THEIR OWN data (fin.isSelfBacktest), not the 3-seller seed
                      portfolio; low history months gets an explicit low-sample warning
                      instead of a face-value charge-off percentage. */}
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">Backtest Comparison</h3>
                      <span className="bg-zinc-900 text-zinc-500 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800">
                        {fin.isSelfBacktest ? `N=1 · ${fin.historyMonths} mo. history` : "N=3"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800">
                      <div className="bg-zinc-950 p-4 lg:p-6">
                        <div className="text-zinc-500 font-sans text-xs mb-4">TrueMargin</div>
                        <div className="text-xl lg:text-2xl font-mono text-zinc-100 mb-1 tabular-nums">{coOurs}%</div>
                        <div className="text-zinc-600 text-[10px] lg:text-[11px] font-mono tracking-wide uppercase">charge-off</div>
                      </div>
                      <div className="bg-zinc-950 p-4 lg:p-6">
                        <div className="text-zinc-500 font-sans text-xs mb-4">Incumbent</div>
                        <div className="text-xl lg:text-2xl font-mono text-zinc-600 mb-1 tabular-nums">{coInc}%</div>
                        <div className="text-zinc-700 text-[10px] lg:text-[11px] font-mono tracking-wide uppercase">charge-off</div>
                      </div>
                    </div>
                    {fin.isSelfBacktest && fin.historyMonths < LOW_SAMPLE_HISTORY_MONTHS ? (
                      <div className="mt-4 text-xs text-amber-400/90 font-mono tracking-wide leading-relaxed">
                        Sınırlı veri (N={fin.historyMonths} ay) — bu sonuçlar öngörücü değil, bilgilendirici. Güvenilir bir
                        charge-off oranı için en az {LOW_SAMPLE_HISTORY_MONTHS} aylık gerçek sipariş geçmişi gerekir.
                      </div>
                    ) : (
                      <div className="mt-4 text-xs text-emerald-400/80 font-mono tracking-wide flex items-center gap-3">
                        <span className="text-emerald-500">↓</span> {lossRed}% loss reduction
                        {fin.isSelfBacktest && <span className="text-zinc-600">· your own data, {fin.historyMonths} mo. history</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Peer Benchmarking — real engine metrics ranked against segmented,
                  k-anonymous peer percentiles (pooled where available, else published) */}
              <div className="mt-20">
                <PeerBenchmarkingSection view={view} channel={view.channel} authConfigured={authConfigured} />
              </div>
            </div>
          )}

          {/* VIEW: VERILERIM — the user's own persisted data (CSV upload + manual entry) */}
          {currentTab === "Verilerim" && (
            <div className="max-w-[1100px] mx-auto px-8 py-12 md:py-16">
              <MyDataPanel
                rows={userRows}
                authConfigured={isAuthConfigured()}
                busy={dataBusy}
                onUpload={handleUserUpload}
                onDeleteRow={handleUserDeleteRow}
                onClear={handleUserClear}
              />
            </div>
          )}

          {/* VIEW: CAMPAIGN — campaign discount simulator, live recompute via engine */}
          {currentTab === "Campaign" && view && (
            <div className="max-w-[1100px] mx-auto px-8 py-12 md:py-20">
              <CampaignSimulator
                tenantId={view.tenantId}
                channel={view.channel}
                currency={view.currency}
              />
            </div>
          )}

          {/* VIEW: NAKIT — cash-flow projection from seed transaction data */}
          {currentTab === "Nakit" && view && (
            <div className="max-w-[1000px] mx-auto px-8 py-12 md:py-20">
              <CashFlowPanel
                tenantId={view.tenantId}
                channel={view.channel}
                currency={view.currency}
              />
            </div>
          )}

          {/* VIEW: PRODUCTS — SKU profitability heatmap (real engine data) */}
          {currentTab === "Products" && view && (
            <div className="max-w-[1300px] mx-auto px-8 py-12 md:py-16">
              <SkuProfitabilityHeatmap
                skus={view.skus}
                tenantId={view.tenantId}
                channel={view.channel}
                onGoToFinancing={() => setCurrentTab("Financing")}
              />
            </div>
          )}

          {/* VIEW: SELLERS */}
          {currentTab === "Sellers" && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-12 border-l border-zinc-800 pl-4">Sellers Portfolio</h2>
              <div className="text-sm font-mono w-full">
                <div className="flex w-full border-b border-zinc-900 pb-3 mb-3 text-zinc-600 text-[10px] uppercase tracking-[0.1em]">
                  <div className="w-4/12">Seller</div>
                  <div className="w-4/12 text-right">Perceived</div>
                  <div className="w-4/12 text-right">True</div>
                </div>
                {sellers.map((s) => (
                  <button
                    key={s.tenantId}
                    onClick={() => { setTenant(s.tenantId); setCurrentTab("Dashboard"); }}
                    className="flex w-full items-center py-3 border-b border-zinc-900/50 hover:bg-zinc-900/30 transition-colors text-left"
                  >
                    <div className="w-4/12 text-zinc-300 text-[13px]">{s.label} <span className="text-zinc-600 ml-2 text-[11px]">{s.category}</span></div>
                    <div className="w-4/12 text-right text-zinc-500 tabular-nums">{pctStr(s.perceivedMarginPct)}</div>
                    <div className={`w-4/12 text-right tabular-nums ${s.trueMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pctStr(s.trueMarginPct)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: FINANCING — the unlock (approved limit + take-rate + decision trace + backtest),
              plus the seed-stage investor/technical-credibility benchmarks from the diligence memo. */}
          {currentTab === "Financing" && (
            <div className="max-w-[1200px] mx-auto px-8 py-12 md:py-20">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-12 border-l border-zinc-800 pl-4">
                {t("financing.activeCreditLine", { seller: view.label })}
              </h2>

              <div className="grid gap-16 lg:grid-cols-2 mb-20">
                {/* LEFT: the unlock */}
                <section>
                  <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">
                    {approved ? t("financing.approvedLimit") : t("financing.underwritingDecision")}
                  </h3>
                  <div className={`font-mono text-6xl tracking-tight tabular-nums ${approved ? "text-zinc-100" : "text-red-400"}`}>
                    {approved ? money(fin.decision.approvedLimit) : t("financing.declined")}
                  </div>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-500">
                    {approved
                      ? t("financing.approvedCopy", { rate: takeRate })
                      : t("financing.declinedCopy", { amount: money(0) })}
                  </p>

                  <div className="mt-8">
                    <h4 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">{t("financing.decisionTrace")}</h4>
                    <ol className="space-y-2">
                      {translateRationale(fin.decision.rationale, language).map((r, i) => (
                        <li key={i} className="flex gap-3 text-sm text-zinc-400">
                          <span className="tabular-nums shrink-0 text-zinc-700 font-mono">{String(i + 1).padStart(2, "0")}</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 text-[11px] text-zinc-600 font-mono">
                      {t("financing.ruleBasedExplainable", { seq: ledger.find((l) => l.tenantId === tenant)?.seq ?? "—" })}
                    </p>
                  </div>
                </section>

                {/* RIGHT: backtest — us vs incumbent */}
                <section>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">{t("financing.backtestTitle")}</h3>
                    {fin.isSelfBacktest && (
                      <span className="bg-zinc-900 text-zinc-500 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800">
                        N=1 · {fin.historyMonths} mo.
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 mt-4">
                    <div className="bg-zinc-950 p-4 lg:p-5">
                      <div className="text-zinc-400 font-sans text-xs mb-3">{t("financing.trueMargin")}</div>
                      <dl className="space-y-1.5 text-sm font-mono">
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.limit")}</dt><dd className="tabular-nums text-zinc-200">{money(fin.decision.approvedLimit)}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.takeRate")}</dt><dd className="tabular-nums text-zinc-200">{approved ? `${takeRate}%` : "—"}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.outcome")}</dt><dd className={fin.ourOutcome.impaired ? "text-red-400" : "text-emerald-400"}>{fin.ourOutcome.isLoan ? (fin.ourOutcome.impaired ? t("financing.impaired") : t("financing.performing")) : t("financing.declined")}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.simLoss")}</dt><dd className="tabular-nums text-zinc-200">{money(fin.ourOutcome.loss)}</dd></div>
                      </dl>
                    </div>
                    <div className="bg-zinc-950 p-4 lg:p-5">
                      <div className="text-zinc-500 font-sans text-xs mb-3">{t("financing.incumbent")}</div>
                      <dl className="space-y-1.5 text-sm font-mono">
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.limit")}</dt><dd className="tabular-nums text-zinc-400">{money(fin.incumbentDecision.approvedLimit)}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.takeRate")}</dt><dd className="tabular-nums text-zinc-400">{(fin.incumbentDecision.takeRate * 100).toFixed(1)}%</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.outcome")}</dt><dd className={fin.incumbentOutcome.impaired ? "text-red-400" : "text-zinc-400"}>{fin.incumbentOutcome.isLoan ? (fin.incumbentOutcome.impaired ? t("financing.impaired") : t("financing.performing")) : t("financing.declined")}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.simLoss")}</dt><dd className="tabular-nums text-zinc-400">{money(fin.incumbentOutcome.loss)}</dd></div>
                      </dl>
                    </div>
                  </div>
                  {fin.isSelfBacktest && fin.historyMonths < LOW_SAMPLE_HISTORY_MONTHS ? (
                    <div className="mt-4 text-xs text-amber-400/90 font-mono tracking-wide leading-relaxed">
                      {t("financing.limitedData", { months: fin.historyMonths })}
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-emerald-400/80 font-mono tracking-wide flex items-center gap-3">
                      <span className="text-emerald-500">↓</span>{" "}
                      {t("financing.lossReduction", {
                        pct: lossRed,
                        source: fin.isSelfBacktest ? t("financing.yourOwnData") : t("financing.designPartnersSource"),
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Investor / technical-credibility proof points — from the seed-stage
                  diligence memo. Shown ONLY on the seed-data surfaces: /demo and the
                  keyless-clone fallback (both authConfigured=false). A real signed-in
                  seller's Financing tab must NEVER mix these platform-level pilot
                  figures (N=3 design partners, the 3-seed-seller charge-off, 100% GMV
                  coverage) in with their OWN live credit line + self-backtest above —
                  a real fintech keeps investor/diligence proof on the marketing/demo
                  surface, never inside the authenticated product. */}
              {!authConfigured && (
              <div className="border-t border-zinc-900 pt-12">
                <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-6">
                  {t("financing.proofPoints")}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800 mb-10">
                  <div className="bg-zinc-950 p-4 lg:p-6">
                    <div className="text-2xl font-mono tabular-nums text-zinc-100">{portfolio.designPartners}</div>
                    <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">{t("financing.designPartners")}</div>
                  </div>
                  <div className="bg-zinc-950 p-4 lg:p-6">
                    <div className="text-2xl font-mono tabular-nums text-zinc-100">{portfolio.marketplacesConnected}</div>
                    <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">{t("financing.marketplaceConnectors")}</div>
                  </div>
                  <div className="bg-zinc-950 p-4 lg:p-6">
                    <div className="text-2xl font-mono tabular-nums text-zinc-100">{portfolio.gmvCoveragePct.toFixed(0)}%</div>
                    <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">{t("financing.gmvCoverage")}</div>
                  </div>
                </div>

                <h4 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">
                  {t("financing.benchmarkTitle")}
                </h4>
                <div className="text-sm font-mono w-full">
                  <div className="flex w-full border-b border-zinc-900 pb-3 mb-1 text-zinc-600 text-[10px] uppercase tracking-[0.1em]">
                    <div className="w-5/12">{t("financing.metric")}</div>
                    <div className="w-3/12 text-right">{t("financing.oursLive")}</div>
                    <div className="w-3/12 text-right">{t("financing.target")}</div>
                    <div className="w-1/12 text-right">{t("financing.status")}</div>
                  </div>
                  {benchmarks.map((b) => (
                    <div key={b.label} className="flex w-full items-center py-2.5 border-b border-zinc-900/50">
                      <div className="w-5/12 text-zinc-300 text-[13px]">{translateBenchmarkLabel(b.label, language)}</div>
                      <div className="w-3/12 text-right text-zinc-100 tabular-nums">{b.ours}</div>
                      <div className="w-3/12 text-right text-zinc-600 tabular-nums">{b.target}</div>
                      <div className={`w-1/12 text-right ${b.meetsTarget ? "text-emerald-400" : "text-amber-400"}`}>
                        {b.meetsTarget ? "✓" : "•"}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-zinc-600 font-mono">
                  {t("financing.benchmarkFootnote")}
                </p>
              </div>
              )}
            </div>
          )}

          {/* VIEW: HISTORY — immutable decision ledger (append-only audit trail) */}
          {currentTab === "History" && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] border-l border-zinc-800 pl-4">{t("history.title")}</h2>
                <span className="bg-zinc-900 text-emerald-400/80 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800">{t("history.immutable")}</span>
              </div>
              <p className="text-zinc-600 text-[11px] font-mono mb-10 pl-4 max-w-xl">
                {authConfigured ? t("history.descAuth") : t("history.descDemo")}
              </p>
              {authConfigured && realLedgerEntries === null ? (
                <p className="text-zinc-600 font-mono text-[12px] pl-4">{t("history.loadingHistory")}</p>
              ) : authConfigured && ledger.length === 0 ? (
                <p className="text-zinc-600 font-mono text-[12px] pl-4 max-w-md">
                  {t("history.noDecisions")}
                </p>
              ) : (
                <>
                  <div className="text-sm font-mono w-full">
                    <div className="flex w-full border-b border-zinc-900 pb-3 mb-1 text-zinc-600 text-[10px] uppercase tracking-[0.1em]">
                      <div className="w-1/12">{t("history.seq")}</div>
                      <div className="w-3/12">{t("history.recordedAt")}</div>
                      <div className="w-3/12">{t("history.tenant")}</div>
                      <div className="w-3/12 text-right">{t("financing.limit")}</div>
                      <div className="w-2/12 text-right">{t("financing.takeRate")}</div>
                    </div>
                    {ledger.map((l) => (
                      <div key={l.seq} className="flex w-full items-center py-3 border-b border-zinc-900/50 hover:bg-zinc-900/30 transition-colors">
                        <div className="w-1/12 text-zinc-600 tabular-nums">#{l.seq}</div>
                        <div className="w-3/12 text-zinc-500 text-[11px] tabular-nums">{new Date(l.recordedAt).toISOString().replace("T", " ").slice(0, 19)}</div>
                        <div className="w-3/12 text-zinc-300 text-[13px]">{l.label}</div>
                        <div className="w-3/12 text-right text-zinc-100 tabular-nums">{money(l.approvedLimit, l.currency)}</div>
                        <div className="w-2/12 text-right text-zinc-400 tabular-nums">{(l.takeRate * 100).toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 text-[11px] text-zinc-600 font-mono">
                    {t("history.entriesFooter", { count: ledger.length, model: ledger[0]?.modelVersion ?? "—" })}{" "}
                    {authConfigured ? t("history.sinkAuth") : t("history.sinkDemo")}
                  </p>
                </>
              )}
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {currentTab === "Settings" && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-12 border-l border-zinc-800 pl-4">{t("settings.title")}</h2>

              {/* Language — drives BOTH this UI's i18n language and the language
                  the Copilot (Gemini) is instructed to answer in. Persisted to
                  user_settings for real users; localStorage for demo. */}
              <div className="border border-zinc-900 bg-zinc-950/50 p-6">
                <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">{t("settings.language")}</div>
                <div className="inline-flex border border-zinc-800">
                  {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguage(lang)}
                      className={`px-4 py-2 text-sm font-mono transition-colors ${
                        language === lang ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {lang === "en" ? t("settings.languageEnglish") : t("settings.languageTurkish")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account — real identity from the Supabase session, not a placeholder. */}
              <div className="mt-8 border border-zinc-900 bg-zinc-950/50 p-6">
                <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">{t("settings.account")}</div>
                {authConfigured ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <div className="text-zinc-600 text-[10px] uppercase tracking-wide font-mono mb-1.5">{t("settings.email")}</div>
                      <div className="text-zinc-200 text-sm font-mono tabular-nums truncate">{account?.email ?? "…"}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600 text-[10px] uppercase tracking-wide font-mono mb-1.5">{t("settings.companyStore")}</div>
                      <div className="text-zinc-200 text-sm font-mono truncate">
                        {account ? (account.company || "—") : "…"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-600 font-mono text-[12px]">
                    {t("settings.notConfigured")}
                  </p>
                )}
              </div>

              {/* Billing — Stripe subscription row from billing_subscriptions. */}
              <div className="mt-8 border border-zinc-900 bg-zinc-950/50 p-6">
                <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">{t("settings.billingTrial")}</div>
                {!authConfigured ? (
                  <p className="text-zinc-600 font-mono text-[12px]">{t("settings.signInToView")}</p>
                ) : billingStatusError ? (
                  <p className="text-red-400 font-mono text-[12px]">{billingStatusError}</p>
                ) : !billingStatus ? (
                  <p className="text-zinc-600 font-mono text-[12px]">{t("common.loading")}</p>
                ) : (
                  <div className="space-y-3 text-sm font-mono">
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-600">{t("settings.planAfterTrial")}</span>
                      <span className="text-zinc-200 tabular-nums">{billingStatus.plan.formattedAfterTrial}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-600">{t("settings.stripe")}</span>
                      <span className={billingStatus.stripeConfigured ? "text-emerald-400" : "text-amber-400"}>
                        {billingStatus.stripeConfigured ? t("settings.stripeConfigured") : t("settings.stripeNotConfigured")}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-600">{t("settings.subscription")}</span>
                      <span className="text-zinc-200 capitalize tabular-nums">
                        {billingStatus.subscription?.status ?? t("settings.notStarted")}
                        {billingStatus.subscription?.isDemo && (
                          <span className="text-amber-400/90 normal-case text-[11px] ml-1">{t("settings.demoNoCard")}</span>
                        )}
                      </span>
                    </div>
                    {billingStatus.subscription?.trialEnd && (
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-600">{t("settings.trialEnds")}</span>
                        <span className="text-zinc-200 tabular-nums">
                          {billingStatus.subscription.trialEnd.slice(0, 10)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Connected marketplaces — every link that actually exists (server-verified
                  live credentials + demo-only local links), each with a real Disconnect. */}
              <div className="mt-8 border border-zinc-900 bg-zinc-950/50 p-6">
                <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">{t("settings.connectedMarketplaces")}</div>
                {displayedConnections.length === 0 ? (
                  <p className="text-zinc-600 font-mono text-[12px]">
                    {t("settings.noMarketplaceConnected")}
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-900">
                    {displayedConnections.map((c) => {
                      const opt = getMarketplaceOption(c.marketplaceId);
                      const isLive = c.provider === "live";
                      const status = disconnectStatus[c.marketplaceId];
                      return (
                        <li key={c.marketplaceId} className="py-3.5 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-200 text-sm truncate">{opt?.label ?? c.marketplaceId}</span>
                              <span
                                className={`shrink-0 text-[9px] px-1.5 py-0.5 font-mono uppercase tracking-widest border ${
                                  isLive ? "border-emerald-800/60 text-emerald-400/80" : "border-zinc-800 text-zinc-500"
                                }`}
                              >
                                {isLive ? t("settings.live") : t("settings.demo")}
                              </span>
                            </div>
                            <div className="text-zinc-600 text-[11px] font-mono mt-0.5 tabular-nums">
                              {c.connectedAt
                                ? t("settings.connectedOn", { date: new Date(c.connectedAt).toISOString().slice(0, 10) })
                                : t("settings.credentialsOnFile")}
                            </div>
                            {status && (
                              <div className={`text-[11px] font-mono mt-1 ${status.ok ? "text-emerald-400" : "text-red-400"}`}>
                                {status.message}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setDisconnectTarget(c.marketplaceId)}
                            className="shrink-0 inline-flex items-center h-9 px-4 border border-zinc-800 text-zinc-400 font-mono text-[12px] hover:border-red-400/40 hover:text-red-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                          >
                            {t("settings.disconnect")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Marketplace connections — manual resync per platform, using the
                  credentials already stored from connect (see lib/marketplace-resync.ts) */}
              {authConfigured && (
                <div className="mt-10 border border-zinc-900 bg-zinc-950/50 p-6">
                  <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">{t("settings.refreshData")}</div>
                  {resyncableMarketplaces.length === 0 ? (
                    <p className="text-zinc-600 font-mono text-[12px]">
                      {t("settings.noLiveIntegration")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {resyncableMarketplaces.map((mp) => {
                        const opt = getMarketplaceOption(mp);
                        const status = resyncStatus[mp];
                        const busy = resyncBusy === mp;
                        return (
                          <li key={mp} className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-zinc-300 text-sm">{opt?.label ?? mp}</div>
                              {status && (
                                <div className={`text-[11px] font-mono mt-0.5 ${status.ok ? "text-emerald-400" : "text-red-400"}`}>
                                  {status.message}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleResync(mp)}
                              disabled={busy}
                              className="shrink-0 inline-flex items-center h-9 px-4 border border-zinc-800 text-zinc-300 font-mono text-[12px] hover:bg-zinc-900 hover:text-zinc-100 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                            >
                              {busy ? t("common.refreshing") : t("common.refresh")}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="mt-4 text-[11px] text-zinc-600 font-mono leading-relaxed">
                    {t("settings.refreshFootnote")}
                  </p>
                </div>
              )}

              {/* Session */}
              <div className="mt-10 border border-zinc-900 bg-zinc-950/50 p-6">
                <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">{t("settings.session")}</div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-zinc-500 font-mono text-[12px] leading-relaxed">
                    {t("settings.sessionCopy")}
                  </p>
                  <button
                    onClick={handleSignOut}
                    className="shrink-0 inline-flex items-center h-9 px-4 border border-zinc-800 text-zinc-300 font-mono text-[12px] hover:bg-zinc-900 hover:text-zinc-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                  >
                    {t("common.signOut")}
                  </button>
                </div>
              </div>

              {/* Disconnect confirmation — PDF trust rule: never destroy data silently.
                  The choice between the two outcomes is explicit and neither is pre-selected. */}
              {disconnectTarget && (
                <div
                  className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
                  onClick={() => !disconnectBusy && setDisconnectTarget(null)}
                >
                  <div
                    className="bg-zinc-950 border border-zinc-800 p-6 max-w-sm w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-zinc-100 text-sm font-medium mb-1.5">
                      {t("settings.disconnectTitle", { marketplace: getMarketplaceOption(disconnectTarget)?.label ?? disconnectTarget })}
                    </div>
                    <p className="text-zinc-500 text-[12px] font-mono leading-relaxed mb-6">
                      {t("settings.disconnectCopy")}
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => confirmDisconnect(false)}
                        disabled={disconnectBusy}
                        className="inline-flex items-center justify-center h-10 px-4 border border-zinc-800 text-zinc-200 font-mono text-[12px] hover:bg-zinc-900 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                      >
                        {disconnectBusy ? t("common.working") : t("settings.disconnectOnly")}
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDisconnect(true)}
                        disabled={disconnectBusy}
                        className="inline-flex items-center justify-center h-10 px-4 border border-red-900/60 text-red-400 font-mono text-[12px] hover:bg-red-950/30 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                      >
                        {disconnectBusy ? t("common.working") : t("settings.disconnectAndDelete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectTarget(null)}
                        disabled={disconnectBusy}
                        className="inline-flex items-center justify-center h-9 px-4 text-zinc-500 font-mono text-[12px] hover:text-zinc-300 transition-colors disabled:opacity-50"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: COPILOT — Analyst Copilot tab, streaming from /api/chat (grounded via lib/engine) */}
          {currentTab === "Copilot" && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] border-l border-zinc-800 pl-4">{t("copilot.title")}</h2>
                {!isAiConfigured() && (
                  <span
                    title="No LLM API key is set in this environment — every answer below is a deterministic, rule-based lookup against the same decision data, not a language model."
                    className="bg-zinc-900 text-amber-400/80 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800 uppercase"
                  >
                    {t("copilot.ruleBasedNotConfigured")}
                  </span>
                )}
              </div>
              <div className="text-zinc-600 text-[11px] font-mono mb-12 pl-4">
                {view.label} · {channelLabel(view.channel)}
              </div>

              <div className="flex flex-wrap gap-2 mb-12">
                {AI_PRESET_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => askCopilot(t(key))}
                    disabled={aiLoading}
                    className="text-xs font-mono px-3 py-1.5 border transition-colors border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>

              <div className="max-w-2xl">
                <div className="flex flex-col gap-6 mb-8 max-h-[55vh] overflow-y-auto pr-1">
                  {!copilotHistoryLoaded && <p className="text-zinc-600 text-sm">{t("copilot.loadingConversation")}</p>}
                  {copilotHistoryLoaded && copilotMessages.length === 0 && (
                    <p className="text-zinc-600 text-sm">{t("copilot.pickPreset")}</p>
                  )}
                  {copilotMessages.map((m, i) => {
                    if (m.role === "system-note") {
                      return (
                        <div key={i} className="text-center text-[10px] text-zinc-700 font-mono uppercase tracking-widest py-1">
                          {m.content}
                        </div>
                      );
                    }
                    if (m.role === "user") {
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-mono">{t("copilot.query")} · {view.label}</div>
                          <div className="text-zinc-100 text-base tracking-tight font-medium">{m.content}</div>
                        </div>
                      );
                    }
                    const isPending = aiLoading && i === copilotMessages.length - 1;
                    return (
                      <div key={i} className="flex flex-col gap-3">
                        <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-mono flex items-center gap-3">
                          {t("copilot.analysis")} <span className="h-px bg-zinc-900 flex-1"></span>
                        </div>
                        <div className="text-zinc-400 text-sm leading-relaxed">
                          {isPending && !m.content && <p className="text-zinc-500">{t("copilot.readingDecisionData")}</p>}
                          {m.content && (
                            <p className="whitespace-pre-line">
                              {m.content}
                              {isPending && <span className="inline-block w-1.5 h-4 bg-zinc-500 ml-1 align-middle animate-pulse" />}
                            </p>
                          )}
                          {m.content && !isPending && (
                            <p className="text-[11px] text-zinc-600 font-mono flex items-center gap-2 flex-wrap mt-2">
                              <span>{t("copilot.groundedIn", { seller: view.label })}</span>
                              {(m.mode === "rule-based" || m.mode === "model-error") && (
                                <span
                                  title={m.mode === "model-error" ? t("copilot.ruleBasedAiFailedTitle") : t("copilot.ruleBasedNoLlmTitle")}
                                  className="bg-zinc-900 text-amber-400/80 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800 uppercase"
                                >
                                  {m.mode === "model-error" ? t("copilot.ruleBasedAiFailed") : t("copilot.ruleBasedResponse")}
                                </span>
                              )}
                              {(m.mode === "model-claude" || m.mode === "model-gemini") && (
                                <span className="bg-zinc-900 text-emerald-400/80 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800 uppercase">
                                  {m.mode === "model-claude" ? "Claude" : "Gemini"}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); askCopilot(aiInput); }}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    disabled={aiLoading}
                    className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 text-[13px] font-sans px-4 py-3 focus:outline-none focus:border-zinc-600 placeholder-zinc-700 transition-colors disabled:opacity-50"
                    placeholder={t("copilot.placeholder")}
                  />
                  <button
                    type="submit"
                    disabled={aiLoading || !aiInput.trim()}
                    className="absolute right-3 text-zinc-500 hover:text-zinc-100 transition-colors bg-zinc-900 p-1.5 border border-zinc-800 disabled:opacity-40"
                  >
                    <ArrowUpRight size={14} />
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function DashboardRoute() {
  return (
    <AuthGuard>
      <DashboardPage />
    </AuthGuard>
  );
}
