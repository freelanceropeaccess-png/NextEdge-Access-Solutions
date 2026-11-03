import { requireAdmin } from "@/lib/admin";
import { setSetting, cleanText, cleanUrl, DEFAULT_SEO, DEFAULT_SOCIAL, DEFAULT_BUSINESS } from "@/lib/settings";
import { bad, ok } from "@/lib/http";

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return bad("Admin access required.", 403);
  const b = await req.json().catch(() => ({}));
  if (b.seo) {
    const s = b.seo;
    const ga = cleanText(s.gaMeasurementId, 20);
    if (ga && !/^G-[A-Z0-9]{4,15}$/.test(ga)) return bad("Google Analytics ID must look like G-XXXXXXXXXX.");
    await setSetting("seo", {
      title: cleanText(s.title, 70) || DEFAULT_SEO.title,
      description: cleanText(s.description, 170) || DEFAULT_SEO.description,
      keywords: cleanText(s.keywords, 400),
      ogImage: s.ogImage?.startsWith?.("/img/") ? cleanText(s.ogImage, 200) : cleanUrl(s.ogImage) || DEFAULT_SEO.ogImage,
      canonical: cleanUrl(s.canonical) || DEFAULT_SEO.canonical,
      googleVerification: cleanText(s.googleVerification, 120).replace(/[^A-Za-z0-9_\-]/g, ""),
      bingVerification: cleanText(s.bingVerification, 120).replace(/[^A-Za-z0-9_\-]/g, ""),
      gaMeasurementId: ga,
      robotsIndex: s.robotsIndex !== false,
    });
  }
  if (b.social) {
    const out: Record<string, string> = {};
    for (const k of Object.keys(DEFAULT_SOCIAL)) out[k] = cleanUrl(b.social[k]);
    await setSetting("social", out);
  }
  if (b.business) {
    const out: Record<string, string> = {};
    for (const k of Object.keys(DEFAULT_BUSINESS)) out[k] = cleanText(b.business[k], 200);
    await setSetting("business", out);
  }
  return ok();
}
