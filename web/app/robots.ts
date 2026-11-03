import type { MetadataRoute } from "next";
import { getSetting, DEFAULT_SEO, type Seo } from "@/lib/settings";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getSetting<Seo>("seo", DEFAULT_SEO);
  const origin = (() => { try { return new URL(seo.canonical).origin; } catch { return "https://www.nextedge-access-solutions.com"; } })();
  return { rules: seo.robotsIndex ? [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/"] }] : [{ userAgent: "*", disallow: "/" }], sitemap: `${origin}/sitemap.xml` };
}
