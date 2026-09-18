/**
 * ROOT LANDING PAGE (/)
 *
 * nesatilir-style section order: hero → social proof → connect → tools → pricing preview.
 */

import { MarketingPage } from "@/components/marketing/marketing-page";
import { HomepageToolsSection } from "@/components/marketing/homepage-tools-section";
import { IntegrationBanner } from "@/components/marketing/integration-banner";
import { PricingPreview } from "@/components/marketing/pricing-preview";
import { SocialProofBand } from "@/components/marketing/social-proof-band";
import { TestimonialsSection } from "@/components/marketing/testimonials-section";
import { Hero } from "@/components/hero";

export default function Page() {
  return (
    <MarketingPage>
      <Hero />
      <SocialProofBand />
      <IntegrationBanner />
      <HomepageToolsSection />
      <TestimonialsSection />
      <PricingPreview />
    </MarketingPage>
  );
}
