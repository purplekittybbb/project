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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { loadWeeklyDigestEnabled, setWeeklyDigestEnabled } from "@/lib/supabase/user-settings";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n/config";
import { translateRationale, translateBenchmarkLabel } from "@/lib/i18n/translateRationale";
import {
  ChevronDown, Sparkles, ArrowUpRight,
  LayoutDashboard, Users, Briefcase, History as HistoryIcon, Settings, Package, Tag, Landmark, Database,
  ShieldCheck, Barcode as BarcodeIcon, Puzzle, Coins,
} from "lucide-react";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";
import { ExtensionTokenPanel } from "@/components/account/ExtensionTokenPanel";
import { AiConfidenceBlock } from "@/components/trust/AiConfidenceBlock";
import {
  loadUserRowsWithStatus, saveUserRows, deleteUserRow, clearUserRows, buildUserSeller,
  USER_TENANT_ID, type StoredRow,
} from "@/lib/supabase/user-data";
import type { UserRawRow } from "@/lib/adapters/csv";
import { MyDataPanel } from "@/components/MyDataPanel";
import { LossAlarmBanner, SkuLossTag } from "@/components/LossAlarmBanner";
import { DashboardSummaryHeader } from "@/components/DashboardSummaryHeader";
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
import { ListQualityBadge } from "@/components/ListQualityBadge";
import { ListQualityPanel } from "@/components/ListQualityPanel";
import { VisibilityRankBadge, VisibilityPanel } from "@/components/VisibilityRank";
import { computeListQuality } from "@/lib/quality/list-score";
import { DemandEstimateCard } from "@/components/DemandEstimateCard";
import { estimateDemand } from "@/lib/demand/signals";
import { loadDemandEstimates, type StoredDemandEstimate } from "@/lib/supabase/demand-estimates";
import { UpgradePlanPanel } from "@/components/billing/UpgradePlanPanel";
import { ProFeatureLock } from "@/components/billing/ProFeatureLock";
import { ProductCostEditor } from "@/components/ProductCostEditor";
import { productTitleForSku, buildSkuEconomicsMap } from "@/lib/tools/sku-economics";
import { BarcodeStorePage } from "@/components/tools/store/barcode-page";
import type { StoreToolState } from "@/components/tools/store/use-store-tool-data";
import { seedStoredRowsForTenant } from "@/lib/data/seed";
import { computeSkuMomentum } from "@/lib/tools/opportunity-discovery";
import { OpportunityDiscoveryCard } from "@/components/OpportunityDiscoveryCard";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { TeamAccessPanel } from "@/components/TeamAccessPanel";
import type { DemandRangeResult } from "@/lib/demand/signals";
import { loadMyWatchedVisibility } from "@/lib/supabase/shared-visibility";
import { pickWatchedVisibility } from "@/lib/visibility/display";
import type { WatchedVisibility } from "@/lib/domain/visibility";
import { getTrialDaysLeft, getConnectedMarketplaces, resetOnboarding, isOnboardingDone } from "@/lib/onboarding";
import {
  supportedChannels, getMarketplaceOption,
  type MarketplaceOption,
} from "@/lib/marketplaces";
import {
  getConnections, removeConnectionByMarketplace, clearAllConnections,
  hydrateConnectionsFromServer, touchConnectionSynced, markConnectionNeedsReauth,
  type ServerCredentialConnection,
} from "@/lib/connect/store";
import type { MarketplaceConnection } from "@/lib/connect/types";
import { DEFAULT_CHANNEL, DEFAULT_DASHBOARD_CHANNELS, DEMO_DASHBOARD_CHANNELS } from "@/lib/product-market";
import { isAiConfigured } from "@/lib/copilot/ai-configured";
import {
  ConnectedStores,
  FinancialSummaryWidget,
  MarketplaceMarginStrip,
  PriceTrackerResults,
} from "@/components/dashboard";

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
  const [userDataLoadError, setUserDataLoadError] = useState<string | null>(null);
  const [userDataActionError, setUserDataActionError] = useState<string | null>(null);
  const [demandBySku, setDemandBySku] = useState<Map<string, DemandRangeResult>>(new Map());
  const [dataBusy, setDataBusy] = useState(false);
  const [watchedVisibility, setWatchedVisibility] = useState<WatchedVisibility[]>([]);
  const [visReload, setVisReload] = useState(0);
  const [visScan, setVisScan] = useState<{ status: "idle" | "scanning" | "done" | "error"; msg?: string }>({ status: "idle" });

  async function runVisibilityScan() {
    if (channel === "combined") return;
    setVisScan({ status: "scanning" });
    try {
      const res = await fetch("/api/visibility/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace: channel }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        scanned?: number; found?: number; nothingDue?: boolean; errors?: string[]; error?: string;
      };
      if (!res.ok) {
        setVisScan({ status: "error", msg: json.error ?? "Tarama başlatılamadı." });
        return;
      }
      if (json.errors && json.errors.some((e) => e.includes("Browser session unavailable"))) {
        setVisScan({ status: "error", msg: "Tarama altyapısı şu an uygun değil, biraz sonra tekrar deneyin." });
        return;
      }
      if (json.nothingDue) {
        setVisScan({ status: "done", msg: "Ürünleriniz yakın zamanda tarandı — güncel." });
      } else {
        setVisScan({ status: "done", msg: `${json.scanned ?? 0} ürün tarandı${json.found ? `, ${json.found} tanesi bulundu` : ""}.` });
      }
      setVisReload((v) => v + 1);
    } catch {
      setVisScan({ status: "error", msg: "Bağlantı hatası. Tekrar deneyin." });
    }
  }
  const [openVisibilitySku, setOpenVisibilitySku] = useState<string | null>(null);
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

  // Haftalık kâr özeti e-postası tercihi — bkz. lib/supabase/user-settings.ts.
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestLoaded, setDigestLoaded] = useState(false);
  const [digestError, setDigestError] = useState("");
  useEffect(() => {
    if (demoMode || !authConfigured) return;
    let active = true;
    loadWeeklyDigestEnabled().then((enabled) => {
      if (!active) return;
      setDigestEnabled(enabled);
      setDigestLoaded(true);
    });
    return () => { active = false; };
  }, [demoMode, authConfigured]);

  // Ekip erişimi — bir sahibin verisini salt-okunur görüntüleme modu.
  const [viewingOwnerId, setViewingOwnerId] = useState<string | null>(null);
  const [viewingOwnerLabel, setViewingOwnerLabel] = useState("");
  const [teamDataError, setTeamDataError] = useState("");
  const viewOwnerData = useCallback(async (ownerId: string, label: string) => {
    setTeamDataError("");
    const res = await fetch(`/api/team/data?ownerId=${encodeURIComponent(ownerId)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTeamDataError(body.error ?? "Veri yüklenemedi.");
      return;
    }
    const teamTenantId = `team-${ownerId}`;
    const seller = buildUserSeller(body.rows ?? [], teamTenantId);
    if (!seller) {
      setTeamDataError(`${label} için henüz veri yok.`);
      return;
    }
    registerRuntimeSeller(seller, `${label} (salt-okunur)`);
    setTenant(teamTenantId);
    setViewingOwnerId(ownerId);
    setViewingOwnerLabel(label);
    setDataVersion((v) => v + 1);
  }, []);
  const stopViewingOwnerData = useCallback(() => {
    setTenant(USER_TENANT_ID);
    setViewingOwnerId(null);
  }, []);

  // Load the signed-in user's persisted data once on mount, register it with the
  // engine, and switch to it so returning users see their own numbers immediately.
  useEffect(() => {
    if (demoMode) return;
    let active = true;
    (async () => {
      const { rows, error: loadError } = await loadUserRowsWithStatus();
      if (!active) return;
      setUserDataLoadError(loadError);
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

  // Talep Ölçümü (a promised "Mağaza Gerekli" feature — "Kendi ürününüzün satış
  // hızı ve stok tükenme sinyalleri") used to be skipped entirely in demoMode
  // (this effect bailed out to an empty map whenever demoMode was true), so the
  // demand badge never rendered anywhere in the demo — a prospective seller
  // could never actually see this feature. demoMode now computes the same
  // estimateDemand() locally from the seed seller's own rows instead of
  // calling Supabase (demo never touches Supabase — see the `if (demoMode)
  // return;` guard elsewhere in this file).
  useEffect(() => {
    if (demoMode) {
      const demoRows = seedStoredRowsForTenant(tenant);
      const map = new Map<string, DemandRangeResult>();
      const skus = [...new Set(demoRows.map((r) => r.sku))];
      for (const sku of skus) {
        const rows = demoRows.filter((r) => r.sku === sku);
        const totalUnits = rows.reduce((s, r) => s + r.units, 0);
        const timestamps = rows.map((r) => new Date(r.sale_date).getTime());
        const dataDays = Math.max(
          1,
          Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000),
        );
        map.set(
          sku,
          estimateDemand({ stockDelta: { dailySalesRate: totalUnits / dataDays, dataDays } }),
        );
      }
      setDemandBySku(map);
      return;
    }
    if (userRows.length === 0) {
      setDemandBySku(new Map());
      return;
    }
    let active = true;
    (async () => {
      const stored = await loadDemandEstimates();
      if (!active) return;
      const map = new Map<string, DemandRangeResult>();
      const skus = [...new Set(userRows.map((r) => r.sku))];
      for (const sku of skus) {
        const hit: StoredDemandEstimate | undefined = stored.find((e) => e.sku === sku);
        if (hit) {
          map.set(sku, hit);
          continue;
        }
        const rows = userRows.filter((r) => r.sku === sku);
        const totalUnits = rows.reduce((s, r) => s + r.units, 0);
        const timestamps = rows.map((r) => new Date(r.sale_date).getTime());
        const dataDays = Math.max(
          1,
          Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000),
        );
        map.set(
          sku,
          estimateDemand({ stockDelta: { dailySalesRate: totalUnits / dataDays, dataDays } }),
        );
      }
      setDemandBySku(map);
    })();
    return () => { active = false; };
  }, [demoMode, tenant, userRows, dataVersion]);

  useEffect(() => {
    if (demoMode || !authConfigured) {
      setWatchedVisibility([]);
      return;
    }
    let active = true;
    const marketplace = channel === "combined" ? undefined : channel;
    (async () => {
      const rows = await loadMyWatchedVisibility(marketplace ? { marketplace } : undefined);
      if (active) setWatchedVisibility(rows);
    })();
    return () => { active = false; };
  }, [demoMode, authConfigured, channel, dataVersion, visReload]);

  useEffect(() => {
    setOpenVisibilitySku(null);
  }, [channel]);

  // Re-read from Supabase and re-register after any mutation.
  async function refreshUserData() {
    const { rows, error: loadError } = await loadUserRowsWithStatus();
    setUserDataLoadError(loadError);
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
    setUserDataActionError(null);
    const { error } = await saveUserRows(rows);
    if (error) {
      setUserDataActionError(error);
      setDataBusy(false);
      return;
    }
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
  // demoMode visitors never started a trial (getTrialDaysLeft() has no
  // demoMode awareness and defaults to TRIAL_DAYS=30 whenever no localStorage
  // key exists yet — true for essentially every /demo visitor), so the badge
  // was showing a nonsensical "Ücretsiz deneme · 30 gün kaldı" to people who
  // are just browsing the demo, not on any trial. Keep it null (hidden) in
  // demoMode; it stays real for signed-in users on the actual dashboard.
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  // Marketplaces the user connected during onboarding (client-only localStorage).
  // Read after mount to avoid hydration mismatch.
  const [connectedIds, setConnectedIds] = useState<string[] | null>(null);
  useEffect(() => { setConnectedIds(getConnectedMarketplaces()); }, []);

  // Marketplaces with real (encrypted) credentials on file — only these get a
  // "Refresh" button; CSV/manual/demo connections have nothing to resync.
  // See lib/marketplace-resync.ts — the read side of marketplace_credentials.
  const [resyncableMarketplaces, setResyncableMarketplaces] = useState<string[]>([]);
  const [credentialMeta, setCredentialMeta] = useState<Record<string, ServerCredentialConnection>>({});
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
      if (Array.isArray(result.connections)) {
        const connections = result.connections as ServerCredentialConnection[];
        const meta: Record<string, ServerCredentialConnection> = {};
        for (const c of connections) meta[c.marketplace] = c;
        setCredentialMeta(meta);
        hydrateConnectionsFromServer(connections);
        setConnections(getConnections());
        setConnectedIds(getConnectedMarketplaces());

        // Surface persisted sync failures (cron / webhook) without waiting for a click.
        const fromServer: Record<string, { ok: boolean; message: string }> = {};
        for (const c of connections) {
          if (c.needsReauth) {
            fromServer[c.marketplace] = {
              ok: false,
              message: c.lastSyncError ?? "Yeniden bağlanmanız gerekiyor — kimlik bilgisi reddedildi.",
            };
          } else if (c.lastSyncError) {
            fromServer[c.marketplace] = { ok: false, message: c.lastSyncError };
          } else if (c.lastSyncedAt) {
            fromServer[c.marketplace] = {
              ok: true,
              message: `Son senkron: ${new Date(c.lastSyncedAt).toLocaleString("tr-TR", {
                dateStyle: "short",
                timeStyle: "short",
              })}`,
            };
          }
        }
        if (Object.keys(fromServer).length > 0) {
          setResyncStatus((prev) => ({ ...prev, ...fromServer }));
        }
      }
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
        touchConnectionSynced(marketplaceId);
        setResyncStatus((prev) => ({
          ...prev,
          [marketplaceId]: { ok: true, message: `Senkronize edildi · ${result.rowsSaved} satır` },
        }));
        await refreshUserData();
        await loadResyncableMarketplaces();
      } else {
        if (res.status === 401 || result.authError) {
          markConnectionNeedsReauth(marketplaceId);
        }
        setResyncStatus((prev) => ({
          ...prev,
          [marketplaceId]: { ok: false, message: result.error ?? "Senkronizasyon başarısız." },
        }));
        await loadResyncableMarketplaces();
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
    // Real paid plan (iyzico) — separate from the Stripe/demo-trial row above.
    paidPlan: {
      planId: "starter" | "pro";
      status: string;
      currentPeriodEnd: string | null;
      cancelledAt: string | null;
    } | null;
  }
  const [billingStatus, setBillingStatus] = useState<BillingStatusView | null>(null);
  const [billingStatusError, setBillingStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) return;
    const fromServer = billingStatus?.subscription?.trialEnd;
    if (fromServer) {
      const endMs = new Date(fromServer).getTime();
      if (!Number.isNaN(endMs)) {
        const days = Math.max(0, Math.ceil((endMs - Date.now()) / 86_400_000));
        setTrialDaysLeft(days);
        return;
      }
    }
    setTrialDaysLeft(getTrialDaysLeft());
  }, [demoMode, billingStatus?.subscription?.trialEnd]);

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
  const fin =
    getFinancing(tenant) ??
    getFinancing(USER_TENANT_ID) ??
    (!authConfigured ? getFinancing("seller-b") : undefined);
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

  // Reuses the exact same "Ready" shape components/tools/store/*-page.tsx
  // already render from (built via lib/tools/sku-economics, same as the
  // standalone /araclar/guvenli-fiyat + /araclar/barkod-analizi pages) — so
  // Güvenli Fiyat / Barkod Analizi can live as real tabs INSIDE this shell
  // without forking their logic. demandEstimates is left empty: neither
  // SafePriceStorePage nor BarcodeStorePage reads that field.
  //
  // demoMode never loads userRows from Supabase (see the `if (demoMode)
  // return;` guard above), so without this the two panels would show an
  // honest-but-useless "no data" state in the one place prospective
  // customers actually evaluate the product. seedStoredRowsForTenant bridges
  // the seed seller currently selected in the switcher into the same
  // StoredRow shape a real synced account produces — demo-only, never used
  // for a real signed-in user (userRows still drives everything otherwise).
  const storeToolRows = demoMode ? seedStoredRowsForTenant(tenant) : userRows;
  const storeToolData: Extract<StoreToolState, { status: "ready" }> = useMemo(
    () => ({
      status: "ready",
      view,
      rows: storeToolRows,
      skuEconomics: buildSkuEconomicsMap(storeToolRows),
      demandEstimates: [],
    }),
    [view, storeToolRows]
  );

  // Fırsat Keşfi — real recent-vs-prior-30-day unit momentum per SKU, from the
  // same real rows storeToolData is built from (see lib/tools/opportunity-discovery.ts).
  const skuMomentum = useMemo(() => computeSkuMomentum(storeToolRows), [storeToolRows]);

  // Real trailing-30-day units sold per SKU — the ACTUAL historical figure the
  // marketing promises ("son 30 gün toplam satış adedi"), distinct from the
  // forward-projected demand RANGE. Shown as the headline number on the demand
  // card so the shipped metric matches the promise.
  const last30BySku = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    const m = new Map<string, number>();
    for (const r of storeToolRows) {
      const t = new Date(r.sale_date).getTime();
      if (Number.isFinite(t) && t >= cutoff) {
        m.set(r.sku, (m.get(r.sku) ?? 0) + (r.units ?? 0));
      }
    }
    return m;
  }, [storeToolRows]);

  // "Costs missing" detection — the #1 accuracy gap: a store-API sync stores
  // COGS/shipping/packaging/ad as 0, so unless the seller has entered a cost
  // profile, "true margin" is overstated and the loss alarm never fires. Flag it
  // so the Dashboard can nudge them to the Maliyetler tab. Real users only.
  const costsLookMissing = useMemo(() => {
    if (demoMode) return false;
    if (storeToolRows.length === 0) return false;
    const totalEnteredCost = storeToolRows.reduce(
      (s, r) => s + (r.unit_cost ?? 0) + (r.shipping ?? 0) + (r.packaging ?? 0) + (r.ad_spend ?? 0),
      0,
    );
    return totalEnteredCost <= 0;
  }, [demoMode, storeToolRows]);

  // List quality panel: which SKU's quality panel is currently open (null = none)
  const [openQualityPanelSku, setOpenQualityPanelSku] = useState<string | null>(null);

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
  // Compare belief to engine true margin (not the live ad-spend slider) for honest copy.
  const ptsDelta = belief - view.trueMarginPct;
  const ptsDiff = Math.abs(ptsDelta).toLocaleString("tr-TR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const ptsDiffLabel =
    Math.abs(ptsDelta) < 0.05
      ? "fark yok"
      : ptsDelta > 0
        ? `${ptsDiff} puan yüksek`
        : `${ptsDiff} puan düşük`;

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
  // The Financing tab renders `fin.decision` (the whole-portfolio, Trendyol-only
  // underwriting decision from getFinancing(tenant)/lib/data/seed.ts), NOT
  // `view.decision` (scoped to whichever channel tab happens to be selected,
  // e.g. "combined" or "hepsiburada"). It used to gate on `approved`/`takeRate`
  // above (both view.decision-derived) while displaying fin.decision's money
  // figure — so picking a non-Trendyol channel could show an approved-limit
  // amount from fin.decision paired with a declined/mismatched takeRate, or
  // vice versa. finApproved/finTakeRate keep the Financing tab's gate and its
  // displayed numbers sourced from the SAME decision object.
  const finApproved = (fin?.decision.approvedLimit ?? 0) > 0;
  const finTakeRate = ((fin?.decision.takeRate ?? 0) * 100).toFixed(1);
  const coOurs = ((fin?.report.trueMargin.chargeOffRate ?? 0) * 100).toFixed(1);
  const coInc = ((fin?.report.incumbent.chargeOffRate ?? 0) * 100).toFixed(1);
  const lossRed = Math.round((fin?.report.lossReductionPct ?? 0) * 100);

  // tr-TR locale (thousands separator "."), matching every other money-
  // formatting helper on this page (DashboardSummaryHeader's fmtMoney,
  // LossAlarmBanner, NetProfitLedger, etc.). This used to use "en-US"
  // (thousands separator ","), so the same figure could show as "₺48,760"
  // here and "₺48.760" a few pixels away — a Turkish reader can misread the
  // comma as a decimal point, making the number look wrong even when it's
  // the same value.
  const money = (val: number, cur: string = currency) => {
    const s = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(val)));
    return (cur === "USD" ? "$" : "₺") + s;
  };
  const pctStr = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const channelLabel = (c: Channel) => (c === "combined" ? "Toplam" : MARKETPLACE_LABELS[c].replace(/ \(.*\)/, ""));

  // Dynamic marketplace tabs from the user's connected selection. Only engine-
  // supported marketplaces become live data channels; anything else is shown as a
  // demo "ghost" tab (not clickable) so we never call the engine with a channel it
  // can't compute.
  //
  // With no selection at all, we used to fall back to DEFAULT_DASHBOARD_CHANNELS
  // (all 6 marketplaces we plan to support) for BOTH demo and real users. That
  // rendered every marketplace as a top-bar tab as if it were already connected,
  // even in the demo — where lib/data/seed.ts only ever seeds Trendyol + Amazon
  // (US) + Hepsiburada — and for a real signed-in seller if their browser's
  // localStorage connection record was empty/stale. Tabs should only ever appear
  // for marketplaces there's real data behind, so:
  //   - demoMode falls back to DEMO_DASHBOARD_CHANNELS (exactly what seed.ts has).
  //   - a real signed-in seller with no localStorage record falls back to their
  //     OWN actual data channels (realSellerChannels) — never the full wishlist.
  //   - only when neither applies (a genuinely unauthenticated, non-demo render)
  //     do we fall back to the full DEFAULT_DASHBOARD_CHANNELS wishlist.
  const realSellerChannels: Channel[] = authConfigured ? (getSellerChannels(USER_TENANT_ID) as Channel[]) : [];
  const DEFAULT_CHANNELS: Channel[] = demoMode
    ? [...DEMO_DASHBOARD_CHANNELS]
    : realSellerChannels.length > 0
      ? realSellerChannels
      : [...DEFAULT_DASHBOARD_CHANNELS];
  // `connectedIds` is a client-only (localStorage) record of what THIS browser
  // connected — it can be empty/stale on a different device or after the site
  // data was cleared, even though the user's real data (server-side) covers a
  // different marketplace. Union it with the marketplaces the signed-in seller
  // ACTUALLY has transactions for, so a tab always exists for real data.
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
    const pct = grossRev > 0 ? (value / grossRev) * 100 : 0;
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
  // Two tabs are deliberately excluded for real signed-in users:
  //  • "Sellers" — a multi-seller comparison view, but every real account is
  //    pinned to a single fixed USER_TENANT_ID (lib/supabase/user-data.ts):
  //    no multi-store/portfolio backend exists yet, so it can only ever show
  //    one row for a real user.
  //  • "Financing" — a leftover lending/underwriting ("Aktif Kredi Hattı",
  //    "Stok Finansmanı") demo. TrueMargin is not a licensed lender and this
  //    is not sold anywhere; offering "kredi hattı" unlicensed in Turkey is a
  //    regulatory exposure. Real sellers must never see it.
  // Both stay available ONLY in demo mode (investor/sales preview, seeded with
  // example sellers) where they're representative — never for a real account.
  // Grouped sidebar navigation — sections give the panel a professional
  // information architecture instead of a flat 10+ item list. The internal
  // `id` (currentTab state key) and `labelKey` (i18n) are UNCHANGED; only the
  // presentation is grouped. Section headers are Turkish literals (the launch
  // cohort is Turkish; they're structural dividers, not user content).
  type NavGroup = {
    label: string;
    items: { id: string; labelKey: string; icon: typeof LayoutDashboard }[];
  };
  const navGroups: NavGroup[] = [
    {
      label: "Genel Bakış",
      items: [{ id: "Dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Ürünlerim",
      items: [
        { id: "Products", labelKey: "nav.products", icon: Package },
        { id: "Maliyetler", labelKey: "nav.costs", icon: Coins },
        { id: "GuvenliFiyat", labelKey: "nav.safePrice", icon: ShieldCheck },
        { id: "Barkod", labelKey: "nav.barcode", icon: BarcodeIcon },
        { id: "Verilerim", labelKey: "nav.myData", icon: Database },
      ],
    },
    {
      label: "Finans",
      items: [
        { id: "Nakit", labelKey: "nav.cashFlow", icon: Landmark },
        { id: "Campaign", labelKey: "nav.campaign", icon: Tag },
      ],
    },
    {
      label: "Araçlar",
      items: [
        { id: "Extension", labelKey: "nav.extension", icon: Puzzle },
        { id: "Copilot", labelKey: "nav.copilot", icon: Sparkles },
      ],
    },
    // Demo-only lending/portfolio preview — hidden from real signed-in sellers
    // (see the exclusion rationale in the comment above).
    ...(authConfigured
      ? []
      : [
          {
            label: "Demo",
            items: [
              { id: "Sellers", labelKey: "nav.sellers", icon: Users },
              { id: "Financing", labelKey: "nav.financing", icon: Briefcase },
            ],
          },
        ]),
    {
      label: "Hesap",
      items: [
        { id: "History", labelKey: "nav.history", icon: HistoryIcon },
        { id: "Settings", labelKey: "nav.settings", icon: Settings },
      ],
    },
  ];

  // ── Paket ayrımı (basit, 2 kademe) ─────────────────────────────────────────
  // Başlangıç: temel panel (yukarıdaki listenin geri kalanı).
  // Profesyonel: yukarıdakilere ek olarak bu 3 "ileri" sekme.
  // "Sellers" (Satıcı Portföyü) ve "Financing" (kredi) gerçek kullanıcıya hiç
  // gösterilmiyor (yukarıdaki navItems yorumuna bakın), o yüzden Pro
  // listesinde de yok.
  // Aktif deneme (Stripe veya demo) sırasında ürünü tam haliyle görsün diye
  // deneme = Profesyonel erişimiyle aynı muamele görür (standart SaaS deseni
  // — dönüşümü en üst düzeye çıkarır, deneme planına özel ek karmaşıklık
  // gerektirmez). Gerçek bir iyzico ödemesi olduğunda planId belirleyici olur.
  const PRO_ONLY_TABS = new Set(["Campaign", "Nakit", "Copilot", "Extension"]);
  const trialStillActive =
    billingStatus?.subscription?.status === "trialing" &&
    (!billingStatus.subscription.trialEnd || new Date(billingStatus.subscription.trialEnd).getTime() > Date.now());
  // Infra/billing fetch failure must not silently revoke Pro — treat as unknown.
  const billingUnknown = billingStatusLoaded && !!billingStatusError && !billingStatus;
  const hasProAccess =
    billingUnknown ||
    trialStillActive ||
    (billingStatus?.paidPlan?.status === "active" && billingStatus.paidPlan.planId === "pro");

  // Still waiting on the initial Supabase fetch for a real signed-in user —
  // `view`/`fin` above are the seed fallback for this one frame; never paint
  // that, just show a loading state until the effect resolves.
  if (isLoadingInitialData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">
          <span className="tm-skeleton inline-block h-1.5 w-1.5 rounded-full" aria-hidden />
          Verileriniz yükleniyor — genelde birkaç saniye
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
        <span className="text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">Bağlantı sayfasına yönlendiriliyor…</span>
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
  if (authConfigured && initialDataLoadDone && userDataLoadError && !hasRuntimeSeller(USER_TENANT_ID)) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-zinc-200 font-sans text-lg font-medium">Veriler yüklenemedi</div>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Satış kayıtlarınız okunamadı: {userDataLoadError}. Oturumunuzun açık olduğundan ve veritabanı
            migration&apos;larının uygulandığından emin olun, ardından tekrar deneyin.
          </p>
          <button
            type="button"
            onClick={() => void refreshUserData()}
            className="h-10 px-4 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  const hasNoRealDataYet = authConfigured && initialDataLoadDone && !hasRuntimeSeller(USER_TENANT_ID);
  if (hasNoRealDataYet) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-zinc-200 font-sans text-lg font-medium">Henüz veri yok</div>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Hesabınız kuruldu, ancak gösterilecek gerçek sipariş verisi henüz yok — kayıt sırasında bir
            pazaryeri bağlamak hesabı ilişkilendirir ama geçmiş siparişleri kendiliğinden çekmez. Rakamlarınızı
            burada görmek için bir CSV yükleyin, satışlarınızı elle girin veya gerçek API erişimiyle bir
            pazaryeri bağlayın.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push("/connect?preview=connect")}
              className="h-10 px-4 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors"
            >
              CSV yükle veya pazaryeri bağla
            </button>
            <p className="text-zinc-600 text-[11px]">
              Excel/CSV yükleme ve elle satış girişi de bağlantı ekranındadır.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-rev={dataVersion} data-financial-surface="dark" className="h-screen w-full bg-zinc-950 text-zinc-200 font-sans selection:bg-zinc-800 flex overflow-hidden">
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
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-[0.13em] text-zinc-600 font-semibold">
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-colors ${
                    currentTab === item.id ? "bg-zinc-900 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                  }`}
                >
                  <item.icon size={16} className={currentTab === item.id ? "text-zinc-300" : "text-zinc-600"} />
                  <span>{t(item.labelKey)}</span>
                  {PRO_ONLY_TABS.has(item.id) && !hasProAccess && (
                    <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-amber-400/70 border border-amber-400/20 px-1 py-0.5">
                      Pro
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        {(() => {
          // Real signed-in seller's own identity — never the old hardcoded
          // "Underwriting desk / Team" lending-demo placeholder.
          const displayName = authConfigured
            ? (account?.company || account?.email || "Hesabım")
            : "Demo hesabı";
          const secondary = authConfigured
            ? (account?.company && account?.email ? account.email : "Hesap")
            : "Örnek veri";
          const initials = (account?.company || account?.email || "TM")
            .trim()
            .split(/[\s@.]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "")
            .join("") || "TM";
          return (
            <button
              type="button"
              onClick={() => setCurrentTab("Settings")}
              className="p-4 border-t border-zinc-900 m-3 mb-4 rounded-sm flex items-center gap-3 text-left hover:bg-zinc-900/50 transition-colors w-[calc(100%-1.5rem)]"
            >
              <div className="w-8 h-8 bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-400 text-xs font-mono">{initials}</div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-zinc-300 font-medium truncate">{displayName}</span>
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono truncate">{secondary}</span>
              </div>
            </button>
          );
        })()}
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
                Toplam
              </button>
            )}
            {/* Demo (no adapter yet) — visible but not selectable */}
            {ghostOptions.map((o) => (
              <span
                key={o.id}
                title="Bağlı · hakediş senkronizasyonu yakında (demo)"
                className="pb-[18px] pt-[20px] text-zinc-700 cursor-default inline-flex items-center gap-1.5"
              >
                {o.label}
                <span className="text-[9px] uppercase tracking-widest border border-zinc-800 px-1 py-0.5 leading-none">yakında</span>
              </span>
            ))}
          </div>

            {/* Ekip erişimi — sahibin verisi salt-okunur görüntüleniyor uyarısı */}
            {viewingOwnerId && (
              <span className="inline-flex items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-mono text-amber-300">
                <span className="w-1.5 h-1.5 bg-amber-400" />
                {viewingOwnerLabel} · salt-okunur görüntüleniyor
                <button type="button" onClick={stopViewingOwnerData} className="underline hover:text-amber-200">
                  çık
                </button>
              </span>
            )}

            {/* Free-trial indicator */}
            {trialDaysLeft !== null && (
              <span className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-[11px] font-mono tabular-nums text-zinc-400">
                <span className={`w-1.5 h-1.5 ${trialDaysLeft > 0 ? "fin-dot-profit" : "fin-dot-loss"}`} />
                {trialDaysLeft > 0
                  ? `Ücretsiz deneme · ${trialDaysLeft} gün kaldı`
                  : "Deneme süresi bitti"}
              </span>
            )}
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto w-full relative">
          {/* VIEW: DASHBOARD */}
          {currentTab === "Dashboard" && (
            <div className="max-w-[1300px] mx-auto px-8 py-12 md:py-20">
              {costsLookMissing && (
                <button
                  type="button"
                  onClick={() => setCurrentTab("Maliyetler")}
                  className="w-full mb-8 flex items-start gap-3 border border-amber-500/30 bg-amber-500/[0.07] px-5 py-4 text-left hover:bg-amber-500/[0.12] transition-colors"
                >
                  <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-amber-200">
                      Maliyetleriniz eksik — kârınız olduğundan yüksek görünüyor
                    </span>
                    <span className="block text-[12px] text-amber-200/70 mt-0.5">
                      Alış fiyatı, kargo, ambalaj ve iade oranını girene kadar gerçek net kâr ve zarar
                      alarmları doğru hesaplanamaz. Maliyet Merkezi'ne gidin →
                    </span>
                  </span>
                </button>
              )}
              <MarketplaceMarginStrip view={view} currency={currency} pctStr={pctStr} />

              {/* Yeni hesaplar için başlangıç kontrol listesi — tüm adımlar
                  tamamlanınca veya kullanıcı kapatınca kendiliğinden gizlenir. */}
              <OnboardingChecklist
                authConfigured={authConfigured}
                hasMarketplaceConnected={dataChannels.length > 0}
                hasRealData={view.skus.length > 0}
                onConnect={() => router.push("/connect?preview=connect")}
                onGoToData={() => setCurrentTab("Verilerim")}
                onGoToSettlement={() => setCurrentTab("Dashboard")}
                onGoToProducts={() => setCurrentTab("Products")}
              />

              {/* 3-30-300 hero header — spec §6: 3-second overview */}
              <DashboardSummaryHeader skus={view.skus} currency={currency} />

              {/* Fırsat Keşfi — real per-SKU momentum from the seller's own sales
                  history (see lib/tools/opportunity-discovery.ts for why this is
                  scoped to "your own products", not a market-wide trend feed). */}
              <OpportunityDiscoveryCard momentum={skuMomentum} onGoToProducts={() => setCurrentTab("Products")} />

              <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
                <FinancialSummaryWidget
                  view={view}
                  marginPercent={marginPercent}
                  belief={belief}
                  ptsDiff={ptsDiff}
                  ptsDiffLabel={ptsDiffLabel}
                  netContribution={netContribution}
                  grossRev={grossRev}
                  commission={commission}
                  vat={vat}
                  shipping={shipping}
                  returns={returns}
                  payment={payment}
                  cogs={cogs}
                  adSpendVal={adSpendVal}
                  onAdSpendChange={setAdSpendVal}
                  currency={currency}
                  authConfigured={authConfigured}
                  money={money}
                  pctStr={pctStr}
                  channelLabel={channelLabel}
                />

                {/* RIGHT COLUMN */}
                <div className="w-full lg:w-5/12 flex flex-col lg:pl-4">
                  {/* Underwriting Card */}
                  <div className="mb-14 border border-zinc-800 bg-zinc-900/20 p-6 lg:p-8">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">Karar</h3>
                        <div className={`text-3xl font-mono tracking-tight ${approved ? "text-zinc-100" : "text-zinc-100"}`}>
                          {approved ? money(view.decision.approvedLimit) : "Reddedildi"}
                        </div>
                      </div>
                      <div className="text-right">
                        <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">Kesinti oranı</h3>
                        <div className={`text-3xl font-mono ${approved ? "text-zinc-100" : "text-zinc-700"}`}>{approved ? `${takeRate}%` : "—"}</div>
                      </div>
                    </div>
                    <div className="flex justify-between border-t border-zinc-800 pt-5 font-mono text-sm mb-3">
                      <span className="text-zinc-400">Aylık katkı</span>
                      <span className={view.inputs.trailingMonthlyContribution >= 0 ? "text-zinc-100 tabular-nums" : "fin-loss tabular-nums"}>
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
                      Fiyatlandırma cirodan değil gerçek marjdan yapılır.
                    </div>
                  </div>

                  {/* ── SKU Tablosu — spec §6: 3-30-300, kademeli açıklama ── */}
                  <div className="mb-14">
                    {/* 3-30-300: 30 sn'de hangi ürünler sorunlu — zarar edenler üstte */}
                    {(() => {
                      const lossSkus  = view.skus.filter((s) => s.trueMarginPct < 0);
                      // LossAlarmBanner's totalRisk is money (sum of |netContribution| for
                      // loss SKUs) — summing trueMarginPct here was a real bug: it silently
                      // rendered a percentage-points number through a ₺-formatter, showing
                      // e.g. "Toplam risk: ₺9,56" for a seller whose actual loss was tens of
                      // thousands of TRY.
                      const totalRisk = lossSkus.reduce((sum, s) => sum + Math.abs(s.netContribution), 0);
                      return lossSkus.length > 0 ? (
                        <div className="mb-4">
                          <LossAlarmBanner
                            lossSkuCount={lossSkus.length}
                            totalRisk={totalRisk}
                            currency={currency}
                          />
                        </div>
                      ) : null;
                    })()}

                    <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                      <h3
                        className="text-[10px] uppercase tracking-[0.2em] font-sans"
                        style={{ color: "var(--tm-ink)", opacity: 0.5 }}
                      >
                        SKU Birim Ekonomisi
                      </h3>
                      {/* Görünürlük taraması — kendi ürünlerinizin pazaryeri arama
                          sırasını canlı tarar (yalnızca tekil pazaryeri sekmesinde). */}
                      {!demoMode && channel !== "combined" && (
                        <div className="flex items-center gap-2">
                          {visScan.msg && (
                            <span
                              className="text-[11px]"
                              style={{ color: visScan.status === "error" ? "var(--tm-alert-clay)" : "var(--tm-ink)", opacity: visScan.status === "error" ? 0.9 : 0.5 }}
                            >
                              {visScan.msg}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={runVisibilityScan}
                            disabled={visScan.status === "scanning"}
                            className="h-7 px-3 text-[11px] font-medium border rounded-[var(--tm-r-data)] transition-colors disabled:opacity-50"
                            style={{ borderColor: "color-mix(in srgb, var(--tm-ink) 20%, transparent)", color: "var(--tm-ink)" }}
                            title="Bu pazaryerindeki ürünlerinizin arama sonuçlarındaki sırasını tarar. 15–60 saniye sürebilir."
                          >
                            {visScan.status === "scanning" ? "Taranıyor…" : "Görünürlüğü tara"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-sm font-mono w-full">
                      {/* Header row */}
                      <div
                        className="flex w-full pb-2 mb-1 text-[10px] uppercase tracking-[0.1em]"
                        style={{
                          borderBottom: "1px solid var(--tm-mist)",
                          color: "var(--tm-ink)",
                          opacity: 0.45,
                        }}
                      >
                        <div className="w-5/12">SKU</div>
                        <div className="w-3/12 text-right">Algılanan</div>
                        <div className="w-4/12 text-right">Gerçek</div>
                      </div>

                      {/* Zarar edenler üstte (spec §6 — zararlılar önce) */}
                      {[...view.skus]
                        .sort((a, b) => a.trueMarginPct - b.trueMarginPct)
                        .map((sku) => {
                          const isLoss = sku.trueMarginPct < 0;
                          const vis = pickWatchedVisibility(
                            watchedVisibility,
                            sku.sku,
                            view.channel,
                          );
                          return (
                            <div
                              key={sku.sku}
                              className="flex w-full items-start py-2.5 transition-colors"
                              style={{
                                borderBottom: "1px solid color-mix(in srgb, var(--tm-mist) 60%, transparent)",
                              }}
                            >
                              {/* SKU adı + etiketler */}
                              <div className="w-5/12 pr-3">
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="truncate text-[12px] lg:text-[13px]"
                                    style={{ color: "var(--tm-ink)" }}
                                  >
                                    {sku.sku}
                                  </div>
                                  {(() => {
                                    const productTitle = productTitleForSku(storeToolRows, sku.sku);
                                    const qualityScore = computeListQuality({
                                      title: productTitle,
                                      categoryName: sku.category,
                                      sku: sku.sku,
                                      returnRatePct: sku.returnRatePct,
                                      imageCount: undefined,
                                    });
                                    return (
                                      <ListQualityBadge
                                        score={qualityScore}
                                        compact={true}
                                        onClick={() =>
                                          setOpenQualityPanelSku(
                                            openQualityPanelSku === sku.sku ? null : sku.sku
                                          )
                                        }
                                      />
                                    );
                                  })()}
                                  {vis && (
                                      <VisibilityRankBadge
                                        row={vis}
                                        onClick={() =>
                                          setOpenVisibilitySku(
                                            openVisibilitySku === sku.sku ? null : sku.sku
                                          )
                                        }
                                      />
                                  )}
                                </div>
                                {/* Quality panel — shown when badge is clicked */}
                                {openQualityPanelSku === sku.sku && (() => {
                                  const productTitle = productTitleForSku(storeToolRows, sku.sku);
                                  const qualityScore = computeListQuality({
                                    title: productTitle,
                                    categoryName: sku.category,
                                    sku: sku.sku,
                                    returnRatePct: sku.returnRatePct,
                                    imageCount: undefined,
                                  });
                                  return (
                                    <div className="mt-2">
                                      <ListQualityPanel
                                        sku={productTitle}
                                        score={qualityScore}
                                        onClose={() => setOpenQualityPanelSku(null)}
                                      />
                                    </div>
                                  );
                                })()}
                                {demandBySku.get(sku.sku) && (
                                  <div className="mt-2 max-w-sm">
                                    <DemandEstimateCard
                                      sku={productTitleForSku(storeToolRows, sku.sku)}
                                      estimate={demandBySku.get(sku.sku)!}
                                      last30Units={last30BySku.get(sku.sku)}
                                    />
                                  </div>
                                )}
                                {openVisibilitySku === sku.sku && vis && (
                                    <div className="mt-2">
                                      <VisibilityPanel
                                        row={vis}
                                        onClose={() => setOpenVisibilitySku(null)}
                                      />
                                    </div>
                                )}
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {sku.isSilentLoser && (
                                    <SkuLossTag level="silent-loss" />
                                  )}
                                  {isLoss && !sku.isSilentLoser && (
                                    <SkuLossTag level="loss" />
                                  )}
                                  {sku.isReturnRisk && (
                                    <>
                                      <SkuLossTag level="return-risk" />
                                      <span
                                        className="text-[9px] font-mono tnum"
                                        style={{ color: "var(--tm-alert-clay)" }}
                                      >
                                        {sku.returnRatePct.toFixed(1)}%
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Algılanan marj */}
                              <div
                                className="w-3/12 text-right tnum text-[12px]"
                                style={{ color: "var(--tm-ink)", opacity: 0.5 }}
                              >
                                {pctStr(sku.perceivedMarginPct)}
                              </div>

                              {/* Gerçek marj — renk kodlu */}
                              <div className="w-4/12 text-right">
                                <span
                                  className="tnum text-[13px] font-semibold"
                                  style={{
                                    color: isLoss
                                      ? "var(--tm-alert-clay)"
                                      : "var(--tm-ledger-green)",
                                  }}
                                >
                                  {pctStr(sku.trueMarginPct)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Insight — highest-impact silent-loser SKU, at most one card */}
                  {silentLoserInsight && (
                    <div className="mb-14 border border-zinc-800 bg-zinc-900/20 px-5 py-4">
                      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-2">İçgörü</div>
                      <p className="text-[13px] text-zinc-300 leading-relaxed">
                        <span className="text-zinc-100 font-medium">{silentLoserInsight.sku}</span> sessiz zarar ediyor.
                        Bu ürünü çıkarırsan tahmini limit etkisi:{" "}
                        <span className="fin-profit font-mono tabular-nums">
                          +{money(silentLoserInsight.limitDelta, silentLoserInsight.currency)}
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Backtest Comparison — for a real signed-in user this replays both models
                      against THEIR OWN data (fin.isSelfBacktest), not the 3-seller seed
                      portfolio; low history months gets an explicit low-sample warning
                      instead of a face-value charge-off percentage. */}
                  {fin && (
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">Geçmiş Test Karşılaştırması</h3>
                      <span className="bg-zinc-900 text-zinc-500 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800">
                        {fin.isSelfBacktest ? `N=1 · ${fin.historyMonths} aylık geçmiş` : "N=3"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800">
                      <div className="bg-zinc-950 p-4 lg:p-6">
                        <div className="text-zinc-500 font-sans text-xs mb-4">TrueMargin</div>
                        <div className="text-xl lg:text-2xl font-mono text-zinc-100 mb-1 tabular-nums">{coOurs}%</div>
                        <div className="text-zinc-600 text-[10px] lg:text-[11px] font-mono tracking-wide uppercase">zarar oranı</div>
                      </div>
                      <div className="bg-zinc-950 p-4 lg:p-6">
                        <div className="text-zinc-500 font-sans text-xs mb-4">Mevcut Yöntem</div>
                        <div className="text-xl lg:text-2xl font-mono text-zinc-600 mb-1 tabular-nums">{coInc}%</div>
                        <div className="text-zinc-700 text-[10px] lg:text-[11px] font-mono tracking-wide uppercase">zarar oranı</div>
                      </div>
                    </div>
                    {fin.isSelfBacktest && fin.historyMonths < LOW_SAMPLE_HISTORY_MONTHS ? (
                      <div className="mt-4 text-xs text-amber-400/90 font-mono tracking-wide leading-relaxed">
                        Sınırlı veri (N={fin.historyMonths} ay) — bu sonuçlar öngörücü değil, bilgilendirici. Güvenilir bir
                        zarar oranı için en az {LOW_SAMPLE_HISTORY_MONTHS} aylık gerçek sipariş geçmişi gerekir.
                      </div>
                    ) : (
                      <div className="mt-4 text-xs fin-profit/80 font-mono tracking-wide flex items-center gap-3">
                        <span className="fin-profit">↓</span> %{lossRed} daha az zarar
                        {fin.isSelfBacktest && <span className="text-zinc-600">· kendi verin, {fin.historyMonths} aylık geçmiş</span>}
                      </div>
                    )}
                  </div>
                  )}
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
                actionError={userDataActionError}
                onUpload={handleUserUpload}
                onDeleteRow={handleUserDeleteRow}
                onClear={handleUserClear}
              />
            </div>
          )}

          {/* VIEW: MALİYETLER — per-SKU cost profile editor (COGS, shipping,
              packaging, ad, return rate). Fills the gaps a marketplace API can't
              know, so gerçek net kâr + zarar alarmı are actually correct. */}
          {currentTab === "Maliyetler" && (
            <div className="max-w-[1100px] mx-auto px-8 py-12 md:py-16">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-8 border-l border-zinc-800 pl-4">
                Maliyet Merkezi
              </h2>
              <ProductCostEditor rows={storeToolRows} onSaved={refreshUserData} />
            </div>
          )}

          {/* VIEW: GÜVENLİ FİYAT — same component as the standalone /araclar/guvenli-fiyat
              page, now living inside the shell instead of a separate marketing-chrome
              page. Reuses storeToolData (built above from the same real userRows this
              whole dashboard already renders from) rather than forking the logic. */}
          {currentTab === "GuvenliFiyat" && (
            <PriceTrackerResults data={storeToolData} />
          )}

          {/* VIEW: BARKOD ANALİZİ — same as /araclar/barkod-analizi, moved into the shell. */}
          {currentTab === "Barkod" && (
            <div className="max-w-[1100px] mx-auto px-8 py-12 md:py-16">
              {storeToolData.skuEconomics.size === 0 ? (
                <p className="text-zinc-600 font-mono text-[12px]">
                  Henüz veri yok — Verilerim sekmesinden yükleyin veya mağaza bağlayın.
                </p>
              ) : (
                <div className="bg-[var(--tm-paper)] text-[var(--tm-ink)] rounded-[var(--tm-r-ui)] p-6 md:p-8">
                  <BarcodeStorePage data={storeToolData} onRefresh={async () => { if (typeof window !== "undefined") window.location.reload(); }} />
                </div>
              )}
            </div>
          )}

          {/* VIEW: EXTENSION — Chrome uzantısı hesap bağlantısı (personal access token).
              Profesyonel'e özel — en pahalı pakete eklenen özellik. */}
          {currentTab === "Extension" && !hasProAccess && (
            <ProFeatureLock feature="Chrome Uzantısı" onUpgrade={() => setCurrentTab("Settings")} />
          )}
          {currentTab === "Extension" && hasProAccess && (
            <div className="max-w-[700px] mx-auto px-8 py-12 md:py-16">
              <h2 className="text-zinc-200 font-sans text-lg font-medium mb-2">Chrome Uzantısı</h2>
              <p className="text-zinc-500 font-mono text-[12px] leading-relaxed mb-6">
                Trendyol / Hepsiburada partner panelinde çalışan uzantı, hesabınızı bağladığınızda
                elle veri girmek yerine gerçek maliyet ve satış verinizden hesaplanan net kârı
                gösterir.{" "}
                <a href="/urunler#uzanti" className="text-[var(--tm-copper)] underline">
                  Uzantıyı indirin
                </a>
                .
              </p>
              <ExtensionTokenPanel />
            </div>
          )}

          {/* VIEW: CAMPAIGN — campaign discount simulator, live recompute via engine */}
          {currentTab === "Campaign" && !hasProAccess && (
            <ProFeatureLock feature="Kampanya Simülatörü" onUpgrade={() => setCurrentTab("Settings")} />
          )}
          {currentTab === "Campaign" && view && hasProAccess && (
            <div className="max-w-[1100px] mx-auto px-8 py-12 md:py-20">
              <CampaignSimulator
                tenantId={view.tenantId}
                channel={view.channel}
                currency={view.currency}
              />
            </div>
          )}

          {/* VIEW: NAKIT — cash-flow projection from seed transaction data */}
          {currentTab === "Nakit" && !hasProAccess && (
            <ProFeatureLock feature="Nakit Akışı" onUpgrade={() => setCurrentTab("Settings")} />
          )}
          {currentTab === "Nakit" && view && hasProAccess && (
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
              {/* "Stok Finansmanı" SKU action is a lending-demo leftover —
                  only wire it in demo mode, never for a real seller. */}
              <SkuProfitabilityHeatmap
                skus={view.skus}
                tenantId={view.tenantId}
                channel={view.channel}
                onGoToFinancing={authConfigured ? undefined : () => setCurrentTab("Financing")}
              />
            </div>
          )}

          {/* VIEW: SELLERS — demo-mode-only (see navItems' comment above), never
              shown to a real signed-in seller. */}
          {currentTab === "Sellers" && !authConfigured && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-12 border-l border-zinc-800 pl-4">Satıcı Portföyü</h2>
              <div className="text-sm font-mono w-full">
                <div className="flex w-full border-b border-zinc-900 pb-3 mb-3 text-zinc-600 text-[10px] uppercase tracking-[0.1em]">
                  <div className="w-4/12">Satıcı</div>
                  <div className="w-4/12 text-right">Algılanan</div>
                  <div className="w-4/12 text-right">Gerçek</div>
                </div>
                {sellers.map((s) => (
                  <button
                    key={s.tenantId}
                    onClick={() => { setTenant(s.tenantId); setCurrentTab("Dashboard"); }}
                    className="flex w-full items-center py-3 border-b border-zinc-900/50 hover:bg-zinc-900/30 transition-colors text-left"
                  >
                    <div className="w-4/12 text-zinc-300 text-[13px]">{s.label} <span className="text-zinc-600 ml-2 text-[11px]">{s.category}</span></div>
                    <div className="w-4/12 text-right text-zinc-500 tabular-nums">{pctStr(s.perceivedMarginPct)}</div>
                    <div className={`w-4/12 text-right tabular-nums ${s.trueMarginPct >= 0 ? "fin-profit" : "fin-loss"}`}>{pctStr(s.trueMarginPct)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: FINANCING — DEMO/INVESTOR SURFACE ONLY (never rendered for a
              real signed-in seller: it's a leftover lending/underwriting demo,
              TrueMargin is not a licensed lender — see navItems comment). Gated
              on !authConfigured so a real account can never reach it even by
              manipulating currentTab. */}
          {currentTab === "Financing" && !authConfigured && fin && (
            <div className="max-w-[1200px] mx-auto px-8 py-12 md:py-20">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-2 border-l border-zinc-800 pl-4">
                {t("financing.activeCreditLine", { seller: view.label })}
              </h2>
              <p className="mb-12 pl-4 text-[11px] text-zinc-600 font-mono">
                Trendyol portföy modeli — kanal seçicisinden bağımsız (demo underwriting)
              </p>

              <div className="grid gap-16 lg:grid-cols-2 mb-20">
                {/* LEFT: the unlock */}
                <section>
                  <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">
                    {finApproved ? t("financing.approvedLimit") : t("financing.underwritingDecision")}
                  </h3>
                  <div className={`font-mono text-6xl tracking-tight tabular-nums ${finApproved ? "text-zinc-100" : "fin-loss"}`}>
                    {finApproved ? money(fin.decision.approvedLimit) : t("financing.declined")}
                  </div>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-500">
                    {finApproved
                      ? t("financing.approvedCopy", { rate: finTakeRate })
                      : t("financing.declinedCopy", { amount: money(fin.incumbentDecision.approvedLimit) })}
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
                        N=1 · {fin.historyMonths} aylık geçmiş
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 mt-4">
                    <div className="bg-zinc-950 p-4 lg:p-5">
                      <div className="text-zinc-400 font-sans text-xs mb-3">{t("financing.trueMargin")}</div>
                      <dl className="space-y-1.5 text-sm font-mono">
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.limit")}</dt><dd className="tabular-nums text-zinc-200">{money(fin.decision.approvedLimit)}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.takeRate")}</dt><dd className="tabular-nums text-zinc-200">{finApproved ? `${finTakeRate}%` : "—"}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.outcome")}</dt><dd className={fin.ourOutcome.impaired ? "fin-loss" : "fin-profit"}>{fin.ourOutcome.isLoan ? (fin.ourOutcome.impaired ? t("financing.impaired") : t("financing.performing")) : t("financing.declined")}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.simLoss")}</dt><dd className="tabular-nums text-zinc-200">{money(fin.ourOutcome.loss)}</dd></div>
                      </dl>
                    </div>
                    <div className="bg-zinc-950 p-4 lg:p-5">
                      <div className="text-zinc-500 font-sans text-xs mb-3">{t("financing.incumbent")}</div>
                      <dl className="space-y-1.5 text-sm font-mono">
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.limit")}</dt><dd className="tabular-nums text-zinc-400">{money(fin.incumbentDecision.approvedLimit)}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.takeRate")}</dt><dd className="tabular-nums text-zinc-400">{(fin.incumbentDecision.takeRate * 100).toFixed(1)}%</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.outcome")}</dt><dd className={fin.incumbentOutcome.impaired ? "fin-loss" : "text-zinc-400"}>{fin.incumbentOutcome.isLoan ? (fin.incumbentOutcome.impaired ? t("financing.impaired") : t("financing.performing")) : t("financing.declined")}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">{t("financing.simLoss")}</dt><dd className="tabular-nums text-zinc-400">{money(fin.incumbentOutcome.loss)}</dd></div>
                      </dl>
                    </div>
                  </div>
                  {fin.isSelfBacktest && fin.historyMonths < LOW_SAMPLE_HISTORY_MONTHS ? (
                    <div className="mt-4 text-xs text-amber-400/90 font-mono tracking-wide leading-relaxed">
                      {t("financing.limitedData", { months: fin.historyMonths })}
                    </div>
                  ) : (
                    <div className="mt-4 text-xs fin-profit/80 font-mono tracking-wide flex items-center gap-3">
                      <span className="fin-profit">↓</span>{" "}
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
                    <div className="text-2xl font-mono tabular-nums text-zinc-100">
                      {portfolio.gmvCoveragePct == null ? "—" : `${portfolio.gmvCoveragePct.toFixed(0)}%`}
                    </div>
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
                      <div className={`w-1/12 text-right ${b.meetsTarget ? "fin-profit" : "text-amber-400"}`}>
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
                <span className="bg-zinc-900 fin-profit/80 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800">{t("history.immutable")}</span>
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
                        <div className="w-3/12 text-zinc-500 text-[11px] tabular-nums">{new Date(l.recordedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
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

              {/* Haftalık kâr özeti — isteğe bağlı, varsayılan kapalı (0035 migration). */}
              {authConfigured && (
                <div className="mt-8 border border-zinc-900 bg-zinc-950/50 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-1.5">
                        Haftalık kâr özeti
                      </div>
                      <p className="text-zinc-500 text-[12px] font-mono max-w-sm">
                        Her hafta e-posta ile gerçek marjınızı, en çok zarar eden ürünlerinizi ve hakediş
                        durumunuzu özetleyen bir mesaj alın.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = !digestEnabled;
                        setDigestEnabled(next);
                        const { error } = await setWeeklyDigestEnabled(next);
                        if (error) {
                          setDigestEnabled(!next);
                          setDigestError(error);
                        } else {
                          setDigestError("");
                        }
                      }}
                      disabled={!digestLoaded}
                      className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-40 ${
                        digestEnabled ? "bg-[var(--tm-copper)]" : "bg-zinc-800"
                      }`}
                      aria-pressed={digestEnabled}
                      title={digestEnabled ? "Kapat" : "Aç"}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-zinc-100 transition-transform ${
                          digestEnabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                  {digestError && <p className="fin-loss text-[11px] font-mono mt-2">{digestError}</p>}
                </div>
              )}

              <TeamAccessPanel
                authConfigured={authConfigured}
                viewingOwnerId={viewingOwnerId}
                onViewOwner={viewOwnerData}
                onStopViewing={stopViewingOwnerData}
              />
              {teamDataError && <p className="fin-loss text-[11px] font-mono mt-2">{teamDataError}</p>}

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
                  <p className="fin-loss font-mono text-[12px]">{billingStatusError}</p>
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
                      <span className={billingStatus.stripeConfigured ? "fin-profit" : "text-amber-400"}>
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

              {authConfigured && billingStatus && (
                <UpgradePlanPanel paidPlan={billingStatus.paidPlan} onChanged={loadBillingStatus} />
              )}

              <ConnectedStores
                authConfigured={authConfigured}
                displayedConnections={displayedConnections}
                resyncableMarketplaces={resyncableMarketplaces}
                credentialMeta={credentialMeta}
                resyncBusy={resyncBusy}
                resyncStatus={resyncStatus}
                disconnectStatus={disconnectStatus}
                disconnectTarget={disconnectTarget}
                disconnectBusy={disconnectBusy}
                onDisconnectRequest={setDisconnectTarget}
                onDisconnectCancel={() => setDisconnectTarget(null)}
                onDisconnectConfirm={confirmDisconnect}
                onResync={handleResync}
              />

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
            </div>
          )}

          {/* VIEW: COPILOT — Analyst Copilot tab, streaming from /api/chat (grounded via lib/engine) */}
          {currentTab === "Copilot" && !hasProAccess && (
            <ProFeatureLock feature="Copilot" onUpgrade={() => setCurrentTab("Settings")} />
          )}
          {currentTab === "Copilot" && hasProAccess && (
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
                    const level =
                      m.mode === "rule-based"
                        ? ("high" as const)
                        : m.mode === "model-error"
                          ? ("low" as const)
                          : ("medium" as const);
                    const why =
                      m.mode === "rule-based"
                        ? "Bu yanıt, dil modeli tahmini değil; satıcınızın karar/veri motorundaki deterministik kurallardan üretildi."
                        : m.mode === "model-error"
                          ? "Dil modeli yanıt veremedi; sistem kural tabanlı yedek yola düştü. Sonuçları kendi verilerinizle doğrulayın."
                          : "Bu yanıt, satıcınızın panel verisine dayanan bir dil modeli özetidir; kesin muhasebe kaydı değildir.";
                    return (
                      <div key={i} className="flex flex-col gap-3">
                        <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-mono flex items-center gap-3">
                          {t("copilot.analysis")} <span className="h-px bg-zinc-900 flex-1"></span>
                        </div>
                        <div className="text-zinc-400 text-sm leading-relaxed">
                          {isPending && !m.content && <p className="text-zinc-500">{t("copilot.readingDecisionData")}</p>}
                          {m.content && !isPending && (
                            <AiConfidenceBlock
                              level={level}
                              why={why}
                              limitedData={m.mode === "model-error"}
                              aiLabel={m.mode === "rule-based" ? "Kural tabanlı" : "AI Destekli"}
                              sheetTitle={`${view.label} — Copilot karar mantığı`}
                              factors={[
                                {
                                  label: "Kaynak satıcı verisi",
                                  weight: 1,
                                  effect: view.label,
                                  direction: "neutral" as const,
                                },
                                {
                                  label: "Kanal",
                                  weight: 0.7,
                                  effect: channelLabel(view.channel),
                                  direction: "neutral" as const,
                                },
                                {
                                  label: "Yanıt modu",
                                  weight: m.mode === "rule-based" ? 0.95 : m.mode === "model-error" ? 0.35 : 0.6,
                                  effect: m.mode ?? "bilinmiyor",
                                  direction:
                                    m.mode === "rule-based"
                                      ? ("up" as const)
                                      : m.mode === "model-error"
                                        ? ("down" as const)
                                        : ("neutral" as const),
                                },
                              ]}
                              how={
                                <ul className="list-disc space-y-1 pl-4">
                                  <li>Kaynak satıcı: {view.label}</li>
                                  <li>Kanal: {channelLabel(view.channel)}</li>
                                  <li>Mod: {m.mode ?? "bilinmiyor"}</li>
                                </ul>
                              }
                            >
                              <p className="whitespace-pre-line text-zinc-300">{m.content}</p>
                            </AiConfidenceBlock>
                          )}
                          {m.content && isPending && (
                            <p className="whitespace-pre-line">
                              {m.content}
                              <span className="ml-1 inline-block h-4 w-1.5 align-middle bg-zinc-500 opacity-70" />
                            </p>
                          )}
                          {m.content && !isPending && (
                            <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-600">
                              <span>{t("copilot.groundedIn", { seller: view.label })}</span>
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
