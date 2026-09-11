import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export function MarketingPage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
