import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/demo", "/login", "/signup"],
        disallow: ["/dashboard", "/connect", "/api/", "/reveal/", "/financing/"],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
