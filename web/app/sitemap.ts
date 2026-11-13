import type { MetadataRoute } from "next";
import { getSetting, DEFAULT_SEO, type Seo } from "@/lib/settings";
import { listProducts } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSetting<Seo>("seo", DEFAULT_SEO);
  const origin = (() => { try { return new URL(seo.canonical).origin; } catch { return "https://www.nextedge-access-solutions.com"; } })();
  const now = new Date();
  return [{ url: `${origin}/`, lastModified: now, priority: 1 }, ...["home", "about", "services", "partners", "contact"].map((slug) => ({ url: `${origin}/${slug}`, lastModified: now, priority: slug === "home" ? 0.95 : 0.8 })), { url: `${origin}/store`, lastModified: now, priority: 0.9 }, { url: `${origin}/login`, lastModified: now, priority: 0.3 }, { url: `${origin}/privacy-policy`, lastModified: now, priority: 0.3 },
    ...(await listProducts().catch(() => [])).map((p) => ({ url: `${origin}/store/p/${p.id}`, lastModified: now, priority: 0.7 }))];
}
