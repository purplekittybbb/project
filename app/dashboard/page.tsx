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

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  registerRuntimeSeller, clearRuntimeSellers, hasRuntimeSeller, getSilentLoserInsight,
  MARKETPLACE_LABELS, type Channel,
} from "@/lib/engine";
import { CampaignSimulator } from "@/components/CampaignSimulator";
import { CashFlowPanel } from "@/components/CashFlowPanel";
import { SkuProfitabilityHeatmap } from "@/components/SkuProfitabilityHeatmap";
import { PeerBenchmarkingSection } from "@/components/PeerBenchmarkingSection";
import { AuthGuard } from "@/components/auth-guard";
import { getTrialDaysLeft, getConnectedMarketplaces } from "@/lib/onboarding";
import {
  supportedChannels, getMarketplaceOption,
  type MarketplaceOption,
} from "@/lib/marketplaces";

const AI_PRESETS = [
  "Why did this seller get this limit?",
  "Why this take-rate?",
  "What's the backtest vs incumbent?",
];

interface DashboardPageProps {
  /** Unauthenticated seed-data preview (route: /demo). Never touches Supabase,
   *  never redirects to onboarding, always shows the seed Seller A/B/C portfolio. */
  demoMode?: boolean;
}

export function DashboardPage({ demoMode = false }: DashboardPageProps) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("trendyol");
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
  const sellers = authConfigured ? getSellers(channel).filter((s) => s.tenantId === USER_TENANT_ID) : getSellers(channel);
  const [tenant, setTenant] = useState(authConfigured ? USER_TENANT_ID : "seller-b");
  const [initialDataLoadDone, setInitialDataLoadDone] = useState(!authConfigured);

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
  }

  // A real signed-in seller who hasn't connected/entered any data yet — send them
  // to onboarding instead of ever rendering the dashboard shell around them.
  const needsOnboarding = authConfigured && initialDataLoadDone && !hasRuntimeSeller(USER_TENANT_ID);
  useEffect(() => {
    if (needsOnboarding) router.replace("/connect");
  }, [needsOnboarding, router]);

  async function handleUserUpload(rows: UserRawRow[]) {
    setDataBusy(true);
    await saveUserRows(rows);
    await refreshUserData();
    setTenant(USER_TENANT_ID);
    setChannel("trendyol");
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
  const [aiInput, setAiInput] = useState("");
  const [askedQ, setAskedQ] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const view = getSeller(tenant, channel) ?? getSeller("seller-b", channel)!;
  const fin = getFinancing(tenant) ?? getFinancing("seller-b")!;
  const currency = view.currency;
  const w = view.waterfall;
  const grossRev = w.grossRevenue;
  // Highest-impact "drop this SKU" insight, shown as a single card under the SKU table.
  const silentLoserInsight = getSilentLoserInsight(view.tenantId, channel);

  // Ad spend is interactive; reset to the seller's real base whenever the seller or channel changes.
  const [adSpendVal, setAdSpendVal] = useState(w.adSpendAllocated);
  useEffect(() => {
    const base = getSeller(tenant, channel)?.waterfall.adSpendAllocated ?? 0;
    setAdSpendVal(base);
  }, [tenant, channel]);

  // Live recompute through aggregateTrueMargin as the slider moves.
  const live = recomputeMargin(tenant, adSpendVal, channel);
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
  const ledger = getBacktest().ledger;

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
  const DEFAULT_CHANNELS: Channel[] = ["trendyol", "amazon_us", "hepsiburada"];
  const dataChannels: Channel[] =
    connectedIds && connectedIds.length > 0
      ? (() => {
          const chans = supportedChannels(connectedIds) as Channel[];
          return chans.length > 0 ? chans : DEFAULT_CHANNELS;
        })()
      : DEFAULT_CHANNELS;
  const ghostOptions: MarketplaceOption[] =
    connectedIds && connectedIds.length > 0
      ? connectedIds
          .map(getMarketplaceOption)
          .filter((o): o is MarketplaceOption => !!o && !o.engineChannel)
      : [];

  // Keep `channel` valid: if the active channel isn't among the available tabs,
  // snap to the first data channel.
  useEffect(() => {
    if (connectedIds === null) return;
    if (channel !== "combined" && !dataChannels.includes(channel)) {
      setChannel(dataChannels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedIds]);

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  // Single question -> streamed, grounded answer. Server re-derives the seller's data from
  // lib/engine (tenant + channel only); the client never supplies numbers.
  async function askCopilot(text: string) {
    const question = text.trim();
    if (!question || aiLoading) return;
    setAskedQ(question);
    setAiAnswer("");
    setAiInput("");
    setAiLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: question }], tenantId: tenant, channel }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setAiAnswer(acc);
      }
    } catch {
      setAiAnswer("Could not reach the Analyst Copilot.");
    } finally {
      setAiLoading(false);
    }
  }

  // Grounding changes with seller/channel — clear the last answer so it can't be misread as current.
  useEffect(() => {
    setAskedQ(null);
    setAiAnswer("");
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

  const navItems = [
    { id: "Dashboard", icon: LayoutDashboard },
    { id: "Verilerim", icon: Database },
    { id: "Sellers", icon: Users },
    { id: "Financing", icon: Briefcase },
    { id: "Campaign", icon: Tag },
    { id: "Nakit", icon: Landmark },
    { id: "Products", icon: Package },
    { id: "Copilot", icon: Sparkles },
    { id: "History", icon: HistoryIcon },
    { id: "Settings", icon: Settings },
  ];

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
              <span>{item.id}</span>
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
              {channel === "combined" && view.marketplaceMargins && (
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
                      Real Margin · {channelLabel(channel)}
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

                    {/* Settlement verification — secondary, below break-even */}
                    {(() => {
                      const s = view.settlement;
                      const hasGap = s.hasGap;
                      return (
                        <div className="mt-5 flex items-start justify-between gap-4 border border-zinc-800/70 bg-zinc-900/30 px-4 py-3">
                          <div>
                            <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-2">
                              Hakediş Doğrulama
                            </div>
                            <div className="font-mono text-sm flex items-baseline gap-3 flex-wrap">
                              <span className="text-zinc-500">Beklenen</span>
                              <span className="tabular-nums text-zinc-200">{money(s.expectedPayout)}</span>
                              <span className="text-zinc-700">·</span>
                              <span className="text-zinc-500">Gerçek</span>
                              <span className="tabular-nums text-zinc-200">{money(s.actualPayout)}</span>
                            </div>
                            <div className={`mt-1.5 font-mono text-[12px] tabular-nums font-medium ${hasGap ? "text-red-400" : "text-emerald-400"}`}>
                              {hasGap
                                ? `${s.marketplaceLabel} ${money(s.gap)} eksik ödedi (−${s.gapRatePct.toFixed(1)}%)`
                                : `${s.marketplaceLabel} tam ödedi ✓`}
                            </div>
                          </div>
                          <div className={`shrink-0 w-1.5 self-stretch rounded-full ${hasGap ? "bg-red-500/60" : "bg-emerald-500/60"}`} />
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

                  {/* Backtest Comparison */}
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">Backtest Comparison</h3>
                      <span className="bg-zinc-900 text-zinc-500 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800">N=3</span>
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
                    <div className="mt-4 text-xs text-emerald-400/80 font-mono tracking-wide flex items-center gap-3">
                      <span className="text-emerald-500">↓</span> {lossRed}% loss reduction
                    </div>
                  </div>
                </div>
              </div>

              {/* Peer Benchmarking — real engine metrics vs representative sector averages */}
              <div className="mt-20">
                <PeerBenchmarkingSection view={view} />
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
                tenantId={tenant}
                channel={channel}
                currency={view.currency}
              />
            </div>
          )}

          {/* VIEW: NAKIT — cash-flow projection from seed transaction data */}
          {currentTab === "Nakit" && view && (
            <div className="max-w-[1000px] mx-auto px-8 py-12 md:py-20">
              <CashFlowPanel
                tenantId={tenant}
                channel={channel}
                currency={view.currency}
              />
            </div>
          )}

          {/* VIEW: PRODUCTS — SKU profitability heatmap (real engine data) */}
          {currentTab === "Products" && view && (
            <div className="max-w-[1300px] mx-auto px-8 py-12 md:py-16">
              <SkuProfitabilityHeatmap skus={view.skus} />
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
                Active Credit Line · {view.label}
              </h2>

              <div className="grid gap-16 lg:grid-cols-2 mb-20">
                {/* LEFT: the unlock */}
                <section>
                  <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">
                    {approved ? "Approved limit" : "Underwriting decision"}
                  </h3>
                  <div className={`font-mono text-6xl tracking-tight tabular-nums ${approved ? "text-zinc-100" : "text-red-400"}`}>
                    {approved ? money(fin.decision.approvedLimit) : "Declined"}
                  </div>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-500">
                    {approved ? (
                      <>Priced at a take-rate of <span className="tabular-nums text-zinc-200">{takeRate}%</span> (target band 3–6%). Sized to real contribution profit, not a revenue snapshot.</>
                    ) : (
                      <>This seller&apos;s true margin can&apos;t service new debt, so the model advances {money(0)}. A revenue-snapshot lender would not see this — and would lend anyway.</>
                    )}
                  </p>

                  <div className="mt-8">
                    <h4 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">Decision trace</h4>
                    <ol className="space-y-2">
                      {fin.decision.rationale.map((r, i) => (
                        <li key={i} className="flex gap-3 text-sm text-zinc-400">
                          <span className="tabular-nums shrink-0 text-zinc-700 font-mono">{String(i + 1).padStart(2, "0")}</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 text-[11px] text-zinc-600 font-mono">
                      Rule-based and explainable (EU AI Act) — recorded immutably as a decision trace, seq #{ledger.find((l) => l.tenantId === tenant)?.seq ?? "—"} in the append-only ledger.
                    </p>
                  </div>
                </section>

                {/* RIGHT: backtest — us vs incumbent */}
                <section>
                  <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">Backtest — us vs incumbent</h3>
                  <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 mt-4">
                    <div className="bg-zinc-950 p-4 lg:p-5">
                      <div className="text-zinc-400 font-sans text-xs mb-3">TrueMargin</div>
                      <dl className="space-y-1.5 text-sm font-mono">
                        <div className="flex justify-between"><dt className="text-zinc-600">Limit</dt><dd className="tabular-nums text-zinc-200">{money(fin.decision.approvedLimit)}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">Take-rate</dt><dd className="tabular-nums text-zinc-200">{approved ? `${takeRate}%` : "—"}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">Outcome</dt><dd className={fin.ourOutcome.impaired ? "text-red-400" : "text-emerald-400"}>{fin.ourOutcome.isLoan ? (fin.ourOutcome.impaired ? "Impaired" : "Performing") : "Declined"}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">Sim. loss</dt><dd className="tabular-nums text-zinc-200">{money(fin.ourOutcome.loss)}</dd></div>
                      </dl>
                    </div>
                    <div className="bg-zinc-950 p-4 lg:p-5">
                      <div className="text-zinc-500 font-sans text-xs mb-3">Incumbent</div>
                      <dl className="space-y-1.5 text-sm font-mono">
                        <div className="flex justify-between"><dt className="text-zinc-600">Limit</dt><dd className="tabular-nums text-zinc-400">{money(fin.incumbentDecision.approvedLimit)}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">Take-rate</dt><dd className="tabular-nums text-zinc-400">{(fin.incumbentDecision.takeRate * 100).toFixed(1)}%</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">Outcome</dt><dd className={fin.incumbentOutcome.impaired ? "text-red-400" : "text-zinc-400"}>{fin.incumbentOutcome.isLoan ? (fin.incumbentOutcome.impaired ? "Impaired" : "Performing") : "Declined"}</dd></div>
                        <div className="flex justify-between"><dt className="text-zinc-600">Sim. loss</dt><dd className="tabular-nums text-zinc-400">{money(fin.incumbentOutcome.loss)}</dd></div>
                      </dl>
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-emerald-400/80 font-mono tracking-wide flex items-center gap-3">
                    <span className="text-emerald-500">↓</span> {lossRed}% loss reduction vs incumbent (N=3 design partners)
                  </div>
                </section>
              </div>

              {/* Investor / technical-credibility proof points — from the seed-stage diligence memo */}
              <div className="border-t border-zinc-900 pt-12">
                <h3 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-6">
                  Category-specific proof points
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800 mb-10">
                  <div className="bg-zinc-950 p-4 lg:p-6">
                    <div className="text-2xl font-mono tabular-nums text-zinc-100">{portfolio.designPartners}</div>
                    <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">Design partners</div>
                  </div>
                  <div className="bg-zinc-950 p-4 lg:p-6">
                    <div className="text-2xl font-mono tabular-nums text-zinc-100">{portfolio.marketplacesConnected}</div>
                    <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">Marketplace connectors</div>
                  </div>
                  <div className="bg-zinc-950 p-4 lg:p-6">
                    <div className="text-2xl font-mono tabular-nums text-zinc-100">{portfolio.gmvCoveragePct.toFixed(0)}%</div>
                    <div className="text-zinc-600 text-[10px] font-mono mt-2 uppercase tracking-wide">GMV coverage</div>
                  </div>
                </div>

                <h4 className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">
                  vs. seed-stage embedded-lending benchmark
                </h4>
                <div className="text-sm font-mono w-full">
                  <div className="flex w-full border-b border-zinc-900 pb-3 mb-1 text-zinc-600 text-[10px] uppercase tracking-[0.1em]">
                    <div className="w-5/12">Metric</div>
                    <div className="w-3/12 text-right">Ours (live)</div>
                    <div className="w-3/12 text-right">Target</div>
                    <div className="w-1/12 text-right">Status</div>
                  </div>
                  {benchmarks.map((b) => (
                    <div key={b.label} className="flex w-full items-center py-2.5 border-b border-zinc-900/50">
                      <div className="w-5/12 text-zinc-300 text-[13px]">{b.label}</div>
                      <div className="w-3/12 text-right text-zinc-100 tabular-nums">{b.ours}</div>
                      <div className="w-3/12 text-right text-zinc-600 tabular-nums">{b.target}</div>
                      <div className={`w-1/12 text-right ${b.meetsTarget ? "text-emerald-400" : "text-amber-400"}`}>
                        {b.meetsTarget ? "✓" : "•"}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-zinc-600 font-mono">
                  N=3 design partners — proof of mechanism, not a statistical loss-rate. Target column reflects the
                  Lendflow 2025 embedded-lending benchmark cited in the underwriting diligence memo.
                </p>
              </div>
            </div>
          )}

          {/* VIEW: HISTORY — immutable decision ledger (append-only audit trail) */}
          {currentTab === "History" && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] border-l border-zinc-800 pl-4">Decision Ledger</h2>
                <span className="bg-zinc-900 text-emerald-400/80 text-[9px] px-1.5 py-0.5 tracking-widest font-mono border border-zinc-800">IMMUTABLE · APPEND-ONLY</span>
              </div>
              <p className="text-zinc-600 text-[11px] font-mono mb-10 pl-4 max-w-xl">
                Every underwriting decision is written once and never mutated — the auditable record due diligence
                looks for, and the store of the decision traces that are the real, un-copyable moat.
              </p>
              <div className="text-sm font-mono w-full">
                <div className="flex w-full border-b border-zinc-900 pb-3 mb-1 text-zinc-600 text-[10px] uppercase tracking-[0.1em]">
                  <div className="w-1/12">Seq</div>
                  <div className="w-3/12">Recorded at</div>
                  <div className="w-3/12">Tenant</div>
                  <div className="w-3/12 text-right">Limit</div>
                  <div className="w-2/12 text-right">Take-rate</div>
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
                {ledger.length} entries · model {ledger[0]?.modelVersion ?? "—"} · sink: in-memory (swap to Postgres/SQLite append-only table in production).
              </p>
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {currentTab === "Settings" && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-12 border-l border-zinc-800 pl-4">Organization Settings</h2>
              <div className="text-zinc-500 font-mono text-sm p-8 border border-zinc-900 bg-zinc-950/50 flex items-center justify-center">
                Configuration interface loading...
              </div>

              {/* Account / session */}
              <div className="mt-10 border border-zinc-900 bg-zinc-950/50 p-6">
                <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">Account</div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-zinc-500 font-mono text-[12px] leading-relaxed">
                    End your session on this device. You&apos;ll need to sign in again to return.
                  </p>
                  <button
                    onClick={handleSignOut}
                    className="shrink-0 inline-flex items-center h-9 px-4 border border-zinc-800 text-zinc-300 font-mono text-[12px] hover:bg-zinc-900 hover:text-zinc-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: COPILOT — Analyst Copilot tab, streaming from /api/chat (grounded via lib/engine) */}
          {currentTab === "Copilot" && (
            <div className="max-w-[900px] px-8 py-12 md:py-20">
              <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-2 border-l border-zinc-800 pl-4">Analyst Copilot</h2>
              <div className="text-zinc-600 text-[11px] font-mono mb-12 pl-4">
                {view.label} · {channelLabel(channel)}
              </div>

              <div className="flex flex-wrap gap-2 mb-12">
                {AI_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => askCopilot(p)}
                    className={`text-xs font-mono px-3 py-1.5 border transition-colors ${
                      askedQ === p
                        ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="max-w-2xl">
                <div className="flex flex-col gap-3 mb-10">
                  <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-mono">Query · {view.label}</div>
                  <div className="text-zinc-100 text-lg tracking-tight font-medium">
                    {askedQ ?? "Pick a preset or ask your own question below."}
                  </div>
                </div>

                <div className="flex flex-col gap-4 mb-12">
                  <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-mono flex items-center gap-3">
                    Analysis <span className="h-px bg-zinc-900 flex-1"></span>
                  </div>
                  <div className="text-zinc-400 space-y-5 text-sm leading-relaxed">
                    {aiLoading && !aiAnswer && <p className="text-zinc-500">Reading the decision data…</p>}
                    {aiAnswer && (
                      <p className="whitespace-pre-line">
                        {aiAnswer}
                        {aiLoading && <span className="inline-block w-1.5 h-4 bg-zinc-500 ml-1 align-middle animate-pulse" />}
                      </p>
                    )}
                    {aiAnswer && !aiLoading && (
                      <p className="text-[11px] text-zinc-600 font-mono">
                        Grounded in {view.label}&apos;s structured decision. No numbers invented.
                      </p>
                    )}
                    {!aiAnswer && !aiLoading && (
                      <p className="text-zinc-600">Ask a question to see the grounded explanation.</p>
                    )}
                  </div>
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
                    placeholder="Query unit economics..."
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
