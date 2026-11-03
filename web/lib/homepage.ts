import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSetting, DEFAULT_SEO, DEFAULT_SOCIAL, DEFAULT_BUSINESS, type Seo, type Social, type Business } from "./settings";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let cached: string | null = null;

export async function renderHomepage(): Promise<string> {
  cached ??= await readFile(path.join(process.cwd(), "site", "home.html"), "utf8");
  let html = cached;
  const [seo, social, biz] = await Promise.all([
    getSetting<Seo>("seo", DEFAULT_SEO), getSetting<Social>("social", DEFAULT_SOCIAL), getSetting<Business>("business", DEFAULT_BUSINESS),
  ]);
  const origin = (() => { try { return new URL(seo.canonical).origin; } catch { return "https://www.nextedge-access-solutions.com"; } })();
  const ogImage = seo.ogImage.startsWith("/") ? origin + seo.ogImage : seo.ogImage;
  const sameAs = [social.facebook, social.instagram, social.linkedin, social.youtube, social.tiktok, social.x, social.googleBusiness].filter(Boolean);
  const ld = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: biz.name, url: seo.canonical, image: ogImage,
    logo: origin + "/img/logo.png", telephone: biz.phone, email: biz.email, description: seo.description,
    ...(biz.street || biz.city ? { address: { "@type": "PostalAddress", streetAddress: biz.street, addressLocality: biz.city, addressRegion: biz.region, postalCode: biz.postal, addressCountry: biz.country } } : {}),
    ...(biz.hours ? { openingHours: biz.hours } : {}),
    ...(social.googleMaps ? { hasMap: social.googleMaps } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
  const head = [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}">`,
    seo.keywords && `<meta name="keywords" content="${esc(seo.keywords)}">`,
    `<link rel="canonical" href="${esc(seo.canonical)}">`,
    `<meta name="robots" content="${seo.robotsIndex ? "index,follow" : "noindex,nofollow"}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(biz.name)}">`,
    `<meta property="og:title" content="${esc(seo.title)}"><meta property="og:description" content="${esc(seo.description)}">`,
    `<meta property="og:url" content="${esc(seo.canonical)}"><meta property="og:image" content="${esc(ogImage)}">`,
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(seo.title)}"><meta name="twitter:description" content="${esc(seo.description)}"><meta name="twitter:image" content="${esc(ogImage)}">`,
    seo.googleVerification && `<meta name="google-site-verification" content="${esc(seo.googleVerification)}">`,
    seo.bingVerification && `<meta name="msvalidate.01" content="${esc(seo.bingVerification)}">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
    seo.gaMeasurementId && `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(seo.gaMeasurementId)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(seo.gaMeasurementId)}');</script>`,
  ].filter(Boolean).join("\n");
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/, "").replace(/<meta name="description"[^>]*>\s*/, "");
  html = html.replace("</head>", head + "\n</head>");
  // social links in the side panel
  const map: [string, string][] = [["Facebook", social.facebook], ["LinkedIn", social.linkedin], ["YouTube", social.youtube], ["Instagram", social.instagram], ["TikTok", social.tiktok]];
  for (const [title, url] of map) {
    const re = new RegExp(`(<a class="side-social" href=")[^"]*(" [^>]*title="${title}")`);
    html = url ? html.replace(re, `$1${esc(url)}$2`) : html.replace(new RegExp(`<a class="side-social"[^>]*title="${title}"[\\s\\S]*?</a>`), "");
  }
  const extra = [
    social.googleBusiness && `<a class="side-social" href="${esc(social.googleBusiness)}" target="_blank" rel="noopener" title="Google Business"><b style="font:700 15px/1 Arial">G</b></a>`,
    social.x && `<a class="side-social" href="${esc(social.x)}" target="_blank" rel="noopener" title="X"><b style="font:700 15px/1 Arial">𝕏</b></a>`,
  ].filter(Boolean).join("");
  if (extra) html = html.replace(/(<a class="side-social"[^>]*title="TikTok"[\s\S]*?<\/a>)/, `$1${extra}`);
  if (social.googleReview) html = html.replace('<div class="footer-bottom">', `<div style="text-align:center;margin:0 0 14px"><a href="${esc(social.googleReview)}" target="_blank" rel="noopener" style="display:inline-block;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:999px;padding:8px 16px;font-weight:700;font-size:13px;text-decoration:none">⭐ Review us on Google</a></div><div class="footer-bottom">`);
  return html;
}
