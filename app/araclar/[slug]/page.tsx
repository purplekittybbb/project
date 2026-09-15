import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ToolDiscoverMore } from "@/components/marketing/tool-discover-more";
import { ProfitCalculator } from "@/components/tools/profit-calculator";
import { StandaloneToolRunner } from "@/components/tools/standalone-tool-runner";
import { StoreToolRouter } from "@/components/tools/store-tool-router";
import { getToolBySlug, type StandaloneToolId } from "@/lib/tools/registry";
import { pageMetadata } from "@/lib/seo";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const { ALL_TOOLS } = await import("@/lib/tools/registry");
  return ALL_TOOLS.map((t) => ({ slug: t.slug }));
}

// Each of the 13 tool pages is a distinct acquisition-funnel landing page
// (free-tool SEO pages like "trendyol net kar hesaplama") — before this they
// all silently inherited the homepage's <title>/description from the root
// layout, so none of them could rank or preview correctly on their own.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) return {};
  return pageMetadata({
    title: tool.title,
    description: tool.description,
    path: `/araclar/${slug}`,
  });
}

export default async function AracPage({ params }: PageProps) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) notFound();

  return (
    <MarketingPage>
      <section className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-24">
        {tool.category === "standalone" && tool.id === "profit-calc" ? (
          <ProfitCalculator />
        ) : tool.category === "standalone" ? (
          <StandaloneToolRunner
            toolId={tool.id as StandaloneToolId}
            title={tool.title}
            description={tool.description}
          />
        ) : (
          <StoreToolRouter tool={tool} />
        )}
        <ToolDiscoverMore currentSlug={slug} />
      </section>
    </MarketingPage>
  );
}
