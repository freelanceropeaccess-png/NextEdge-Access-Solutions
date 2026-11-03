import type { MetadataRoute } from "next";
import { getSetting, DEFAULT_SEO, type Seo } from "@/lib/settings";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSetting<Seo>("seo", DEFAULT_SEO);
  const origin = (() => { try { return new URL(seo.canonical).origin; } catch { return "https://www.nextedge-access-solutions.com"; } })();
  const now = new Date();
  return [{ url: `${origin}/`, lastModified: now, priority: 1 }, { url: `${origin}/store`, lastModified: now, priority: 0.9 }, { url: `${origin}/login`, lastModified: now, priority: 0.3 }];
}
