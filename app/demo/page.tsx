import { DashboardPage } from "@/app/dashboard/page";

/**
 * Public investor / sales walkthrough — seed sellers only, no Supabase, no AuthGuard.
 * Marketplace→Credit thesis: show working underwriting backtest without offering
 * unlicensed credit to real signed-in sellers (those stay on /dashboard).
 */
export default function DemoPage() {
  return <DashboardPage demoMode />;
}
