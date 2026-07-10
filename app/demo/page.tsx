/**
 * PUBLIC DEMO PAGE (/demo)
 *
 * ⚠️  CRITICAL: This file renders ONLY the public demo (seed data walkthrough).
 * No login required. Always shows Seller A/B/C, never real user data.
 *
 * Route contract:
 * - /demo is ALWAYS accessible (no auth check)
 * - NEVER redirects to /login or /dashboard
 * - ONLY renders seed-data sellers (Seller A, Seller B, Seller C)
 * - demoMode=true prevents any user-data loading or Supabase access
 *
 * Separate routes (do NOT mix):
 * - / → landing page (marketing content)
 * - /dashboard → authenticated user panel (login required)
 * - /connect → post-signup onboarding (login required)
 */

import { DashboardPage } from "@/app/dashboard/page";

export default function DemoPage() {
  return <DashboardPage demoMode />;
}
