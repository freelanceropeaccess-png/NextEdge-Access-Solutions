import { sql } from "./db";

export type Seo = {
  title: string; description: string; keywords: string; ogImage: string; canonical: string;
  googleVerification: string; bingVerification: string; gaMeasurementId: string; robotsIndex: boolean;
};
export type Social = {
  googleBusiness: string; googleMaps: string; googleReview: string; facebook: string; instagram: string; linkedin: string;
  youtube: string; tiktok: string; x: string;
};
export type Business = { name: string; phone: string; email: string; street: string; city: string; region: string; postal: string; country: string; hours: string };

export const DEFAULT_SEO: Seo = {
  title: "NEAS — IRATA Rope Access & Height Safety, Philippines",
  description: "IRATA-certified rope access, NDT inspection, facade, telecom, met mast and wind turbine services, plus certified PPE supply. Serving the Philippines and Asia.",
  keywords: "rope access Philippines, IRATA, NDT inspection, facade cleaning, wind turbine blade repair, met mast, telecom tower, PPE supplier, Skylotec, NEAS",
  ogImage: "/img/hero-city.jpg", canonical: "https://www.nextedge-access-solutions.com/",
  googleVerification: "", bingVerification: "", gaMeasurementId: "", robotsIndex: true,
};
export const DEFAULT_SOCIAL: Social = {
  googleBusiness: "", googleMaps: "", googleReview: "",
  facebook: "https://www.facebook.com/NextEdgeAccessSolutionss",
  instagram: "https://www.instagram.com/nextedgeaccesssolutions",
  linkedin: "https://www.linkedin.com/company/nextedge-access-solutions-neas",
  youtube: "https://www.youtube.com/@NextEdgeAccessSolutions",
  tiktok: "https://www.tiktok.com/@nextedgeaccesssolutions",
  x: "",
};
export const DEFAULT_BUSINESS: Business = {
  name: "NextEdge Access Solutions. (NEAS) OPC", phone: "+63 991 426 5886", email: "info.nextedgeaccesssolutions@gmail.com",
  street: "", city: "", region: "", postal: "", country: "PH", hours: "Mo-Su 00:00-23:59",
};

export async function getSetting<T extends object>(key: string, fallback: T): Promise<T> {
  try {
    const rows = await sql`select value from settings where key = ${key}`;
    if (!rows[0]) return fallback;
    const v = JSON.parse(rows[0].value);
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch { return fallback; }
}
export async function setSetting(key: string, value: unknown) {
  await sql`insert into settings (key, value) values (${key}, ${JSON.stringify(value)}) on conflict (key) do update set value = excluded.value`;
}
export async function getCategoryMarkup(): Promise<Record<string, number>> {
  try {
    const rows = await sql`select value from settings where key = 'category_markup'`;
    const v = rows[0] ? JSON.parse(rows[0].value) : {};
    return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === "number" && n >= 0 && n <= 500)) as Record<string, number>;
  } catch { return {}; }
}

/** Only http(s) links, max 500 chars. */
export function cleanUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim().slice(0, 500);
  if (!t) return "";
  try { const u = new URL(t); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : ""; } catch { return ""; }
}
export function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
}
