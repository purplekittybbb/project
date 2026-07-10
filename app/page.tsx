/**
 * ROOT LANDING PAGE (/)
 *
 * ⚠️  CRITICAL: This file renders ONLY the public landing page. Do NOT add dashboard,
 * demo, seed data, or any authenticated content here.
 *
 * Route contract:
 * - "/" ALWAYS renders this page, regardless of login status
 * - No redirects based on auth state
 * - Navigation links: "Sign in" → /login, "Open account" → /signup, "See demo" → /demo
 * - Marketing content only (hero, features, footer, trust strip)
 *
 * Separate routes (do NOT mix):
 * - /demo → seed-data walkthrough (unauthenticated, no login required)
 * - /dashboard → authenticated user panel (login required, user data only)
 * - /connect → post-signup onboarding (login required, new users only)
 * - /login → sign-in page
 * - /signup → account creation
 */

import { SiteNav } from '@/components/site-nav'
import { Hero } from '@/components/hero'
import { TrustStrip } from '@/components/trust-strip'
import { Features } from '@/components/features'
import { SiteFooter } from '@/components/site-footer'

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main>
        <Hero />
        <TrustStrip />
        <Features />
      </main>
      <SiteFooter />
    </div>
  )
}
